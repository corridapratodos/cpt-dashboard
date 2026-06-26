import { NextRequest } from 'next/server'
import { fetchActivity, isRealRun, mapActivity } from '@/lib/strava'
import { activitiesRef } from '@/lib/firebase'

// GET — verificação do webhook pelo Strava
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

// POST — evento de nova atividade
export async function POST(req: NextRequest) {
  const body = await req.json()

  // Só processa eventos de criação de atividade
  if (body.object_type !== 'activity' || body.aspect_type !== 'create') {
    return Response.json({ ok: true })
  }

  const ownerId: number = body.owner_id
  const activityId: number = body.object_id

  // Busca o token do usuário no Firestore
  const { db } = await import('@/lib/firebase')
  const tokenDoc = await db.collection('users').doc(String(ownerId)).get()
  const userData = tokenDoc.data()

  if (!userData?.accessToken) {
    return Response.json({ error: 'User not found' }, { status: 404 })
  }

  // Verifica se o token expirou e renova se necessário
  let { accessToken, refreshToken, expiresAt } = userData
  if (Date.now() > expiresAt * 1000) {
    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })
    const data = await res.json()
    accessToken = data.access_token
    refreshToken = data.refresh_token
    expiresAt = data.expires_at
    await db.collection('users').doc(String(ownerId)).update({ accessToken, refreshToken, expiresAt })
  }

  const activity = await fetchActivity(accessToken, activityId)
  if (!isRealRun(activity)) return Response.json({ ok: true, skipped: true })

  const mapped = mapActivity(activity)
  await activitiesRef(ownerId).doc(String(activityId)).set(mapped, { merge: true })

  return Response.json({ ok: true, saved: activityId })
}
