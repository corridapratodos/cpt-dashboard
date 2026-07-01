import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { FULL_SYNC_COOLDOWN_MS, getUserScope, hasAdminAccess, isActivityAllowedForScope, parseStoredDate } from '@/lib/access'
import { buildSyncSummary, toDashboardActivity } from '@/lib/dashboard'
import { activitiesRef, metaRef, userRef } from '@/lib/firebase'
import { BEST_EFFORT_FETCH_LIMIT, extractBestEfforts, fetchActivities, fetchActivity, fetchBestEffortsForActivities, isRealRun, mapActivity } from '@/lib/strava'

const SYNC_LOCK_WINDOW_MS = 10 * 60 * 1000

type StoredScope = {
  fullAccess?: boolean
  allowedYears?: string[] | 'all'
  allowedTypes?: string[] | 'all'
} | null | undefined

type StoredMeta = {
  lastFullSyncAt?: unknown
  syncInProgress?: boolean
  syncLockUntil?: unknown
  historicalBackfillCompleted?: boolean
  dataScope?: StoredScope
  totalActivities?: number
  totalRuns?: number
  totalsByType?: Record<string, number>
  availableYears?: string[]
  newestActivityAt?: string | null
} | null

function hasWiderYears(current: string[] | 'all', previous: string[] | 'all') {
  if (current === 'all' && previous !== 'all') return true
  if (current === 'all' || previous === 'all') return false
  return current.some((year) => !previous.includes(year))
}

function hasWiderTypes(current: string[] | 'all', previous: string[] | 'all') {
  if (current === 'all' && previous !== 'all') return true
  if (current === 'all' || previous === 'all') return false
  return current.some((type) => !previous.includes(type))
}

function scopeNeedsFullRebuild(current: ReturnType<typeof getUserScope>, previous: StoredScope) {
  if (!previous) return false
  if (current.fullAccess && !previous.fullAccess) return true
  return (
    hasWiderYears(current.allowedYears, previous.allowedYears ?? []) ||
    hasWiderTypes(current.allowedTypes, previous.allowedTypes ?? [])
  )
}

function mergeTypeTotals(current: Record<string, number> | undefined, added: Record<string, number>) {
  const next = { ...(current ?? {}) }
  for (const [type, count] of Object.entries(added)) {
    next[type] = (next[type] ?? 0) + count
  }
  return next
}

function mergeYears(current: string[] | undefined, added: string[]) {
  return Array.from(new Set([...(current ?? []), ...added])).sort((a, b) => Number(b) - Number(a))
}

function getNewestDate(current: string | null | undefined, incoming: string[]) {
  const candidates = [...incoming]
  if (current) candidates.push(current)
  if (!candidates.length) return null
  return candidates.sort((a, b) => b.localeCompare(a))[0] ?? null
}

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

  const metaData = (metaSnap.exists ? metaSnap.data() : null) as StoredMeta
  const now = Date.now()
  const lockUntil = parseStoredDate(metaData?.syncLockUntil)
  if (metaData?.syncInProgress && lockUntil && lockUntil.getTime() > now) {
    return Response.json({ error: 'Ja existe uma sincronizacao em andamento para esta conta.' }, { status: 409 })
  }

  const widenedScope = scopeNeedsFullRebuild(scope, metaData?.dataScope)
  const effectiveRequestedMode = widenedScope ? 'full' : requestedMode
  const lastFullSyncAt = parseStoredDate(metaData?.lastFullSyncAt)
  if (
    effectiveRequestedMode === 'full' &&
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
      syncRequestedMode: effectiveRequestedMode,
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

    const shouldRunIncremental = effectiveRequestedMode !== 'full' && historicalBackfillCompleted && incrementalAfter != null
    const effectiveMode = shouldRunIncremental ? 'incremental' : 'full'
    const incoming = await fetchActivities(session.accessToken, shouldRunIncremental ? incrementalAfter : undefined)
    const scopedIncoming = incoming.filter((activity) => isActivityAllowedForScope({ type: activity.type, date: activity.start_date }, scope))
    const bestEffortBackfill = await fetchBestEffortsForActivities(session.accessToken, scopedIncoming, effectiveMode)
    const mappedActivities = scopedIncoming.map((activity) =>
      mapActivity(activity, { bestEfforts: bestEffortBackfill.byActivityId.get(Number(activity.id)) })
    )
    const validRuns = scopedIncoming.filter(isRealRun)

    for (let i = 0; i < mappedActivities.length; i += 500) {
      const batch = colRef.firestore.batch()

      mappedActivities.slice(i, i + 500).forEach((activity) => {
        batch.set(colRef.doc(String(activity.stravaId)), activity, { merge: true })
      })

      await batch.commit()
    }

    // No sync incremental, enriquece atividades antigas sem best efforts
    let backfilledCount = 0
    if (shouldRunIncremental) {
      const withoutSnap = await colRef
        .where('bestEfforts', '==', [])
        .orderBy('date', 'desc')
        .limit(BEST_EFFORT_FETCH_LIMIT.incremental)
        .get()

      const toBackfill = withoutSnap.docs.filter((doc) => {
        const d = doc.data()
        const distKm = Number(d.distanceKm ?? 0)
        const durationSec = Number(d.durationSec ?? 0)
        return (d.type === 'Run' || d.type === 'TrailRun') && distKm >= 3 && durationSec >= 20 * 60
      })

      for (const doc of toBackfill) {
        try {
          const stravaId = Number(doc.data().stravaId)
          const detail = await fetchActivity(session.accessToken, stravaId)
          const bestEfforts = extractBestEfforts(detail)
          if (bestEfforts.length) {
            await colRef.doc(String(stravaId)).set({ bestEfforts }, { merge: true })
            backfilledCount++
          }
        } catch {
          // Falhas individuais nao bloqueiam o sync
        }
      }
    }

    let summary: ReturnType<typeof buildSyncSummary>

    if (effectiveMode === 'incremental') {
      const incomingActivities = mappedActivities.map((activity) => toDashboardActivity(activity))
      const incomingSummary = buildSyncSummary(incomingActivities)
      summary = {
        availableYears: mergeYears(metaData?.availableYears, incomingSummary.availableYears),
        totalActivities: Number(metaData?.totalActivities ?? 0) + mappedActivities.length,
        totalRuns: Number(metaData?.totalRuns ?? 0) + validRuns.length,
        totalsByType: mergeTypeTotals(metaData?.totalsByType, incomingSummary.totalsByType),
        newestActivityAt: getNewestDate(metaData?.newestActivityAt ?? null, incomingActivities.map((activity) => activity.date)),
      }
    } else {
      const fullSnapshot = await colRef.orderBy('date', 'desc').get()
      const allActivities = fullSnapshot.docs.map((doc) => toDashboardActivity(doc.data()))
      summary = buildSyncSummary(allActivities)
    }

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
        bestEffortEligibleActivities: bestEffortBackfill.eligibleCount,
        bestEffortFetchedActivities: bestEffortBackfill.fetchedCount,
        bestEffortEnrichedActivities: bestEffortBackfill.enrichedCount,
        bestEffortRemainingActivities: bestEffortBackfill.remainingCount,
        bestEffortBackfilledActivities: backfilledCount,
        historicalBackfillCompleted: true,
        metadataRepairedAt: new Date(),
        syncInProgress: false,
        syncRequestedMode: effectiveRequestedMode,
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
      bestEffortCoverage: {
        eligible: bestEffortBackfill.eligibleCount,
        fetched: bestEffortBackfill.fetchedCount,
        enriched: bestEffortBackfill.enrichedCount,
        remaining: bestEffortBackfill.remainingCount,
      },
      scope: {
        fullAccess: scope.fullAccess,
        allowedYears: scope.allowedYears,
        allowedTypes: scope.allowedTypes,
      },
      widenedScope,
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
