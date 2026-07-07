import { getServerSession } from 'next-auth'
import { getUserScope, isActivityAllowedForScope } from '@/lib/access'
import { authOptions } from '@/lib/auth'
import { loadYearActivitiesFromCache, rebuildYearActivityCache } from '@/lib/activity-cache'
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

  let activities: Array<ReturnType<typeof toDashboardActivity>> = []
  let source = 'firestore'

  if (year !== 'all') {
    let cached = await loadYearActivitiesFromCache(session.stravaId, year)

    if (!cached) {
      await rebuildYearActivityCache(session.stravaId, year).catch(() => null)
      cached = await loadYearActivitiesFromCache(session.stravaId, year)
      source = cached ? 'year-cache-rebuilt' : 'firestore'
    } else {
      source = 'year-cache'
    }

    if (cached) {
      activities = cached.activities
    }
  }

  if (!activities.length && source === 'firestore') {
    const snap = await buildActivitiesQuery(activitiesRef(session.stravaId), year, scope)
      .select('stravaId', 'name', 'date', 'distanceKm', 'durationSec', 'paceSec', 'hrAvg', 'hrMax', 'elevationGain', 'kudos', 'type', 'excludedFromMetrics', 'qualityFlags', 'bestEfforts')
      .get()
    activities = snap.docs.map((doc) => toDashboardActivity(doc.data()))
  }

  const visibleActivities = activities.filter((activity) => isActivityAllowedForScope(activity, scope))

  return Response.json(
    {
      year,
      count: visibleActivities.length,
      activities: visibleActivities,
      source,
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
