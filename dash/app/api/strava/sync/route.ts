import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { FULL_SYNC_COOLDOWN_MS, getUserScope, hasAdminAccess, isActivityAllowedForScope, parseStoredDate } from '@/lib/access'
import { buildSyncSummary, toDashboardActivity } from '@/lib/dashboard'
import { activitiesRef, metaRef, userRef } from '@/lib/firebase'
import { fetchActivities, isRealRun, mapActivity } from '@/lib/strava'

const SYNC_LOCK_WINDOW_MS = 10 * 60 * 1000

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.accessToken || !session?.stravaId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const requestedMode = url.searchParams.get('mode') === 'full' ? 'full' : 'incremental'
  const [userSnap, metaSnap] = await Promise.all([
    userRef(session.stravaId).get(),
    metaRef(session.stravaId).get(),
  ])

  const userData = userSnap.exists ? userSnap.data() : null
  const isAdmin = hasAdminAccess(session.stravaId, userData)
  const scope = getUserScope(session.stravaId, userData)

  if (requestedMode === 'full' && !isAdmin) {
    return Response.json({ error: 'Full sync restrito ao administrador.' }, { status: 403 })
  }

  const metaData = metaSnap.exists ? metaSnap.data() : null
  const now = Date.now()
  const lockUntil = parseStoredDate(metaData?.syncLockUntil)
  if (metaData?.syncInProgress && lockUntil && lockUntil.getTime() > now) {
    return Response.json({ error: 'Ja existe uma sincronizacao em andamento para esta conta.' }, { status: 409 })
  }

  const lastFullSyncAt = parseStoredDate(metaData?.lastFullSyncAt)
  if (
    requestedMode === 'full' &&
    lastFullSyncAt &&
    now - lastFullSyncAt.getTime() < FULL_SYNC_COOLDOWN_MS
  ) {
    const hoursRemaining = Math.ceil((FULL_SYNC_COOLDOWN_MS - (now - lastFullSyncAt.getTime())) / (60 * 60 * 1000))
    return Response.json(
      { error: `Full sync bloqueado temporariamente. Tente novamente em cerca de ${hoursRemaining}h.` },
      { status: 429 }
    )
  }

  await metaRef(session.stravaId).set(
    {
      syncInProgress: true,
      syncRequestedMode: requestedMode,
      syncStartedAt: new Date(),
      syncLockUntil: new Date(now + SYNC_LOCK_WINDOW_MS),
    },
    { merge: true }
  )

  try {
    const colRef = activitiesRef(session.stravaId)
    const latestSnap = await colRef.orderBy('date', 'desc').limit(1).get()
    const historicalBackfillCompleted = metaData?.historicalBackfillCompleted === true

    const latestSavedDate = latestSnap.empty
      ? null
      : latestSnap.docs[0].data().date?.toDate?.() ?? latestSnap.docs[0].data().date ?? null

    const incrementalAfter = latestSavedDate instanceof Date
      ? Math.floor(latestSavedDate.getTime() / 1000)
      : latestSavedDate
        ? Math.floor(new Date(latestSavedDate).getTime() / 1000)
        : undefined

    const shouldRunIncremental = requestedMode !== 'full' && historicalBackfillCompleted && incrementalAfter != null
    const effectiveMode = shouldRunIncremental ? 'incremental' : 'full'
    const incoming = await fetchActivities(session.accessToken, shouldRunIncremental ? incrementalAfter : undefined)
    const scopedIncoming = incoming.filter((activity) => isActivityAllowedForScope({ type: activity.type, date: activity.start_date }, scope))
    const mappedActivities = scopedIncoming.map(mapActivity)
    const validRuns = scopedIncoming.filter(isRealRun)

    for (let i = 0; i < mappedActivities.length; i += 500) {
      const batch = colRef.firestore.batch()

      mappedActivities.slice(i, i + 500).forEach((activity) => {
        batch.set(colRef.doc(String(activity.stravaId)), activity, { merge: true })
      })

      await batch.commit()
    }

    const fullSnapshot = await colRef.orderBy('date', 'desc').get()
    const allActivities = fullSnapshot.docs.map((doc) => toDashboardActivity(doc.data()))
    const summary = buildSyncSummary(allActivities)

    await metaRef(session.stravaId).set(
      {
        lastSync: new Date(),
        lastSyncMode: effectiveMode,
        lastIncrementalAfter: shouldRunIncremental ? incrementalAfter ?? null : null,
        lastFullSyncAt: effectiveMode === 'full' ? new Date() : metaData?.lastFullSyncAt ?? null,
        totalActivities: summary.totalActivities,
        totalRuns: summary.totalRuns,
        totalsByType: summary.totalsByType,
        availableYears: summary.availableYears,
        newestActivityAt: summary.newestActivityAt,
        lastSyncAddedActivities: mappedActivities.length,
        lastSyncAddedQualifiedRuns: validRuns.length,
        lastSyncFetchedActivities: incoming.length,
        historicalBackfillCompleted: true,
        syncInProgress: false,
        syncRequestedMode: requestedMode,
        syncFinishedAt: new Date(),
        syncLockUntil: null,
        dataScope: {
          fullAccess: scope.fullAccess,
          allowedYears: scope.allowedYears,
          allowedTypes: scope.allowedTypes,
        },
      },
      { merge: true }
    )

    return Response.json({
      synced: mappedActivities.length,
      fetched: incoming.length,
      runs: validRuns.length,
      mode: effectiveMode,
      after: shouldRunIncremental ? incrementalAfter ?? null : null,
      historicalBackfillCompleted: true,
      admin: isAdmin,
      totalActivities: summary.totalActivities,
      availableYears: summary.availableYears,
      scope: {
        fullAccess: scope.fullAccess,
        allowedYears: scope.allowedYears,
        allowedTypes: scope.allowedTypes,
      },
    })
  } catch (error) {
    await metaRef(session.stravaId).set(
      {
        syncInProgress: false,
        syncLockUntil: null,
        syncErrorAt: new Date(),
        syncErrorMessage: error instanceof Error ? error.message : 'Erro desconhecido no sync',
      },
      { merge: true }
    )

    return Response.json(
      { error: error instanceof Error ? error.message : 'Erro desconhecido no sync' },
      { status: 500 }
    )
  }
}
