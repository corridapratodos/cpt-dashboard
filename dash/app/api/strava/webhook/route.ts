import { NextRequest } from 'next/server'
import { getUserScope, isActivityAllowedForScope } from '@/lib/access'
import { buildSyncSummary, toDashboardActivity } from '@/lib/dashboard'
import { extractBestEfforts, fetchActivity, mapActivity } from '@/lib/strava'
import { activitiesRef, getDb, metaRef } from '@/lib/firebase'

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
  const body = await req.json()

  if (body.object_type !== 'activity' || body.aspect_type !== 'create') {
    return Response.json({ ok: true })
  }

  const ownerId: number = body.owner_id
  const activityId: number = body.object_id
  const db = getDb()
  const tokenDoc = await db.collection('users').doc(String(ownerId)).get()
  const userData = tokenDoc.data()

  if (!userData?.accessToken) {
    return Response.json({ error: 'User not found' }, { status: 404 })
  }

  let { accessToken, refreshToken, expiresAt } = userData

  if (Date.now() > expiresAt * 1000) {
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
    accessToken = data.access_token
    refreshToken = data.refresh_token
    expiresAt = data.expires_at

    await db.collection('users').doc(String(ownerId)).update({
      accessToken,
      refreshToken,
      expiresAt,
    })
  }

  const scope = getUserScope(ownerId, userData)
  const activity = await fetchActivity(accessToken, activityId)
  if (!isActivityAllowedForScope({ type: activity.type, date: activity.start_date }, scope)) {
    return Response.json({ ok: true, skipped: true, reason: 'outside_plan_scope' })
  }

  const mapped = mapActivity(activity, { bestEfforts: extractBestEfforts(activity) })
  await activitiesRef(ownerId).doc(String(activityId)).set(mapped, { merge: true })

  const activityYear = String(new Date(mapped.date).getUTCFullYear())
  const currentMetaSnap = await metaRef(ownerId).get()
  const currentMeta = currentMetaSnap.exists ? currentMetaSnap.data() : null
  const availableYears = Array.from(new Set([...(currentMeta?.availableYears ?? []), activityYear]))
    .sort((a, b) => Number(b) - Number(a))

  await metaRef(ownerId).set(
    {
      availableYears,
      newestActivityAt: mapped.date,
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

  if ((currentMeta?.totalActivities ?? 0) < 1000) {
    const snap = await activitiesRef(ownerId).orderBy('date', 'desc').get()
    const summary = buildSyncSummary(snap.docs.map((doc) => toDashboardActivity(doc.data())))

    await metaRef(ownerId).set(
      {
        totalActivities: summary.totalActivities,
        totalRuns: summary.totalRuns,
        totalsByType: summary.totalsByType,
        availableYears: summary.availableYears,
        newestActivityAt: summary.newestActivityAt,
      },
      { merge: true }
    )
  }

  return Response.json({ ok: true, saved: activityId })
}
