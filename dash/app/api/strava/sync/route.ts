import { getServerSession } from 'next-auth'
import { isRunLikeType } from '@/lib/activity-types'
import { authOptions } from '@/lib/auth'
import { FULL_SYNC_COOLDOWN_MS, getUserScope, hasAdminAccess, isActivityAllowedForScope, parseStoredDate } from '@/lib/access'
import { getActivityYear, listYearCacheIndexes, rebuildYearActivityCaches, summarizeYearCacheIndexes } from '@/lib/activity-cache'
import { activitiesRef, metaRef, userRef } from '@/lib/firebase'
import { BEST_EFFORT_FETCH_LIMIT, extractBestEfforts, fetchActivities, fetchActivity, fetchBestEffortsForActivities, isRealRun, mapActivity } from '@/lib/strava'

const SYNC_LOCK_WINDOW_MS = 10 * 60 * 1000
const INCREMENTAL_OVERLAP_SEC = 12 * 60 * 60
const INCREMENTAL_SYNC_MIN_INTERVAL_MS = 60 * 1000
const MAX_INCREMENTAL_CURSOR_FUTURE_MS = 0
const FUTURE_CURSOR_RECOVERY_OVERLAP_SEC = 7 * 24 * 60 * 60

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
  lastSync?: unknown
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

function getUserFacingSyncError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'Erro desconhecido no sync')

  if (message.includes('Strava API error: 401')) {
    return 'Sua conexao com o Strava expirou. Saia e entre novamente no painel.'
  }

  if (message.includes('Strava API error: 429')) {
    return 'O Strava bloqueou temporariamente novas leituras por limite de uso. Aguarde alguns minutos e tente de novo.'
  }

  if (message.includes('Strava API error: 403')) {
    return 'O Strava recusou o acesso a esta sincronizacao. Revise a conexao da conta e tente novamente.'
  }

  if (message.includes('RESOURCE_EXHAUSTED') || message.includes('Quota exceeded')) {
    return 'O limite atual do Firebase foi atingido. Aguarde a janela virar ou reduza novas leituras.'
  }

  if (message.includes('FAILED_PRECONDITION') || message.includes('index')) {
    return 'O Firestore pediu uma estrutura de indice que ainda nao ficou pronta. Tente novamente em instantes.'
  }

  return 'Nao foi possivel sincronizar agora. Tente novamente em instantes.'
}

function hasMissingBestEfforts(data: Record<string, unknown>) {
  return !Array.isArray(data.bestEfforts) || data.bestEfforts.length === 0
}

function isEligibleForBestEffortBackfill(data: Record<string, unknown>) {
  const type = String(data.type ?? '')
  const distKm = Number(data.distanceKm ?? 0)
  const durationSec = Number(data.durationSec ?? 0)

  return hasMissingBestEfforts(data) && isRunLikeType(type) && distKm >= 3 && durationSec >= 20 * 60
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
  const lastSyncAt = parseStoredDate(metaData?.lastSync)
  if (
    effectiveRequestedMode === 'incremental' &&
    requestedMode === 'incremental' &&
    lastSyncAt &&
    now - lastSyncAt.getTime() < INCREMENTAL_SYNC_MIN_INTERVAL_MS
  ) {
    const retryAfterSec = Math.max(1, Math.ceil((INCREMENTAL_SYNC_MIN_INTERVAL_MS - (now - lastSyncAt.getTime())) / 1000))
    return Response.json(
      { error: `Sincronizacao incremental em cooldown. Tente novamente em ${retryAfterSec}s.` },
      { status: 429 }
    )
  }

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

    const resolvedLatestSavedAt = latestSavedDate instanceof Date
      ? latestSavedDate
      : latestSavedDate
        ? new Date(latestSavedDate)
        : null

    const latestSavedMs = resolvedLatestSavedAt && !Number.isNaN(resolvedLatestSavedAt.getTime())
      ? resolvedLatestSavedAt.getTime()
      : null
    const clampedLatestSavedMs = latestSavedMs != null
      ? Math.min(latestSavedMs, now + MAX_INCREMENTAL_CURSOR_FUTURE_MS)
      : null

    const incrementalAfter = clampedLatestSavedMs != null
      ? Math.floor(clampedLatestSavedMs / 1000)
      : undefined

    const latestSavedWasFutureClamped = latestSavedMs != null && clampedLatestSavedMs != null && latestSavedMs > clampedLatestSavedMs

    const incrementalCursor = incrementalAfter != null
      ? Math.max(
          incrementalAfter - (latestSavedWasFutureClamped ? FUTURE_CURSOR_RECOVERY_OVERLAP_SEC : INCREMENTAL_OVERLAP_SEC),
          0
        )
      : undefined

    const shouldRunIncremental = effectiveRequestedMode !== 'full' && historicalBackfillCompleted && incrementalAfter != null
    const effectiveMode = shouldRunIncremental ? 'incremental' : 'full'
    const incoming = await fetchActivities(session.accessToken, shouldRunIncremental ? incrementalCursor : undefined)
    const scopedIncoming = incoming.filter((activity) => isActivityAllowedForScope({ type: activity.type, date: activity.start_date }, scope))
    const bestEffortBackfill = await fetchBestEffortsForActivities(session.accessToken, scopedIncoming, effectiveMode)
    const mappedActivities = scopedIncoming.map((activity) =>
      mapActivity(activity, { bestEfforts: bestEffortBackfill.byActivityId.get(Number(activity.id)) })
    )
    const validRuns = scopedIncoming.filter(isRealRun)

    const incomingIds = mappedActivities.map((activity) => String(activity.stravaId))
    const existingIds = new Set<string>()
    for (let i = 0; i < incomingIds.length; i += 300) {
      const refs = incomingIds.slice(i, i + 300).map((id) => colRef.doc(id))
      if (!refs.length) continue
      const docs = await colRef.firestore.getAll(...refs)
      docs.forEach((doc) => {
        if (doc.exists) existingIds.add(doc.id)
      })
    }

    const newMappedActivities = mappedActivities.filter((activity) => !existingIds.has(String(activity.stravaId)))
    const newRunIds = new Set(newMappedActivities.map((activity) => String(activity.stravaId)))
    const newValidRuns = validRuns.filter((activity) => newRunIds.has(String(activity.id)))

    for (let i = 0; i < mappedActivities.length; i += 500) {
      const batch = colRef.firestore.batch()

      mappedActivities.slice(i, i + 500).forEach((activity) => {
        batch.set(colRef.doc(String(activity.stravaId)), activity, { merge: true })
      })

      await batch.commit()
    }

    const cacheYears = new Set<string>()
    mappedActivities.forEach((activity) => {
      const year = getActivityYear(activity.date)
      if (year) cacheYears.add(year)
    })

    let backfilledCount = 0
    if (shouldRunIncremental) {
      const recentSnap = await colRef
        .orderBy('date', 'desc')
        .limit(BEST_EFFORT_FETCH_LIMIT.incremental * 4)
        .get()

      const toBackfill = recentSnap.docs.filter((doc) => isEligibleForBestEffortBackfill(doc.data()))

      for (const doc of toBackfill) {
        try {
          const stravaId = Number(doc.data().stravaId)
          const detail = await fetchActivity(session.accessToken, stravaId)
          const bestEfforts = extractBestEfforts(detail)
          if (bestEfforts.length) {
            await colRef.doc(String(stravaId)).set({ bestEfforts }, { merge: true })
            const year = getActivityYear(doc.data().date)
            if (year) cacheYears.add(year)
            backfilledCount += 1
          }
        } catch {
          // Falhas individuais nao bloqueiam o sync
        }
      }
    }

    if (cacheYears.size > 0) {
      await rebuildYearActivityCaches(session.stravaId, [...cacheYears])
    }

    const cacheIndexes = await listYearCacheIndexes(session.stravaId)
    const cacheSummary = summarizeYearCacheIndexes(cacheIndexes)

    await metaRef(session.stravaId).set(
      {
        lastSync: new Date(),
        lastSyncMode: effectiveMode,
        lastIncrementalAfter: shouldRunIncremental ? incrementalCursor ?? null : null,
        lastFullSyncAt: effectiveMode === 'full' ? new Date() : metaData?.lastFullSyncAt ?? null,
        totalActivities: cacheSummary.totalActivities,
        totalRuns: cacheSummary.totalRuns,
        totalsByType: cacheSummary.totalsByType,
        availableYears: cacheSummary.availableYears,
        newestActivityAt: cacheSummary.newestActivityAt,
        lastSyncAddedActivities: newMappedActivities.length,
        lastSyncAddedQualifiedRuns: newValidRuns.length,
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
        latestSavedWasFutureClamped,
        latestSavedAtOriginal: latestSavedMs != null ? new Date(latestSavedMs) : null,
        latestSavedAtEffective: clampedLatestSavedMs != null ? new Date(clampedLatestSavedMs) : null,
      },
      { merge: true }
    )

    return Response.json({
      synced: newMappedActivities.length,
      fetched: incoming.length,
      runs: newValidRuns.length,
      processed: mappedActivities.length,
      mode: effectiveMode,
      after: shouldRunIncremental ? incrementalCursor ?? null : null,
      historicalBackfillCompleted: true,
      admin: isAdmin,
      totalActivities: cacheSummary.totalActivities,
      availableYears: cacheSummary.availableYears,
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
      latestSavedWasFutureClamped,
      cacheYearsRebuilt: [...cacheYears].sort((a, b) => Number(b) - Number(a)),
    })
  } catch (error) {
    const syncErrorMessage = error instanceof Error ? error.message : 'Erro desconhecido no sync'

    console.error('strava sync failed', {
      stravaId: session.stravaId,
      requestedMode,
      effectiveRequestedMode,
      reason: syncErrorMessage,
    })

    await metaRef(session.stravaId).set(
      {
        syncInProgress: false,
        syncLockUntil: null,
        syncErrorAt: new Date(),
        syncErrorMessage,
      },
      { merge: true }
    )

    return Response.json(
      { error: getUserFacingSyncError(error) },
      { status: 500 }
    )
  }
}
