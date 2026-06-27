import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchActivities, isRealRun, mapActivity } from '@/lib/strava'
import { activitiesRef, metaRef } from '@/lib/firebase'

// POST /api/strava/sync - sincroniza historico completo na primeira carga e incremental depois disso
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

  const latestSavedDate = latestSnap.empty
    ? null
    : latestSnap.docs[0].data().date?.toDate?.() ?? latestSnap.docs[0].data().date ?? null

  const after = latestSavedDate instanceof Date
    ? Math.floor(latestSavedDate.getTime() / 1000)
    : latestSavedDate
      ? Math.floor(new Date(latestSavedDate).getTime() / 1000)
      : undefined

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

  const baseTotals = metaSnap.exists ? metaSnap.data()?.totalsByType ?? {} : {}
  const totalsByType = { ...baseTotals }
  mappedActivities.forEach((activity) => {
    totalsByType[activity.type] = (totalsByType[activity.type] ?? 0) + 1
  })

  await metaRef(session.stravaId).set({
    lastSync: new Date(),
    lastSyncMode: after ? 'incremental' : 'full',
    lastIncrementalAfter: after ?? null,
    totalActivities: (metaSnap.exists ? metaSnap.data()?.totalActivities ?? 0 : 0) + mappedActivities.length,
    totalRuns: (metaSnap.exists ? metaSnap.data()?.totalRuns ?? 0 : 0) + validRuns.length,
    totalsByType,
    newestActivityAt: mappedActivities[0]?.date ?? latestSavedDate ?? null,
  }, { merge: true })

  return Response.json({
    synced: mappedActivities.length,
    runs: validRuns.length,
    mode: after ? 'incremental' : 'full',
    after: after ?? null,
  })
}

