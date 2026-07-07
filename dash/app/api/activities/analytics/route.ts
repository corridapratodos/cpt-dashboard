import { getServerSession } from 'next-auth'
import { getUserScope } from '@/lib/access'
import { loadYearAnalyticsFromCache, applyScopeToYearAnalytics } from '@/lib/activity-analytics'
import { ANALYTICS_CACHE_VERSION } from '@/lib/analytics-types'
import { authOptions } from '@/lib/auth'
import { rebuildYearActivityCache } from '@/lib/activity-cache'
import { normalizeRequestedYear } from '@/lib/dashboard'
import { userRef } from '@/lib/firebase'

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

async function loadAnalyticsYear(stravaId: number, year: string, scope: ReturnType<typeof getUserScope>) {
  const cached = await loadYearAnalyticsFromCache(stravaId, year)
  if (cached && cached.cacheVersion === ANALYTICS_CACHE_VERSION) {
    return { analytics: applyScopeToYearAnalytics(cached, scope), source: 'analytics-cache' as const }
  }

  await rebuildYearActivityCache(stravaId, year).catch(() => null)
  const rebuilt = await loadYearAnalyticsFromCache(stravaId, year)
  if (rebuilt && rebuilt.cacheVersion === ANALYTICS_CACHE_VERSION) {
    return { analytics: applyScopeToYearAnalytics(rebuilt, scope), source: 'analytics-cache-rebuilt' as const }
  }

  return { analytics: null, source: 'missing' as const }
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
  const results = await Promise.all(years.map((year) => loadAnalyticsYear(session.stravaId, year, scope)))
  const analytics = results
    .map((result) => result.analytics)
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  const source = results.every((result) => result.source === 'analytics-cache')
    ? 'analytics-cache'
    : results.some((result) => result.source === 'missing')
      ? 'partial'
      : 'analytics-cache-rebuilt'

  return Response.json(
    {
      years,
      analytics,
      source,
    },
    {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=30' },
    }
  )
}
