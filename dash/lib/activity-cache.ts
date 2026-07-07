import { buildYearAnalytics, deleteYearAnalyticsBatch, writeYearAnalyticsBatch } from '@/lib/activity-analytics'
import { buildSyncSummary, isQualifiedRun, toDashboardActivity } from '@/lib/dashboard'
import { activitiesRef, yearCacheChunkRef, yearCacheChunksRef, yearCacheIndexRef, yearCachesRef } from '@/lib/firebase'

const YEAR_CACHE_CHUNK_SIZE = 120
const YEAR_CACHE_VERSION = 1
const ACTIVITY_CACHE_FIELDS = [
  'stravaId',
  'name',
  'date',
  'distanceKm',
  'durationSec',
  'paceSec',
  'hrAvg',
  'hrMax',
  'elevationGain',
  'kudos',
  'type',
  'excludedFromMetrics',
  'qualityFlags',
  'bestEfforts',
]

type CachedActivity = ReturnType<typeof toDashboardActivity>

type YearCacheIndex = {
  year: string
  activityCount: number
  chunkCount: number
  chunkSize: number
  sports: string[]
  totalsByType: Record<string, number>
  totalRuns: number
  newestActivityAt: string | null
  updatedAt: Date
  cacheVersion: number
}

type LoadedYearCache = {
  activities: CachedActivity[]
  index: YearCacheIndex
}

function getYearBounds(year: string) {
  const numericYear = Number(year)
  if (!Number.isFinite(numericYear) || numericYear < 2000) {
    throw new Error(`Invalid year cache key: ${year}`)
  }

  return {
    start: new Date(Date.UTC(numericYear, 0, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(numericYear + 1, 0, 1, 0, 0, 0, 0)),
  }
}

function chunkActivities(activities: CachedActivity[]) {
  const chunks: CachedActivity[][] = []

  for (let index = 0; index < activities.length; index += YEAR_CACHE_CHUNK_SIZE) {
    chunks.push(activities.slice(index, index + YEAR_CACHE_CHUNK_SIZE))
  }

  return chunks
}

function asYearCacheIndex(year: string, data: Record<string, unknown>): YearCacheIndex {
  return {
    year,
    activityCount: Number(data.activityCount ?? 0),
    chunkCount: Number(data.chunkCount ?? 0),
    chunkSize: Number(data.chunkSize ?? YEAR_CACHE_CHUNK_SIZE),
    sports: Array.isArray(data.sports) ? data.sports.map(String) : [],
    totalsByType:
      data.totalsByType && typeof data.totalsByType === 'object'
        ? Object.fromEntries(
            Object.entries(data.totalsByType as Record<string, unknown>).map(([type, count]) => [
              type,
              Number(count ?? 0),
            ])
          )
        : {},
    totalRuns: Number(data.totalRuns ?? 0),
    newestActivityAt: data.newestActivityAt ? String(data.newestActivityAt) : null,
    updatedAt:
      data.updatedAt instanceof Date
        ? data.updatedAt
        : typeof (data.updatedAt as { toDate?: () => Date })?.toDate === 'function'
          ? (data.updatedAt as { toDate: () => Date }).toDate()
          : new Date(0),
    cacheVersion: Number(data.cacheVersion ?? 0),
  }
}

export function getActivityYear(dateLike: string | Date | { toDate?: () => Date } | null | undefined) {
  if (!dateLike) return null

  const date =
    dateLike instanceof Date
      ? dateLike
      : typeof (dateLike as { toDate?: () => Date })?.toDate === 'function'
        ? (dateLike as { toDate: () => Date }).toDate()
        : new Date(String(dateLike))

  if (Number.isNaN(date.getTime())) return null
  return String(date.getUTCFullYear())
}

export async function listYearCacheIndexes(stravaId: number) {
  const snap = await yearCachesRef(stravaId).get()
  return snap.docs
    .map((doc) => asYearCacheIndex(doc.id, doc.data()))
    .sort((a, b) => Number(b.year) - Number(a.year))
}

export function summarizeYearCacheIndexes(indexes: YearCacheIndex[]) {
  const totalsByType = indexes.reduce<Record<string, number>>((acc, index) => {
    for (const [type, count] of Object.entries(index.totalsByType)) {
      acc[type] = (acc[type] ?? 0) + count
    }
    return acc
  }, {})

  const availableYears = indexes
    .filter((index) => index.activityCount > 0)
    .map((index) => index.year)
    .sort((a, b) => Number(b) - Number(a))

  const newestActivityAt = indexes
    .map((index) => index.newestActivityAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0] ?? null

  return {
    totalActivities: indexes.reduce((sum, index) => sum + index.activityCount, 0),
    totalRuns: indexes.reduce((sum, index) => sum + index.totalRuns, 0),
    totalsByType,
    availableYears,
    newestActivityAt,
  }
}

export async function loadYearActivitiesFromCache(stravaId: number, year: string): Promise<LoadedYearCache | null> {
  const indexSnap = await yearCacheIndexRef(stravaId, year).get()
  if (!indexSnap.exists) return null

  const index = asYearCacheIndex(year, indexSnap.data() ?? {})
  if (index.cacheVersion !== YEAR_CACHE_VERSION) return null

  const chunkSnap = await yearCacheChunksRef(stravaId, year).orderBy('index', 'asc').get()
  if (index.activityCount > 0 && chunkSnap.empty) return null

  const activities = chunkSnap.docs.flatMap((doc) => {
    const data = doc.data()
    return Array.isArray(data.activities) ? data.activities.map((activity) => toDashboardActivity(activity)) : []
  })

  return { activities, index }
}

export async function rebuildYearActivityCache(stravaId: number, year: string) {
  const { start, end } = getYearBounds(year)
  const now = new Date()
  const rawSnap = await activitiesRef(stravaId)
    .where('date', '>=', start)
    .where('date', '<', end)
    .orderBy('date', 'desc')
    .select(...ACTIVITY_CACHE_FIELDS)
    .get()

  const activities = rawSnap.docs.map((doc) => toDashboardActivity(doc.data()))
  const chunks = chunkActivities(activities)
  const summary = buildSyncSummary(activities)
  const sports = Array.from(new Set(activities.map((activity) => activity.type))).sort()
  const analytics = buildYearAnalytics(year, activities)
  const staleChunkSnap = await yearCacheChunksRef(stravaId, year).get()
  const batch = activitiesRef(stravaId).firestore.batch()
  const indexRef = yearCacheIndexRef(stravaId, year)

  if (!activities.length) {
    batch.delete(indexRef)
    deleteYearAnalyticsBatch(batch, stravaId, year)
    staleChunkSnap.docs.forEach((doc) => batch.delete(doc.ref))
    await batch.commit()
    return {
      year,
      activityCount: 0,
      chunkCount: 0,
      sports: [] as string[],
      summary,
    }
  }

  batch.set(
    indexRef,
    {
      year,
      activityCount: activities.length,
      chunkCount: chunks.length,
      chunkSize: YEAR_CACHE_CHUNK_SIZE,
      sports,
      totalsByType: summary.totalsByType,
      totalRuns: activities.filter(isQualifiedRun).length,
      newestActivityAt: summary.newestActivityAt,
      updatedAt: now,
      cacheVersion: YEAR_CACHE_VERSION,
    },
    { merge: true }
  )

  chunks.forEach((chunk, index) => {
    batch.set(
      yearCacheChunkRef(stravaId, year, String(index).padStart(4, '0')),
      {
        index,
        activities: chunk,
        updatedAt: now,
        cacheVersion: YEAR_CACHE_VERSION,
      },
      { merge: true }
    )
  })

  writeYearAnalyticsBatch(batch, stravaId, analytics)

  staleChunkSnap.docs
    .filter((doc) => {
      const index = Number(doc.data().index ?? Number.NaN)
      return !Number.isFinite(index) || index >= chunks.length
    })
    .forEach((doc) => batch.delete(doc.ref))

  await batch.commit()

  return {
    year,
    activityCount: activities.length,
    chunkCount: chunks.length,
    sports,
    summary,
  }
}

export async function rebuildYearActivityCaches(stravaId: number, years: string[]) {
  const uniqueYears = Array.from(new Set(years.filter((year) => /^\d{4}$/.test(year)))).sort((a, b) => Number(b) - Number(a))

  const rebuilt = []
  for (const year of uniqueYears) {
    rebuilt.push(await rebuildYearActivityCache(stravaId, year))
  }

  return rebuilt
}
