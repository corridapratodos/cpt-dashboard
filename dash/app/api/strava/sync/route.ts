import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchActivities, isRealRun, mapActivity } from '@/lib/strava'
import { activitiesRef, metaRef } from '@/lib/firebase'

// POST /api/strava/sync - full backfill uma vez; incremental nas proximas sincronizacoes
export async function POST() {
  const session = await getServerSession(authOptions)

  if (!session?.accessToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const colRef = activitiesRef(session.stravaId)
  const [latestSnap, metaSnap] = await Promise.all([
    colRef.orderBy('date', 'desc').limit(1).get(),
    metaRef(session.stravaId).get(),
  ])

  const metaData = metaSnap.exists ? metaSnap.data() : null
  const historicalBackfillCompleted = metaData?.historicalBackfillCompleted === true

  const latestSavedDate = latestSnap.empty
    ? null
    : latestSnap.docs[0].data().date?.toDate?.() ?? latestSnap.docs[0].data().date ?? null

  const incrementalAfter = latestSavedDate instanceof Date
    ? Math.floor(latestSavedDate.getTime() / 1000)
    : latestSavedDate
      ? Math.floor(new Date(latestSavedDate).getTime() / 1000)
      : undefined

  const shouldRunIncremental = historicalBackfillCompleted && incrementalAfter != null
  const after = shouldRunIncremental ? incrementalAfter : undefined

  const incoming = await fetchActivities(session.accessToken, after)
  const mappedActivities = incoming.map(mapActivity)
  const validRuns = incoming.filter(isRealRun)

  for (let i = 0; i < mappedActivities.length; i += 500) {
    const batch = colRef.firestore.batch()

    mappedActivities.slice(i, i + 500).forEach((activity) => {
      batch.set(colRef.doc(String(activity.stravaId)), activity, { merge: true })
    })

    await batch.commit()
  }

  const totalsByType = shouldRunIncremental
    ? (() => {
        const baseTotals = metaData?.totalsByType ?? {}
        const nextTotals = { ...baseTotals }
        mappedActivities.forEach((activity) => {
          nextTotals[activity.type] = (nextTotals[activity.type] ?? 0) + 1
        })
        return nextTotals
      })()
    : mappedActivities.reduce<Record<string, number>>((acc, activity) => {
        acc[activity.type] = (acc[activity.type] ?? 0) + 1
        return acc
      }, {})

  await metaRef(session.stravaId).set({
    lastSync: new Date(),
    lastSyncMode: shouldRunIncremental ? 'incremental' : 'full',
    lastIncrementalAfter: shouldRunIncremental ? incrementalAfter ?? null : null,
    totalActivities: shouldRunIncremental
      ? (metaData?.totalActivities ?? 0) + mappedActivities.length
      : mappedActivities.length,
    totalRuns: shouldRunIncremental
      ? (metaData?.totalRuns ?? 0) + validRuns.length
      : validRuns.length,
    totalsByType,
    newestActivityAt: mappedActivities[0]?.date ?? latestSavedDate ?? null,
    historicalBackfillCompleted: true,
  }, { merge: true })

  return Response.json({
    synced: mappedActivities.length,
    runs: validRuns.length,
    mode: shouldRunIncremental ? 'incremental' : 'full',
    after: shouldRunIncremental ? incrementalAfter ?? null : null,
    historicalBackfillCompleted: true,
  })
}
