function parseIdList(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry) && entry > 0)
}

export function getAllowedLoginIds() {
  return parseIdList(process.env.ALLOWED_STRAVA_IDS)
}

export function isStravaLoginAllowed(stravaId: number) {
  const allowed = getAllowedLoginIds()
  if (!allowed.length) return true
  return allowed.includes(stravaId)
}

export function isAdminBootstrapEnabled() {
  return process.env.ENABLE_ADMIN_BOOTSTRAP === 'true'
}

export function getWebhookPostToken() {
  return (process.env.STRAVA_WEBHOOK_POST_TOKEN ?? process.env.STRAVA_WEBHOOK_VERIFY_TOKEN ?? '').trim()
}
