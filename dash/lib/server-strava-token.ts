import { userRef } from '@/lib/firebase'
import { buildStoredOAuthTokenPayload, isOAuthTokenEncryptionEnabled, readStoredOAuthTokens } from '@/lib/oauth-tokens'

const REFRESH_SKEW_SEC = 60

export async function getServerStravaAccessToken(stravaId: number) {
  const ref = userRef(stravaId)
  const snap = await ref.get()
  const userData = snap.exists ? snap.data() : null
  const stored = readStoredOAuthTokens(userData)
  if (!stored) throw new Error('Stored Strava OAuth tokens are unavailable')

  if (isOAuthTokenEncryptionEnabled() && !userData?.oauthTokens) {
    await ref.set(
      { updatedAt: new Date(), ...buildStoredOAuthTokenPayload(stored) },
      { merge: true },
    )
  }

  if (stored.expiresAt > Math.floor(Date.now() / 1000) + REFRESH_SKEW_SEC) {
    return stored.accessToken
  }

  const response = await fetch('https://www.strava.com/api/v3/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID ?? '',
      client_secret: process.env.STRAVA_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
      refresh_token: stored.refreshToken,
    }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || typeof data?.access_token !== 'string') {
    throw new Error(`Strava OAuth refresh failed: ${response.status}`)
  }

  const refreshed = {
    accessToken: data.access_token as string,
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : stored.refreshToken,
    expiresAt: Number(data.expires_at),
  }
  if (!Number.isFinite(refreshed.expiresAt) || refreshed.expiresAt <= 0) {
    throw new Error('Strava OAuth refresh returned an invalid expiry')
  }

  await ref.set(
    {
      updatedAt: new Date(),
      ...buildStoredOAuthTokenPayload(refreshed),
    },
    { merge: true },
  )

  return refreshed.accessToken
}
