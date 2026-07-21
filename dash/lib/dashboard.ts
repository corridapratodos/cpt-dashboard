import { Query } from 'firebase-admin/firestore'
import { CURRENT_YEAR, FREE_PLAN_TYPES, type UserScope } from '@/lib/access'
import type { StoredBestEffort } from '@/lib/activity-types'
import { getCanonicalLocalDate } from '@/lib/training-metrics'

type StoredActivity = {
  stravaId: number
  name: string
  date: string
  localDate: string
  startDateLocal: string | null
  timezone: string | null
  distanceKm: number
  durationSec: number
  paceSec: number | null
  hrAvg: number | null
  hrMax: number | null
  elevationGain: number
  kudos: number
  type: string
  excludedFromMetrics: boolean
  qualityFlags: string[]
  bestEfforts: StoredBestEffort[]
}

type SyncSummary = {
  availableYears: string[]
  totalActivities: number
  totalRuns: number
  totalsByType: Record<string, number>
  newestActivityAt: string | null
}

function asDate(value: unknown) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof (value as { toDate?: () => Date })?.toDate === 'function') {
    return (value as { toDate: () => Date }).toDate()
  }

  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function toDashboardActivity(data: any): StoredActivity {
  const date = asDate(data.date)

  return {
    stravaId: Number(data.stravaId),
    name: String(data.name ?? 'Atividade'),
    date: date?.toISOString() ?? new Date(0).toISOString(),
    distanceKm: Number(data.distanceKm ?? 0),
    localDate: getCanonicalLocalDate(data),
    startDateLocal: typeof data.startDateLocal === 'string' ? data.startDateLocal : null,
    timezone: typeof data.timezone === 'string' ? data.timezone : null,
    durationSec: Number(data.durationSec ?? 0),
    paceSec: data.paceSec == null ? null : Number(data.paceSec),
    hrAvg: data.hrAvg == null ? null : Number(data.hrAvg),
    hrMax: data.hrMax == null ? null : Number(data.hrMax),
    elevationGain: Number(data.elevationGain ?? 0),
    kudos: Number(data.kudos ?? 0),
    type: String(data.type ?? 'Workout'),
    excludedFromMetrics: data.excludedFromMetrics === true,
    qualityFlags: Array.isArray(data.qualityFlags) ? data.qualityFlags.map(String) : [],
    bestEfforts: Array.isArray(data.bestEfforts)
      ? data.bestEfforts
          .map((effort: any) => ({
            name: String(effort?.name ?? 'Best effort'),
            distanceKm: Number(effort?.distanceKm ?? 0),
            elapsedSec: Number(effort?.elapsedSec ?? 0),
            movingSec: effort?.movingSec == null ? null : Number(effort.movingSec),
          }))
          .filter((effort: StoredBestEffort) => effort.distanceKm > 0 && effort.elapsedSec > 0)
      : [],
  }
}

export function isQualifiedRun(activity: StoredActivity) {
  return (
    !activity.excludedFromMetrics &&
    activity.type === 'Run' &&
    activity.distanceKm >= 2 &&
    activity.durationSec >= 20 * 60 &&
    activity.paceSec != null &&
    activity.paceSec >= 270 &&
    activity.paceSec <= 600
  )
}

export function extractAvailableYears(activities: Array<{ date: string; localDate?: string }>) {
  return Array.from(
    new Set(
      activities
        .map((activity) => Number((activity.localDate || activity.date).slice(0, 4)))
        .filter((year) => Number.isFinite(year) && year > 2000)
        .map(String)
    )
  ).sort((a, b) => Number(b) - Number(a))
}

export function mergeAvailableYears(
  preservedYears: string[] | undefined,
  nextYears: string[] | undefined,
  replacedYears: Iterable<string> = [],
) {
  const replaced = new Set(Array.from(replacedYears, String))
  const merged = new Set<string>()

  for (const year of preservedYears ?? []) {
    if (/^\d{4}$/.test(year) && !replaced.has(year)) merged.add(year)
  }

  for (const year of nextYears ?? []) {
    if (/^\d{4}$/.test(year)) merged.add(year)
  }

  return Array.from(merged).sort((a, b) => Number(b) - Number(a))
}

export function buildSyncSummary(activities: StoredActivity[]): SyncSummary {
  const totalsByType = activities.reduce<Record<string, number>>((acc, activity) => {
    acc[activity.type] = (acc[activity.type] ?? 0) + 1
    return acc
  }, {})

  const availableYears = extractAvailableYears(activities)

  const newestActivityAt = [...activities]
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? null

  return {
    availableYears,
    totalActivities: activities.length,
    totalRuns: activities.filter(isQualifiedRun).length,
    totalsByType,
    newestActivityAt,
  }
}

export function serializeFirestoreValue(value: any): any {
  if (value == null) return value
  if (typeof value?.toDate === 'function') return value.toDate().toISOString()
  if (Array.isArray(value)) return value.map(serializeFirestoreValue)
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, serializeFirestoreValue(nested)])
    )
  }
  return value
}

export function normalizeRequestedYear(year: string | null | undefined, scope: UserScope) {
  const currentYear = String(CURRENT_YEAR)
  if (scope.fullAccess) return year ?? currentYear

  const allowed = scope.allowedYears
  if (allowed === 'all') return year ?? currentYear
  if (year && allowed.includes(year)) return year
  return allowed[0] ?? currentYear
}

export function getVisibleYears(scope: UserScope, metaYears: string[] | undefined) {
  const allMeta = Array.isArray(metaYears) && metaYears.length ? metaYears : [String(CURRENT_YEAR)]

  if (scope.fullAccess) return allMeta

  const allowed = scope.allowedYears
  if (allowed === 'all') return allMeta

  const visible = allMeta.filter((y) => allowed.includes(y))
  return visible.length ? visible : [...allowed]
}

export function getVisibleTypes(scope: UserScope) {
  return scope.fullAccess ? 'all' : [...FREE_PLAN_TYPES]
}

export function buildActivitiesQuery(baseQuery: Query, year: string, scope?: UserScope) {
  const effectiveScope = scope ?? {
    fullAccess: true,
    allowedYears: 'all',
    allowedTypes: 'all',
    plan: 'pro',
    role: 'admin',
  }

  const effectiveYear = normalizeRequestedYear(year, effectiveScope)
  let query: Query = baseQuery

  if (!effectiveScope.fullAccess && effectiveScope.allowedTypes !== 'all') {
    query = query.where('type', 'in', effectiveScope.allowedTypes)
  }

  if (effectiveYear !== 'all') {
    const numericYear = Number(effectiveYear)
    if (Number.isFinite(numericYear) && numericYear >= 2000) {
      const start = new Date(Date.UTC(numericYear, 0, 1, 0, 0, 0, 0))
      const end = new Date(Date.UTC(numericYear + 1, 0, 1, 0, 0, 0, 0))

      query = query
        .where('date', '>=', start)
        .where('date', '<', end)
    }
  }

  return query.orderBy('date', 'desc')
}

