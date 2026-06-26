import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchAllActivities, isRealRun, mapActivity } from '@/lib/strava'
import { activitiesRef, metaRef } from '@/lib/firebase'

// POST /api/strava/sync — sincroniza histórico completo
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const all = await fetchAllActivities(session.accessToken)
  const runs = all.filter(isRealRun).map(mapActivity)

  // Salva em batches de 500 (limite Firestore)
  const colRef = activitiesRef(session.stravaId)
  for (let i = 0; i < runs.length; i += 500) {
    const batch = colRef.firestore.batch()
    runs.slice(i, i + 500).forEach((run) => {
      batch.set(colRef.doc(String(run.stravaId)), run, { merge: true })
    })
    await batch.commit()
  }

  await metaRef(session.stravaId).set({
    lastSync: new Date(),
    totalRuns: runs.length,
    totalActivities: all.length,
  })

  return Response.json({ synced: runs.length, total: all.length })
}
