import { getServerSession } from 'next-auth'
import { getUserScope, isActivityAllowedForScope } from '@/lib/access'
import { authOptions } from '@/lib/auth'
import { loadYearActivitiesFromCache, rebuildYearActivityCache } from '@/lib/activity-cache'
import { activitiesRef, userRef } from '@/lib/firebase'
import { buildActivitiesQuery, normalizeRequestedYear, toDashboardActivity } from '@/lib/dashboard'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 60

type ActivityRow = ReturnType<typeof toDashboardActivity>

function parseRequestedYears(raw: string | null, scope: ReturnType<typeof getUserScope>, fallbackYear: string) {
  const values = (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  if (!values.length) {
    return [normalizeRequestedYear(fallbackYear, scope)]
  }

  const normalized = values.map((value) => normalizeRequestedYear(value, scope))
  return Array.from(new Set(normalized.filter((value) => value !== 'all'))).sort((a, b) => Number(b) - Number(a))
}

function parseRequestedSports(raw: string | null) {
  return Array.from(
    new Set(
      (raw ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    )
  )
}

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return null
  const parsed = new Date(endOfDay ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

async function loadYear(stravaId: number, year: string, scope: ReturnType<typeof getUserScope>) {
  const cached = await loadYearActivitiesFromCache(stravaId, year)
  if (cached) {
    return { activities: cached.activities, source: 'year-cache' as const }
  }

  await rebuildYearActivityCache(stravaId, year).catch(() => null)
  const rebuilt = await loadYearActivitiesFromCache(stravaId, year)
  if (rebuilt) {
    return { activities: rebuilt.activities, source: 'year-cache-rebuilt' as const }
  }

  const snap = await buildActivitiesQuery(activitiesRef(stravaId), year, scope)
    .select('stravaId', 'name', 'date', 'distanceKm', 'durationSec', 'paceSec', 'hrAvg', 'hrMax', 'elevationGain', 'kudos', 'type', 'excludedFromMetrics', 'qualityFlags', 'bestEfforts')
    .get()

  return {
    activities: snap.docs.map((doc) => toDashboardActivity(doc.data())),
    source: 'firestore' as const,
  }
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.stravaId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userSnap = await userRef(session.stravaId).get()
  const userData = userSnap.exists ? userSnap.data() : null
  const scope = getUserScope(session.stravaId, userData)

  const url = new URL(req.url)
  const fallbackYear = normalizeRequestedYear(url.searchParams.get('year'), scope)
  const years = parseRequestedYears(url.searchParams.get('years'), scope, fallbackYear)
  const sports = parseRequestedSports(url.searchParams.get('sports'))
  const start = parseDate(url.searchParams.get('start'))
  const end = parseDate(url.searchParams.get('end'), true)
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, Number(url.searchParams.get('pageSize') ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE))

  const results = await Promise.all(years.map((year) => loadYear(session.stravaId, year, scope)))
  const deduped = new Map<number, ActivityRow>()

  results.forEach((result) => {
    result.activities.forEach((activity) => {
      if (!isActivityAllowedForScope(activity, scope)) return
      deduped.set(activity.stravaId, activity)
    })
  })

  let activities = Array.from(deduped.values()).sort((a, b) => b.date.localeCompare(a.date))

  if (sports.length) {
    const sportSet = new Set(sports)
    activities = activities.filter((activity) => sportSet.has(activity.type))
  }

  if (start || end) {
    activities = activities.filter((activity) => {
      const date = new Date(activity.date)
      if (start && date < start) return false
      if (end && date > end) return false
      return true
    })
  }

  const count = activities.length
  const pageCount = Math.max(1, Math.ceil(count / pageSize))
  const safePage = Math.min(page, pageCount)
  const rows = activities.slice((safePage - 1) * pageSize, safePage * pageSize)
  const source = results.every((result) => result.source === 'year-cache')
    ? 'year-cache'
    : results.some((result) => result.source === 'firestore')
      ? 'mixed'
      : 'year-cache-rebuilt'

  return Response.json(
    {
      years,
      sports,
      count,
      page: safePage,
      pageSize,
      pageCount,
      activities: rows,
      source,
    },
    {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=30' },
    }
  )
}
