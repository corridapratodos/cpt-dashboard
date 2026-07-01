import { getServerSession } from 'next-auth'
import { getUserScope } from '@/lib/access'
import { authOptions } from '@/lib/auth'
import { activitiesRef, userRef } from '@/lib/firebase'
import { buildActivitiesQuery, normalizeRequestedYear, toDashboardActivity } from '@/lib/dashboard'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.stravaId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userSnap = await userRef(session.stravaId).get()
  const userData = userSnap.exists ? userSnap.data() : null
  const scope = getUserScope(session.stravaId, userData)

  const url = new URL(req.url)
  const requestedYear = url.searchParams.get('year')
  const year = normalizeRequestedYear(requestedYear, scope)

  const snap = await buildActivitiesQuery(activitiesRef(session.stravaId), year, scope)
    .select('stravaId', 'name', 'date', 'distanceKm', 'durationSec', 'paceSec', 'hrAvg', 'hrMax', 'elevationGain', 'kudos', 'type', 'excludedFromMetrics', 'qualityFlags', 'bestEfforts')
    .get()
  const activities = snap.docs.map((doc) => toDashboardActivity(doc.data()))

  return Response.json(
    {
      year,
      count: activities.length,
      activities,
      scope: {
        fullAccess: scope.fullAccess,
        allowedYears: scope.allowedYears,
        allowedTypes: scope.allowedTypes,
      },
    },
    {
      headers: { 'Cache-Control': 'private, max-age=120, stale-while-revalidate=30' },
    }
  )
}
