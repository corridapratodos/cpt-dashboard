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
})

test('full sync esta restrito a admin no backend', () => {
  const route = read('app/api/strava/sync/route.ts')
  assert.match(route, /requestedMode === 'full' && !isAdmin/)
  assert.match(route, /FULL_SYNC_COOLDOWN_MS/)
  assert.match(route, /syncInProgress/)
  assert.match(route, /MAX_INCREMENTAL_CURSOR_FUTURE_MS/)
  assert.match(route, /latestSavedWasFutureClamped/)
})

test('plano free e aplicado no backend de atividades e sync', () => {
  const access = read('lib/access.ts')
  const activitiesRoute = read('app/api/activities/route.ts')
  const syncRoute = read('app/api/strava/sync/route.ts')
  assert.match(access, /FREE_PLAN_YEARS = 2/)
  assert.match(access, /PRO_PLAN_YEARS = 3/)
  assert.match(activitiesRoute, /normalizeRequestedYear/)
  assert.match(activitiesRoute, /getUserScope/)
  assert.match(syncRoute, /isActivityAllowedForScope/)
})

test('backfill de best efforts evita varredura completa da base', () => {
  const backfillRoute = read('app/api/admin/backfill-efforts/route.ts')
  assert.match(backfillRoute, /where\('bestEfforts', '==', \[\]\)/)
})

test('exclusao de conta exige sessao e apaga a base do usuario', () => {
  const route = read('app/api/account/route.ts')
  assert.match(route, /Unauthorized/)
  assert.match(route, /recursiveDelete/)
})

test('login e painel expoem links de privacidade e termos', () => {
  const login = read('app/login/page.tsx')
  const gate = read('components/LegalGate.tsx')
  const dashboard = read('components/DashboardClient.tsx')
  assert.match(login, /\/privacy/)
  assert.match(login, /\/terms/)
  assert.match(gate, /Aceitar e entrar no painel/)
  assert.match(dashboard, /Excluir meus dados/)
})

