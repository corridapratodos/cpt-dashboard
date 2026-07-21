import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('home page exige aceite legal antes do dashboard', () => {
  const page = read('app/page.tsx')
  assert.match(page, /hasAcceptedLegal/)
  assert.match(page, /return <LegalGate/)
  assert.match(page, /getUserScope/)
  assert.match(page, /METADATA_REPAIR_COOLDOWN_MS/)
  assert.match(page, /metadataRepairAttemptedAt/)
  assert.match(page, /listYearCacheIndexes/)
  assert.match(page, /applyScopeToYearAnalytics/)
})

test('tokens OAuth usam camada de persistencia dedicada e webhook prioriza header', () => {
  const auth = read('lib/auth.ts')
  const webhookRoute = read('app/api/strava/webhook/route.ts')
  const oauthTokens = read('lib/oauth-tokens.ts')
  assert.match(auth, /buildStoredOAuthTokenPayload/)
  assert.match(webhookRoute, /req\.headers\.get\('x-cpt-webhook-token'\) \?\? req\.nextUrl\.searchParams\.get\('token'\)/)
  assert.match(webhookRoute, /readStoredOAuthTokens/)
  assert.match(webhookRoute, /mergeAvailableYears/)
  assert.match(oauthTokens, /OAUTH_TOKEN_ENCRYPTION_KEY/)
  assert.doesNotMatch(auth, /session\.accessToken/)
  assert.match(oauthTokens, /obrigatoria em producao/)
})

test('full sync esta restrito a admin no backend', () => {
  const route = read('app/api/strava/sync/route.ts')
  assert.match(route, /requestedMode === 'full' && !isAdmin/)
  assert.match(route, /FULL_SYNC_COOLDOWN_MS/)
  assert.match(route, /syncInProgress/)
  assert.match(route, /MAX_INCREMENTAL_CURSOR_FUTURE_MS/)
  assert.match(route, /latestSavedWasFutureClamped/)
  assert.match(route, /rebuildYearActivityCaches/)
})

test('plano free e aplicado no backend de atividades, analytics e sync', () => {
  const access = read('lib/access.ts')
  const activitiesRoute = read('app/api/activities/route.ts')
  const activitiesHistoryRoute = read('app/api/activities/history/route.ts')
  const activitiesAnalyticsRoute = read('app/api/activities/analytics/route.ts')
  const syncRoute = read('app/api/strava/sync/route.ts')
  assert.match(access, /FREE_PLAN_YEARS = 2/)
  assert.match(access, /PRO_PLAN_YEARS = 3/)
  assert.match(activitiesRoute, /normalizeRequestedYear/)
  assert.match(activitiesRoute, /getUserScope/)
  assert.match(activitiesRoute, /loadYearActivitiesFromCache/)
  assert.match(activitiesAnalyticsRoute, /applyScopeToYearAnalytics/)
  assert.match(syncRoute, /isActivityAllowedForScope/)
  assert.match(access, /localDate/)
})

test('cache anual em chunks e analytics existem para cortar leituras por tela', () => {
  const cache = read('lib/activity-cache.ts')
  const analytics = read('lib/activity-analytics.ts')
  assert.match(cache, /YEAR_CACHE_CHUNK_SIZE = 120/)
  assert.match(cache, /loadYearActivitiesFromCache/)
  assert.match(cache, /listYearCacheChunkMeta/)
  assert.match(cache, /loadYearCacheChunksByIds/)
  assert.match(cache, /rebuildYearActivityCaches/)
  assert.match(cache, /writeYearAnalyticsBatch/)
  assert.match(analytics, /buildYearAnalytics/)
  assert.match(analytics, /ANALYTICS_CACHE_VERSION/)
  assert.match(analytics, /hasCriticalMetricQualityIssue/)
})

test('backfill de best efforts evita varredura completa da base', () => {
  const backfillRoute = read('app/api/admin/backfill-efforts/route.ts')
  assert.match(backfillRoute, /isEligibleForBestEfforts/)
  assert.match(backfillRoute, /rebuildYearActivityCaches/)
})

test('exclusao de conta exige sessao e apaga a base do usuario', () => {
  const route = read('app/api/account/route.ts')
  assert.match(route, /Unauthorized/)
  assert.match(route, /recursiveDelete/)
})

test('login e painel expoem links legais e consumo de analytics cache', () => {
  const login = read('app/login/page.tsx')
  const gate = read('components/LegalGate.tsx')
  const styles = read('app/globals.css')
  const dashboard = read('components/DashboardClient.tsx')
  const dashboardLegalSection = read('components/dashboard/DashboardLegalSection.tsx')
  const dashboardHistorySection = read('components/dashboard/DashboardHistorySection.tsx')
  const activityDetailDialog = read('components/dashboard/ActivityDetailDialog.tsx')
  const activityInterpretation = read('lib/activity-interpretation.ts')
  const useDashboardPeriodNavigation = read('components/dashboard/useDashboardPeriodNavigation.ts')
  const useYearAnalytics = read('components/dashboard/useYearAnalytics.ts')
  const dashboardExecutiveSection = read('components/dashboard/DashboardExecutiveSection.tsx')
  const dashboardInsights = read('components/dashboard/insights.ts')
  assert.match(login, /\/privacy/)
  assert.match(login, /\/terms/)
  assert.match(gate, /Aceitar e entrar no painel/)
  assert.match(styles, /\.hero\.legal-hero\s*\{[^}]*display:\s*block/s)
  assert.match(dashboard, /DashboardLegalSection/)
  assert.match(dashboardHistorySection, /Historico navegavel do recorte/)
  assert.match(dashboardLegalSection, /Excluir meus dados/)
  assert.match(dashboardExecutiveSection, /Consistencia da rotina/)
  assert.match(activityDetailDialog, /useActivityDetail/)
  assert.match(activityInterpretation, /Treino bem redondo/)
  assert.match(useDashboardPeriodNavigation, /activePeriodOptions/)
  assert.match(useYearAnalytics, /api\/activities\/analytics/)
  assert.match(dashboardInsights, /buildAnalysisInsights/)
  assert.match(dashboard, /computeDashboardSlices/)
  assert.match(useYearAnalytics, /api\/activities\/analytics/)
})
