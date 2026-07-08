import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

try {
  const page = read('app/page.tsx')
  assert.match(page, /hasAcceptedLegal/)
  assert.match(page, /return <LegalGate/)
  assert.match(page, /getUserScope/)
  assert.match(page, /METADATA_REPAIR_COOLDOWN_MS/)
  assert.match(page, /metadataRepairAttemptedAt/)
  assert.match(page, /listYearCacheIndexes/)
  assert.match(page, /loadYearActivitiesFromCache/)
  assert.match(page, /applyScopeToYearAnalytics/)

  const cache = read('lib/activity-cache.ts')
  assert.match(cache, /YEAR_CACHE_CHUNK_SIZE = 120/)
  assert.match(cache, /rebuildYearActivityCaches/)
  assert.match(cache, /summarizeYearCacheIndexes/)
  assert.match(cache, /writeYearAnalyticsBatch/)

  const analytics = read('lib/activity-analytics.ts')
  assert.match(analytics, /buildYearAnalytics/)
  assert.match(analytics, /applyScopeToYearAnalytics/)
  assert.match(analytics, /deleteYearAnalyticsBatch/)
  assert.match(analytics, /ANALYTICS_CACHE_VERSION/)

  const syncRoute = read('app/api/strava/sync/route.ts')
  assert.match(syncRoute, /requestedMode === 'full' && !isAdmin/)
  assert.match(syncRoute, /FULL_SYNC_COOLDOWN_MS/)
  assert.match(syncRoute, /INCREMENTAL_SYNC_MIN_INTERVAL_MS/)
  assert.match(syncRoute, /syncInProgress/)
  assert.match(syncRoute, /isActivityAllowedForScope/)
  assert.match(syncRoute, /MAX_INCREMENTAL_CURSOR_FUTURE_MS/)
  assert.match(syncRoute, /latestSavedWasFutureClamped/)
  assert.match(syncRoute, /rebuildYearActivityCaches/)
  assert.match(syncRoute, /cacheYearsRebuilt/)

  const webhookRoute = read('app/api/strava/webhook/route.ts')
  assert.match(webhookRoute, /getWebhookPostToken/)
  assert.match(webhookRoute, /x-cpt-webhook-token/)
  assert.match(webhookRoute, /unknown_owner/)
  assert.match(webhookRoute, /rebuildYearActivityCaches/)

  const backfillRoute = read('app/api/admin/backfill-efforts/route.ts')
  assert.match(backfillRoute, /where\('bestEfforts', '==', \[\]\)/)
  assert.match(backfillRoute, /rebuildYearActivityCaches/)

  const access = read('lib/access.ts')
  assert.match(access, /FREE_PLAN_YEARS = 2/)
  assert.match(access, /PRO_PLAN_YEARS = 3/)

  const auth = read('lib/auth.ts')
  const security = read('lib/security.ts')
  assert.match(auth, /AccessDenied/)
  assert.match(security, /ENABLE_ADMIN_BOOTSTRAP/)
  assert.match(security, /ALLOWED_STRAVA_IDS/)

  const accessGrant = read('app/api/access/grant/route.ts')
  assert.match(accessGrant, /consumeRateLimit/)

  const activitiesRoute = read('app/api/activities/route.ts')
  const activitiesHistoryRoute = read('app/api/activities/history/route.ts')
  const activitiesAnalyticsRoute = read('app/api/activities/analytics/route.ts')
  assert.match(activitiesRoute, /normalizeRequestedYear/)
  assert.match(activitiesRoute, /getUserScope/)
  assert.match(activitiesHistoryRoute, /pageSize/)
  assert.match(activitiesHistoryRoute, /loadYearActivitiesFromCache/)
  assert.match(activitiesHistoryRoute, /listYearCacheChunkMeta/)
  assert.match(activitiesHistoryRoute, /year-cache-windowed/)
  assert.match(activitiesRoute, /loadYearActivitiesFromCache/)
  assert.match(activitiesAnalyticsRoute, /applyScopeToYearAnalytics/)
  assert.match(activitiesAnalyticsRoute, /ANALYTICS_CACHE_VERSION/)
  assert.match(activitiesAnalyticsRoute, /rebuildYearActivityCache/)

  const accountRoute = read('app/api/account/route.ts')
  assert.match(accountRoute, /Unauthorized/)
  assert.match(accountRoute, /recursiveDelete/)

  const login = read('app/login/page.tsx')
  const accessPage = read('app/access/page.tsx')
  const preAccessGate = read('components/PreAccessGate.tsx')
  const middleware = read('middleware.ts')
  const gate = read('components/LegalGate.tsx')
  const dashboard = read('components/DashboardClient.tsx')
  assert.match(login, /\/privacy/)
  assert.match(login, /\/terms/)
  assert.match(accessPage, /PreAccessGate/)
  assert.match(preAccessGate, /codigo de convite/i)
  assert.match(middleware, /PRE_ACCESS_COOKIE_NAME/)
  assert.match(middleware, /\/access/)
  assert.match(gate, /Aceitar e entrar no painel/)
  assert.match(dashboard, /Excluir meus dados/)
  assert.match(dashboard, /loadHistoryPage/)
  assert.match(dashboard, /computeDashboardSlices/)
  assert.match(dashboard, /api\/activities\/analytics/)

  console.log('Smoke checks aprovados.')
} catch (error) {
  console.error('Smoke checks falharam.')
  throw error
}
