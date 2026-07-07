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

  const syncRoute = read('app/api/strava/sync/route.ts')
  assert.match(syncRoute, /requestedMode === 'full' && !isAdmin/)
  assert.match(syncRoute, /FULL_SYNC_COOLDOWN_MS/)
  assert.match(syncRoute, /INCREMENTAL_SYNC_MIN_INTERVAL_MS/)
  assert.match(syncRoute, /syncInProgress/)
  assert.match(syncRoute, /isActivityAllowedForScope/)
  assert.match(syncRoute, /MAX_INCREMENTAL_CURSOR_FUTURE_MS/)
  assert.match(syncRoute, /latestSavedWasFutureClamped/)
  assert.match(syncRoute, /summary = buildSyncSummary\(mappedActivities\.map/)

  const webhookRoute = read('app/api/strava/webhook/route.ts')
  assert.match(webhookRoute, /getWebhookPostToken/)
  assert.match(webhookRoute, /x-cpt-webhook-token/)
  assert.match(webhookRoute, /unknown_owner/)

  const backfillRoute = read('app/api/admin/backfill-efforts/route.ts')
  assert.match(backfillRoute, /where\('bestEfforts', '==', \[\]\)/)

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
  assert.match(activitiesRoute, /normalizeRequestedYear/)
  assert.match(activitiesRoute, /getUserScope/)

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

  console.log('Smoke checks aprovados.')
} catch (error) {
  console.error('Smoke checks falharam.')
  throw error
}
