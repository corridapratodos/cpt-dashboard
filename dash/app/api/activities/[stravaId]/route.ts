import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { activitiesRef, userRef } from '@/lib/firebase'
import { getUserScope } from '@/lib/access'
import { toDashboardActivity } from '@/lib/dashboard'

export async function PATCH(req: Request, context: { params: Promise<{ stravaId: string }> }) {
  const session = await getServerSession(authOptions)

  if (!session?.stravaId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userSnap = await userRef(session.stravaId).get()
  const userData = userSnap.exists ? userSnap.data() : null
  getUserScope(session.stravaId, userData)

  const params = await context.params
  const activityId = Number(params.stravaId)
  if (!Number.isFinite(activityId) || activityId <= 0) {
    return Response.json({ error: 'Invalid activity id' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const excludedFromMetrics = body?.excludedFromMetrics === true
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 120) : ''

  const ref = activitiesRef(session.stravaId).doc(String(activityId))
  const snap = await ref.get()
  if (!snap.exists) {
    return Response.json({ error: 'Activity not found' }, { status: 404 })
  }

  const current = snap.data() ?? {}
  const currentFlags = Array.isArray(current.qualityFlags) ? current.qualityFlags.map(String) : []
  const nextFlags = excludedFromMetrics
    ? Array.from(new Set([...currentFlags, 'manual-ignore']))
    : currentFlags.filter((flag) => flag !== 'manual-ignore')

  await ref.set(
    {
      excludedFromMetrics,
      qualityFlags: nextFlags,
      reviewNote: note || null,
      reviewedAt: new Date(),
      reviewedBy: session.stravaId,
    },
    { merge: true }
  )

  const updatedSnap = await ref.get()
  return Response.json({
    ok: true,
    activity: toDashboardActivity(updatedSnap.data()),
  })
}
