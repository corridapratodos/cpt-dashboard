import { NextRequest } from 'next/server'
import { getUserScope, isActivityAllowedForScope } from '@/lib/access'
import { getActivityYear, listYearCacheIndexes, rebuildYearActivityCaches, summarizeYearCacheIndexes } from '@/lib/activity-cache'
import { activitiesRef, getDb, metaRef } from '@/lib/firebase'
import { getWebhookPostToken } from '@/lib/security'
import { extractBestEfforts, fetchActivity, mapActivity } from '@/lib/strava'

function isAuthorizedWebhookRequest(req: NextRequest) {
  const expectedToken = getWebhookPostToken()
  if (!expectedToken) return false

  const providedToken = req.nextUrl.searchParams.get('token') ?? req.headers.get('x-cpt-webhook-token')
  return providedToken === expectedToken
}

async function refreshWebhookAccessToken(ownerId: number, refreshToken: string) {
  const res = await fetch('https://www.strava.com/api/v3/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID ?? '',
      client_secret: process.env.STRAVA_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  const data = await res.json()
  if (!res.ok || !data?.access_token || !data?.refresh_token || !data?.expires_at) {
    throw new Error('Webhook token refresh failed')
  }

  await getDb().collection('users').doc(String(ownerId)).update({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  })

  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
    expiresAt: Number(data.expires_at),
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    return Response.json({ 'hub.challenge': challenge })
  }

  return Response.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedWebhookRequest(req)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => null)
    if (!body) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 })
    }

    if (body.object_type !== 'activity' || body.aspect_type !== 'create') {
      return Response.json({ ok: true })
    }

    const ownerId = Number(body.owner_id)
    const activityId = Number(body.object_id)
    if (!Number.isFinite(ownerId) || !Number.isFinite(activityId) || ownerId <= 0 || activityId <= 0) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const db = getDb()
    const tokenDoc = await db.collection('users').doc(String(ownerId)).get()
    if (!tokenDoc.exists) {
      return Response.json({ ok: true, skipped: true, reason: 'unknown_owner' })
    }

    const userData = tokenDoc.data()
    if (!userData?.accessToken) {
      return Response.json({ ok: true, skipped: true, reason: 'missing_access_token' })
    }

    let accessToken = String(userData.accessToken)
    const refreshToken = String(userData.refreshToken ?? '')
    let expiresAt = Number(userData.expiresAt ?? 0)

    if (!refreshToken || !expiresAt) {
      return Response.json({ ok: true, skipped: true, reason: 'incomplete_user_tokens' })
    }

    if (Date.now() > expiresAt * 1000) {
      const refreshed = await refreshWebhookAccessToken(ownerId, refreshToken)
      accessToken = refreshed.accessToken
      expiresAt = refreshed.expiresAt
    }

    const scope = getUserScope(ownerId, userData)
    const activity = await fetchActivity(accessToken, activityId)
    if (!isActivityAllowedForScope({ type: activity.type, date: activity.start_date }, scope)) {
      return Response.json({ ok: true, skipped: true, reason: 'outside_plan_scope' })
    }

    const ref = activitiesRef(ownerId).doc(String(activityId))
    const existingSnap = await ref.get()
    const mapped = mapActivity(activity, { bestEfforts: extractBestEfforts(activity) })
    await ref.set(mapped, { merge: true })

    const activityYear = getActivityYear(mapped.date)
    if (activityYear) {
      await rebuildYearActivityCaches(ownerId, [activityYear])
    }

    const cacheIndexes = await listYearCacheIndexes(ownerId)
    const cacheSummary = summarizeYearCacheIndexes(cacheIndexes)

    await metaRef(ownerId).set(
      {
        totalActivities: cacheSummary.totalActivities,
        totalRuns: cacheSummary.totalRuns,
        totalsByType: cacheSummary.totalsByType,
        availableYears: cacheSummary.availableYears,
        newestActivityAt: cacheSummary.newestActivityAt,
        lastWebhookActivityAt: new Date(),
        lastWebhookActivityId: activityId,
        dataScope: {
          fullAccess: scope.fullAccess,
          allowedYears: scope.allowedYears,
          allowedTypes: scope.allowedTypes,
        },
      },
      { merge: true }
    )

    return Response.json({
      ok: true,
      saved: activityId,
      alreadyExisted: existingSnap.exists,
      cacheYear: activityYear,
    })
  } catch {
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
