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

  const syncRoute = read('app/api/strava/sync/route.ts')
  assert.match(syncRoute, /requestedMode === 'full' && !isAdmin/)
  assert.match(syncRoute, /FULL_SYNC_COOLDOWN_MS/)
  assert.match(syncRoute, /syncInProgress/)
  assert.match(syncRoute, /isActivityAllowedForScope/)

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
