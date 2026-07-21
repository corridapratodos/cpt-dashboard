import { getServerSession } from 'next-auth'
import { fetchActivity, extractActivitySplits } from '@/lib/strava'
import { canAccessActivitySplits, getUserScope, isActivityAllowedForScope } from '@/lib/access'
import { getActivityYear, listYearCacheIndexes, rebuildYearActivityCaches, summarizeYearCacheIndexes } from '@/lib/activity-cache'
import { buildActivityInterpretation } from '@/lib/activity-interpretation'
import { authOptions } from '@/lib/auth'
import { isQualifiedRun, toDashboardActivity } from '@/lib/dashboard'
import { activitiesRef, metaRef, userRef } from '@/lib/firebase'
import { getServerStravaAccessToken } from '@/lib/server-strava-token'

export async function GET(_req: Request, context: { params: Promise<{ stravaId: string }> }) {
  const session = await getServerSession(authOptions)

  if (!session?.stravaId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = await context.params
  const activityId = Number(params.stravaId)
  if (!Number.isFinite(activityId) || activityId <= 0) {
    return Response.json({ error: 'Invalid activity id' }, { status: 400 })
  }

  const ref = activitiesRef(session.stravaId).doc(String(activityId))
  const activitySnap = await ref.get()
  if (!activitySnap.exists) {
    return Response.json({ error: 'Activity not found' }, { status: 404 })
  }

  const userSnap = await userRef(session.stravaId).get()
  const userData = userSnap.exists ? userSnap.data() : null
  const scope = getUserScope(session.stravaId, userData)
  const splitsAccess = canAccessActivitySplits(session.stravaId, userData)
  const activity = toDashboardActivity(activitySnap.data())
  if (!isActivityAllowedForScope(activity, scope)) {
    return Response.json({ error: 'Activity outside current access scope' }, { status: 403 })
  }
  const cachedData = activitySnap.data() ?? {}
  const hasCachedSplits = Boolean(cachedData.splitsFetchedAt) || Array.isArray(cachedData.splits)

  if (!splitsAccess) {
    return Response.json({
      ok: true,
      activity,
      splits: [],
      interpretation: null,
      splitsAccess: false,
      splitsSource: 'unavailable',
    })
  }

  if (hasCachedSplits) {
    const splits = Array.isArray(cachedData.splits) ? cachedData.splits : []
    return Response.json({
      ok: true,
      activity,
      splits,
      interpretation: buildActivityInterpretation(activity, splits),
      splitsAccess: true,
      splitsSource: 'cache',
    })
  }

  try {
    const accessToken = await getServerStravaAccessToken(session.stravaId)
    const detail = await fetchActivity(accessToken, activityId)
    const splits = extractActivitySplits(detail)

    await ref.set(
      {
        splits,
        splitsFetchedAt: new Date(),
      },
      { merge: true }
    )

    return Response.json({
      ok: true,
      activity,
      splits,
      interpretation: buildActivityInterpretation(activity, splits),
      splitsAccess: true,
      splitsSource: 'strava',
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Nao foi possivel carregar o detalhe da atividade.' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ stravaId: string }> }) {
  const session = await getServerSession(authOptions)

  if (!session?.stravaId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userSnap = await userRef(session.stravaId).get()
  const userData = userSnap.exists ? userSnap.data() : null
  const scope = getUserScope(session.stravaId, userData)

  const params = await context.params
  const activityId = Number(params.stravaId)
  if (!Number.isFinite(activityId) || activityId <= 0) {
    return Response.json({ error: 'Invalid activity id' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const excludedFromMetrics = body?.excludedFromMetrics === true
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 120) : ''

  const ref = activitiesRef(session.stravaId).doc(String(activityId))
  const scopeActivitySnap = await ref.get()
  if (!scopeActivitySnap.exists) {
    return Response.json({ error: 'Activity not found' }, { status: 404 })
  }
  if (!isActivityAllowedForScope(toDashboardActivity(scopeActivitySnap.data()), scope)) {
    return Response.json({ error: 'Activity outside current access scope' }, { status: 403 })
  }
  const metaDocRef = metaRef(session.stravaId)

  const updatedActivity = await ref.firestore.runTransaction(async (transaction) => {
    const activitySnap = await transaction.get(ref)
    if (!activitySnap.exists) {
      throw new Error('Activity not found')
    }

    const metaSnap = await transaction.get(metaDocRef)
    const current = (activitySnap.data() ?? {}) as Record<string, unknown>
    const currentFlags = Array.isArray(current.qualityFlags) ? current.qualityFlags.map(String) : []
    const nextFlags = excludedFromMetrics
      ? Array.from(new Set([...currentFlags, 'manual-ignore']))
      : currentFlags.filter((flag) => flag !== 'manual-ignore')

    const nextActivity: Record<string, unknown> = {
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

  const activityYear = getActivityYear((updatedActivity.localDate ?? updatedActivity.date) as string | Date | { toDate?: () => Date } | null | undefined)
  if (activityYear) {
    await rebuildYearActivityCaches(session.stravaId, [activityYear])
    const cacheSummary = summarizeYearCacheIndexes(await listYearCacheIndexes(session.stravaId))
    await metaDocRef.set(
      {
        totalActivities: cacheSummary.totalActivities,
        totalRuns: cacheSummary.totalRuns,
        totalsByType: cacheSummary.totalsByType,
        availableYears: cacheSummary.availableYears,
        newestActivityAt: cacheSummary.newestActivityAt,
      },
      { merge: true }
    )
  }

  return Response.json({
    ok: true,
    activity: toDashboardActivity(updatedActivity),
  })
}
