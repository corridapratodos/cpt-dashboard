import { getServerSession } from 'next-auth'
import { hasAdminAccess } from '@/lib/access'
import { getActivityYear, rebuildYearActivityCaches } from '@/lib/activity-cache'
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

export async function POST() {
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
  const colRef = activitiesRef(session.stravaId)
  const snapshot = await colRef
    .orderBy('date', 'desc')
    .limit(BATCH_LIMIT * 4)
    .get()

  const candidates = snapshot.docs.filter((doc) => isEligibleForBestEfforts(doc.data()))
  const limited = candidates.slice(0, BATCH_LIMIT)
  const workerCount = Math.min(CONCURRENCY, limited.length)
  const workerBatches = Array.from({ length: workerCount }, () => [] as typeof limited)
  const touchedYears = new Set<string>()
  let enrichedCount = 0
  let errorCount = 0

  limited.forEach((doc, index) => {
    workerBatches[index % workerCount]?.push(doc)
  })

  await Promise.all(
    workerBatches.map(async (batch) => {
      for (const doc of batch) {
        try {
          const stravaId = Number(doc.data().stravaId)
          const detail = await fetchActivity(accessToken, stravaId)
          const bestEfforts = extractBestEfforts(detail)

          if (bestEfforts.length) {
            await doc.ref.set({ bestEfforts }, { merge: true })
            const year = getActivityYear(doc.data().localDate ?? doc.data().date)
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
    rebuiltYears: [...touchedYears].sort((a, b) => Number(b) - Number(a)),
  })
}
