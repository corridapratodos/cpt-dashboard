import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { activitiesRef, metaRef, userRef } from '@/lib/firebase'
import { getUserScope } from '@/lib/access'
import { isQualifiedRun, toDashboardActivity } from '@/lib/dashboard'

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
  const metaDocRef = metaRef(session.stravaId)

  const updatedActivity = await ref.firestore.runTransaction(async (transaction) => {
    const activitySnap = await transaction.get(ref)
    if (!activitySnap.exists) {
      throw new Error('Activity not found')
    }

    const metaSnap = await transaction.get(metaDocRef)
    const current = activitySnap.data() ?? {}
    const currentFlags = Array.isArray(current.qualityFlags) ? current.qualityFlags.map(String) : []
    const nextFlags = excludedFromMetrics
      ? Array.from(new Set([...currentFlags, 'manual-ignore']))
      : currentFlags.filter((flag) => flag !== 'manual-ignore')

    const nextActivity = {
      ...current,
      excludedFromMetrics,
      qualityFlags: nextFlags,
      reviewNote: note || null,
      reviewedAt: new Date(),
      reviewedBy: session.stravaId,
    }

    const previousQualified = isQualifiedRun(toDashboardActivity(current))
    const nextQualified = isQualifiedRun(toDashboardActivity(nextActivity))
    const totalRunsDelta = Number(nextQualified) - Number(previousQualified)
    const currentTotalRuns = Number(metaSnap.data()?.totalRuns ?? 0)

    transaction.set(
      ref,
      {
        excludedFromMetrics,
        qualityFlags: nextFlags,
        reviewNote: note || null,
        reviewedAt: new Date(),
        reviewedBy: session.stravaId,
      },
      { merge: true }
    )

    transaction.set(
      metaDocRef,
      {
        lastActivityReviewAt: new Date(),
        totalRuns: Math.max(0, currentTotalRuns + totalRunsDelta),
      },
      { merge: true }
    )

    return nextActivity
  }).catch((error: Error) => {
    if (error.message === 'Activity not found') {
      return null
    }
    throw error
  })

  if (!updatedActivity) {
    return Response.json({ error: 'Activity not found' }, { status: 404 })
  }

  return Response.json({
    ok: true,
    activity: toDashboardActivity(updatedActivity),
  })
}
