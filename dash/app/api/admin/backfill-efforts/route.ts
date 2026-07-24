import { getServerSession } from 'next-auth'
import { hasAdminAccess } from '@/lib/access'
import { getActivityYear, loadYearActivitiesFromCache, rebuildYearActivityCache, rebuildYearActivityCaches } from '@/lib/activity-cache'
import { isRunLikeType } from '@/lib/activity-types'
import { authOptions } from '@/lib/auth'
import { activitiesRef, metaRef, userRef } from '@/lib/firebase'
import { extractBestEfforts, fetchActivity } from '@/lib/strava'
import { getServerStravaAccessToken } from '@/lib/server-strava-token'

const BATCH_LIMIT = 60
const CONCURRENCY = 3

function hasMissingBestEfforts(data: Record<string, unknown>) {
  return !Array.isArray(data.bestEfforts) || data.bestEfforts.length === 0
}

function isEligibleForBestEfforts(data: Record<string, unknown>) {
  const type = String(data.type ?? '')
  const distanceKm = Number(data.distanceKm ?? 0)
  const durationSec = Number(data.durationSec ?? 0)

  return hasMissingBestEfforts(data) && isRunLikeType(type) && distanceKm >= 3 && durationSec >= 20 * 60
}

type ActivityCollectionRef = ReturnType<typeof activitiesRef>
type BackfillCandidate = {
  stravaId: number
  data: Record<string, unknown>
  ref: ReturnType<ActivityCollectionRef['doc']>
}

async function getRecentCandidates(stravaId: number): Promise<BackfillCandidate[]> {
  const snapshot = await activitiesRef(stravaId)
    .orderBy('date', 'desc')
    .limit(BATCH_LIMIT * 4)
    .get()

  return snapshot.docs
    .filter((doc) => isEligibleForBestEfforts(doc.data()))
    .map((doc) => ({
      stravaId: Number(doc.data().stravaId),
      data: doc.data(),
      ref: doc.ref,
    }))
    .filter((candidate) => Number.isFinite(candidate.stravaId))
}

async function getYearCandidates(stravaId: number, targetYear: string): Promise<BackfillCandidate[]> {
  let cached = await loadYearActivitiesFromCache(stravaId, targetYear)

  if (!cached) {
    await rebuildYearActivityCache(stravaId, targetYear)
    cached = await loadYearActivitiesFromCache(stravaId, targetYear)
  }

  if (!cached) return []

  const colRef = activitiesRef(stravaId)
  return cached.activities
    .map((activity) => ({
      stravaId: Number(activity.stravaId),
      data: activity as unknown as Record<string, unknown>,
      ref: colRef.doc(String(activity.stravaId)),
    }))
    .filter((candidate) => Number.isFinite(candidate.stravaId) && isEligibleForBestEfforts(candidate.data))
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.stravaId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userSnap = await userRef(session.stravaId).get()
  const userData = userSnap.exists ? userSnap.data() : null

  if (!hasAdminAccess(session.stravaId, userData)) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const accessToken = await getServerStravaAccessToken(session.stravaId)
  const url = new URL(req.url)
  const requestedYear = url.searchParams.get('year')
  const targetYear = requestedYear && /^\d{4}$/.test(requestedYear) ? requestedYear : null
  const candidates = targetYear
    ? await getYearCandidates(session.stravaId, targetYear)
    : await getRecentCandidates(session.stravaId)
  const limited = candidates.slice(0, BATCH_LIMIT)
  const workerCount = Math.min(CONCURRENCY, limited.length)
  const workerBatches = Array.from({ length: workerCount }, () => [] as typeof limited)
  const touchedYears = new Set<string>()
  let enrichedCount = 0
  let errorCount = 0

  limited.forEach((candidate, index) => {
    workerBatches[index % workerCount]?.push(candidate)
  })

  await Promise.all(
    workerBatches.map(async (batch) => {
      for (const candidate of batch) {
        try {
          const detail = await fetchActivity(accessToken, candidate.stravaId)
          const bestEfforts = extractBestEfforts(detail)

          if (bestEfforts.length) {
            await candidate.ref.set({ bestEfforts }, { merge: true })
            const dateLike = candidate.data.localDate ?? candidate.data.date
            const year = typeof dateLike === 'string' || dateLike instanceof Date || typeof (dateLike as { toDate?: () => Date })?.toDate === 'function'
              ? getActivityYear(dateLike as string | Date | { toDate?: () => Date })
              : null
            if (year) touchedYears.add(year)
            enrichedCount += 1
          }
        } catch {
          errorCount += 1
        }
      }
    })
  )

  if (touchedYears.size > 0) {
    await rebuildYearActivityCaches(session.stravaId, [...touchedYears])
  }

  await metaRef(session.stravaId).set(
    {
      lastBestEffortBackfillAt: new Date(),
      bestEffortBackfillBatchSize: limited.length,
      bestEffortBackfillEnriched: enrichedCount,
      bestEffortBackfillErrors: errorCount,
      bestEffortBackfillRemaining: Math.max(candidates.length - limited.length, 0),
      ...(targetYear ? { lastBestEffortBackfillYear: targetYear } : {}),
    },
    { merge: true }
  )

  return Response.json({
    ok: true,
    eligible: candidates.length,
    processed: limited.length,
    enriched: enrichedCount,
    errors: errorCount,
    remaining: Math.max(candidates.length - limited.length, 0),
    year: targetYear,
    rebuiltYears: [...touchedYears].sort((a, b) => Number(b) - Number(a)),
  })
}
