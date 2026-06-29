import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { hasAdminAccess } from '@/lib/access'
import { activitiesRef, metaRef, userRef } from '@/lib/firebase'
import { extractBestEfforts, fetchActivity } from '@/lib/strava'

const RUN_LIKE_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun'])
const BATCH_LIMIT = 60
const CONCURRENCY = 3

function isEligibleForBestEfforts(data: Record<string, unknown>) {
  const type = String(data.type ?? '')
  const distanceKm = Number(data.distanceKm ?? 0)
  const durationSec = Number(data.durationSec ?? 0)

  return RUN_LIKE_TYPES.has(type) && distanceKm >= 3 && durationSec >= 20 * 60
}

function hasBestEfforts(data: Record<string, unknown>) {
  return Array.isArray(data.bestEfforts) && data.bestEfforts.length > 0
}

export async function POST() {
  const session = await getServerSession(authOptions)

  if (!session?.accessToken || !session?.stravaId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userSnap = await userRef(session.stravaId).get()
  const userData = userSnap.exists ? userSnap.data() : null

  if (!hasAdminAccess(session.stravaId, userData)) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const colRef = activitiesRef(session.stravaId)
  const snapshot = await colRef.orderBy('date', 'desc').get()

  const candidates = snapshot.docs.filter((doc) => {
    const data = doc.data()
    return isEligibleForBestEfforts(data) && !hasBestEfforts(data)
  })

  const limited = candidates.slice(0, BATCH_LIMIT)
  let enrichedCount = 0
  let errorCount = 0
  let cursor = 0

  async function worker() {
    while (cursor < limited.length) {
      const doc = limited[cursor]
      cursor += 1

      try {
        const stravaId = Number(doc.data().stravaId)
        const detail = await fetchActivity(session!.accessToken!, stravaId)
        const bestEfforts = extractBestEfforts(detail)

        if (bestEfforts.length) {
          await doc.ref.set({ bestEfforts }, { merge: true })
          enrichedCount += 1
        }
      } catch {
        errorCount += 1
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, limited.length) }, () => worker())
  )

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
  })
}
