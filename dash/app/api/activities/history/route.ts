import { getServerSession } from 'next-auth'
import { getUserScope } from '@/lib/access'
import { authOptions } from '@/lib/auth'
import {
  listYearCacheChunkMeta,
  loadYearActivitiesFromCache,
  loadYearCacheChunksByIds,
  rebuildYearActivityCache,
} from '@/lib/activity-cache'
import { activitiesRef, userRef } from '@/lib/firebase'
import { buildActivitiesQuery, normalizeRequestedYear, toDashboardActivity } from '@/lib/dashboard'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 60

type ActivityRow = ReturnType<typeof toDashboardActivity>
type UserScope = ReturnType<typeof getUserScope>
type YearSlice = {
  count: number
  rows: ActivityRow[]
  source: 'year-cache-windowed' | 'year-cache' | 'year-cache-rebuilt' | 'firestore'
}

function parseRequestedYears(raw: string | null, scope: UserScope, fallbackYear: string) {
  const values = (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  if (!values.length) {
    return [normalizeRequestedYear(fallbackYear, scope)]
  }

  const normalized = values.map((value) => normalizeRequestedYear(value, scope))
  return Array.from(new Set(normalized.filter((value) => value !== 'all'))).sort((a, b) => Number(b) - Number(a))
}

function parseRequestedSports(raw: string | null) {
  return Array.from(
    new Set(
      (raw ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    )
  )
}

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return null
  const parsed = new Date(endOfDay ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function buildEffectiveSportSet(scope: UserScope, requestedSports: string[]) {
  const allowedTypes = scope.fullAccess || scope.allowedTypes === 'all' ? null : new Set(scope.allowedTypes)
  const requestedSet = requestedSports.length ? new Set(requestedSports) : null

  if (!allowedTypes && !requestedSet) return null

  if (!allowedTypes) return requestedSet
  if (!requestedSet) return allowedTypes

  return new Set([...requestedSet].filter((type) => allowedTypes.has(type)))
}

function matchesActivity(activity: ActivityRow, sportSet: Set<string> | null, startIso: string | null, endIso: string | null) {
  if (sportSet && !sportSet.has(activity.type)) return false
  if (startIso && activity.localDate < startIso) return false
  if (endIso && activity.localDate > endIso) return false
  return true
}

function filterActivities(activities: ActivityRow[], sportSet: Set<string> | null, startIso: string | null, endIso: string | null) {
  return activities.filter((activity) => matchesActivity(activity, sportSet, startIso, endIso))
}

function isChunkOutsideWindow(chunk: { newestDate: string | null; oldestDate: string | null }, startIso: string | null, endIso: string | null) {
  if (startIso && chunk.newestDate && chunk.newestDate < startIso) return true
  if (endIso && chunk.oldestDate && chunk.oldestDate > endIso) return true
  return false
}

function isChunkFullyInsideWindow(chunk: { newestDate: string | null; oldestDate: string | null }, startIso: string | null, endIso: string | null) {
  if (startIso && (!chunk.oldestDate || chunk.oldestDate < startIso)) return false
  if (endIso && (!chunk.newestDate || chunk.newestDate > endIso)) return false
  return true
}

function getFastChunkCount(
  chunk: { activityCount: number; totalsByType: Record<string, number>; newestDate: string | null; oldestDate: string | null },
  sportSet: Set<string> | null,
  startIso: string | null,
  endIso: string | null
) {
  if (!isChunkFullyInsideWindow(chunk, startIso, endIso)) return null

  if (!sportSet) {
    return chunk.activityCount > 0 ? chunk.activityCount : null
  }

  const knownTypes = Object.keys(chunk.totalsByType)
  if (!knownTypes.length) return null

  return [...sportSet].reduce((sum, type) => sum + (chunk.totalsByType[type] ?? 0), 0)
}

async function loadYearFallbackActivities(stravaId: number, year: string, scope: UserScope) {
  const cached = await loadYearActivitiesFromCache(stravaId, year)
  if (cached) {
    return { activities: cached.activities, source: 'year-cache' as const }
  }

  await rebuildYearActivityCache(stravaId, year).catch(() => null)
  const rebuilt = await loadYearActivitiesFromCache(stravaId, year)
  if (rebuilt) {
    return { activities: rebuilt.activities, source: 'year-cache-rebuilt' as const }
  }

  const snap = await buildActivitiesQuery(activitiesRef(stravaId), year, scope)
    .select('stravaId', 'name', 'date', 'distanceKm', 'durationSec', 'paceSec', 'hrAvg', 'hrMax', 'elevationGain', 'kudos', 'type', 'excludedFromMetrics', 'qualityFlags', 'bestEfforts')
    .get()

  return {
    activities: snap.docs.map((doc) => toDashboardActivity(doc.data())),
    source: 'firestore' as const,
  }
}

async function loadYearHistorySliceFromCache(
  stravaId: number,
  year: string,
  sportSet: Set<string> | null,
  startIso: string | null,
  endIso: string | null,
  offset: number,
  limit: number
): Promise<YearSlice | null> {
  const cache = await listYearCacheChunkMeta(stravaId, year)
  if (!cache) return null

  const { index, chunks } = cache

  if (!sportSet && !startIso && !endIso) {
    const count = index.activityCount
    if (limit <= 0 || offset >= count) {
      return { count, rows: [], source: 'year-cache-windowed' }
    }

    const chunkSize = Math.max(1, index.chunkSize || 120)
    const firstChunk = Math.floor(offset / chunkSize)
    const lastChunk = Math.floor((Math.min(offset + limit, count) - 1) / chunkSize)
    const chunkIds = Array.from({ length: lastChunk - firstChunk + 1 }, (_, idx) => String(firstChunk + idx).padStart(4, '0'))
    const chunkMap = await loadYearCacheChunksByIds(stravaId, year, chunkIds)
    const ordered = chunkIds.flatMap((chunkId) => chunkMap.get(chunkId) ?? [])
    const localOffset = offset - firstChunk * chunkSize

    return {
      count,
      rows: ordered.slice(localOffset, localOffset + limit),
      source: 'year-cache-windowed',
    }
  }

  const filteredChunks = chunks.filter((chunk) => !isChunkOutsideWindow(chunk, startIso, endIso))
  const chunkRowCache = new Map<string, ActivityRow[]>()

  const loadExactChunkRows = async (chunkId: string) => {
    const cachedRows = chunkRowCache.get(chunkId)
    if (cachedRows) return cachedRows

    const chunkMap = await loadYearCacheChunksByIds(stravaId, year, [chunkId])
    const exactRows = filterActivities(chunkMap.get(chunkId) ?? [], sportSet, startIso, endIso)
    chunkRowCache.set(chunkId, exactRows)
    return exactRows
  }

  let count = 0
  const rows: ActivityRow[] = []
  const targetEnd = offset + limit

  for (const chunk of filteredChunks) {
    let exactRows: ActivityRow[] | null = null
    let chunkCount = getFastChunkCount(chunk, sportSet, startIso, endIso)

    if (chunkCount == null) {
      exactRows = await loadExactChunkRows(chunk.id)
      chunkCount = exactRows.length
    }

    if (limit > 0 && count < targetEnd && count + chunkCount > offset) {
      const sourceRows = exactRows ?? (await loadExactChunkRows(chunk.id))
      const chunkOffset = Math.max(0, offset - count)
      const chunkLimit = Math.min(sourceRows.length, targetEnd - count)
      if (chunkOffset < chunkLimit) {
        rows.push(...sourceRows.slice(chunkOffset, chunkLimit))
      }
    }

    count += chunkCount
  }

  return {
    count,
    rows,
    source: 'year-cache-windowed',
  }
}

async function loadYearHistorySlice(
  stravaId: number,
  year: string,
  scope: UserScope,
  sportSet: Set<string> | null,
  startIso: string | null,
  endIso: string | null,
  offset: number,
  limit: number
): Promise<YearSlice> {
  const cachedSlice = await loadYearHistorySliceFromCache(stravaId, year, sportSet, startIso, endIso, offset, limit)
  if (cachedSlice) return cachedSlice

  const fallback = await loadYearFallbackActivities(stravaId, year, scope)
  const filtered = filterActivities(fallback.activities, sportSet, startIso, endIso)

  return {
    count: filtered.length,
    rows: filtered.slice(offset, offset + limit),
    source: fallback.source,
  }
}

function summarizeSources(sources: YearSlice['source'][]) {
  if (sources.every((source) => source === 'year-cache-windowed')) return 'year-cache-windowed'
  if (sources.every((source) => source === 'year-cache')) return 'year-cache'
  if (sources.some((source) => source === 'firestore')) return 'mixed'
  if (sources.some((source) => source === 'year-cache-rebuilt')) return 'year-cache-rebuilt'
  return 'mixed'
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.stravaId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userSnap = await userRef(session.stravaId).get()
  const userData = userSnap.exists ? userSnap.data() : null
  const scope = getUserScope(session.stravaId, userData)

  const url = new URL(req.url)
  const fallbackYear = normalizeRequestedYear(url.searchParams.get('year'), scope)
  const years = parseRequestedYears(url.searchParams.get('years'), scope, fallbackYear)
  const requestedSports = parseRequestedSports(url.searchParams.get('sports'))
  const sportSet = buildEffectiveSportSet(scope, requestedSports)
  const start = parseDate(url.searchParams.get('start'))
  const end = parseDate(url.searchParams.get('end'), true)
  const startIso = start?.toISOString().slice(0, 10) ?? null
  const endIso = end?.toISOString().slice(0, 10) ?? null
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, Number(url.searchParams.get('pageSize') ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE))

  const collectPage = async (targetPage: number) => {
    let remainingOffset = (targetPage - 1) * pageSize
    let totalCount = 0
    const rows: ActivityRow[] = []
    const sources: YearSlice['source'][] = []

    for (const year of years) {
      const slice = await loadYearHistorySlice(
        session.stravaId,
        year,
        scope,
        sportSet,
        startIso,
        endIso,
        remainingOffset,
        pageSize - rows.length
      )

      totalCount += slice.count
      sources.push(slice.source)

      if (rows.length < pageSize) {
        if (remainingOffset >= slice.count) {
          remainingOffset -= slice.count
        } else {
          rows.push(...slice.rows.slice(0, pageSize - rows.length))
          remainingOffset = 0
        }
      }
    }

    return {
      count: totalCount,
      rows,
      source: summarizeSources(sources),
    }
  }

  let result = await collectPage(page)
  const pageCount = Math.max(1, Math.ceil(result.count / pageSize))
  const safePage = Math.min(page, pageCount)

  if (safePage !== page) {
    result = await collectPage(safePage)
  }

  return Response.json(
    {
      years,
      sports: sportSet ? [...sportSet] : requestedSports,
      count: result.count,
      page: safePage,
      pageSize,
      pageCount,
      activities: result.rows,
      source: result.source,
    },
    {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=30' },
    }
  )
}