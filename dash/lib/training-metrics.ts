export const DAY_MS = 24 * 60 * 60 * 1000
export const WEEK_MS = 7 * DAY_MS

export type PaceActivity = {
  type: string
  distanceKm: number
  durationSec: number
  paceSec: number | null
  excludedFromMetrics?: boolean
  qualityFlags?: string[]
}

const CRITICAL_QUALITY_FLAGS = new Set(['manual-ignore', 'invalid-distance', 'invalid-duration', 'invalid-pace'])

const PACE_SANITY_RANGES: Record<string, { min: number; max: number }> = {
  Run: { min: 150, max: 900 },
  VirtualRun: { min: 150, max: 900 },
  TrailRun: { min: 180, max: 1800 },
  Walk: { min: 300, max: 2400 },
  Hike: { min: 300, max: 2400 },
}

export function hasCriticalMetricQualityIssue(activity: Pick<PaceActivity, 'qualityFlags'>) {
  return (activity.qualityFlags ?? []).some((flag) => CRITICAL_QUALITY_FLAGS.has(flag))
}

export function isReliablePerformanceActivity(activity: PaceActivity) {
  if (activity.excludedFromMetrics) return false
  if (activity.paceSec == null || !Number.isFinite(activity.paceSec)) return false
  if (activity.distanceKm < 2 || activity.durationSec < 20 * 60) return false
  if (hasCriticalMetricQualityIssue(activity)) return false

  const range = PACE_SANITY_RANGES[activity.type] ?? { min: 120, max: 3600 }
  return activity.paceSec >= range.min && activity.paceSec <= range.max
}

export function calculateAggregatePace(durationSec: number, distanceKm: number) {
  if (!Number.isFinite(durationSec) || !Number.isFinite(distanceKm) || durationSec <= 0 || distanceKm <= 0) {
    return null
  }
  return Math.round(durationSec / distanceKm)
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function getCanonicalLocalDate(activity: { localDate?: unknown; startDateLocal?: unknown; date?: unknown }) {
  if (isIsoDate(activity.localDate)) return activity.localDate
  if (typeof activity.startDateLocal === 'string') {
    const localPrefix = activity.startDateLocal.slice(0, 10)
    if (isIsoDate(localPrefix)) return localPrefix
  }

  const value = activity.date
  const resolved = value instanceof Date
    ? value
    : typeof (value as { toDate?: () => Date })?.toDate === 'function'
      ? (value as { toDate: () => Date }).toDate()
      : value
        ? new Date(String(value))
        : null

  return resolved && !Number.isNaN(resolved.getTime()) ? resolved.toISOString().slice(0, 10) : '1970-01-01'
}

export function getOfficialBestEffortDuration(effort: { elapsedSec: number; movingSec: number | null }) {
  return Number.isFinite(effort.elapsedSec) && effort.elapsedSec > 0 ? Math.round(effort.elapsedSec) : null
}

export function startOfIsoWeek(date: Date) {
  const value = new Date(date)
  const day = value.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  value.setUTCHours(0, 0, 0, 0)
  value.setUTCDate(value.getUTCDate() + diff)
  return value
}

export function getCalendarConsistency(dateKeys: string[], windowStart: Date, windowEnd: Date) {
  const uniqueDates = Array.from(new Set(dateKeys.filter(isIsoDate))).sort()
  const activeSet = new Set(uniqueDates)
  const start = new Date(windowStart)
  const end = new Date(windowEnd)
  start.setUTCHours(0, 0, 0, 0)
  end.setUTCHours(0, 0, 0, 0)

  const startKey = start.toISOString().slice(0, 10)
  const endKey = end.toISOString().slice(0, 10)
  const firstWeek = startOfIsoWeek(start)
  const lastWeek = startOfIsoWeek(end)
  const weekCounts: number[] = []

  for (let cursor = new Date(firstWeek); cursor <= lastWeek; cursor = new Date(cursor.getTime() + WEEK_MS)) {
    let count = 0
    for (let offset = 0; offset < 7; offset += 1) {
      const key = new Date(cursor.getTime() + offset * DAY_MS).toISOString().slice(0, 10)
      if (key >= startKey && key <= endKey && activeSet.has(key)) count += 1
    }
    weekCounts.push(count)
  }

  let longestStreakDays = 0
  let runningStreak = 0
  for (let cursor = new Date(start); cursor <= end; cursor = new Date(cursor.getTime() + DAY_MS)) {
    if (activeSet.has(cursor.toISOString().slice(0, 10))) {
      runningStreak += 1
      longestStreakDays = Math.max(longestStreakDays, runningStreak)
    } else {
      runningStreak = 0
    }
  }

  let currentStreakDays = 0
  for (let cursor = new Date(end); cursor >= start; cursor = new Date(cursor.getTime() - DAY_MS)) {
    if (!activeSet.has(cursor.toISOString().slice(0, 10))) break
    currentStreakDays += 1
  }

  const trackedWeeks = weekCounts.length
  const activeDays = uniqueDates.filter((key) => key >= startKey && key <= endKey).length

  return {
    activeDays,
    trackedWeeks,
    solidWeeks: weekCounts.filter((count) => count >= 3).length,
    activeDaysPerWeek: trackedWeeks > 0 ? activeDays / trackedWeeks : 0,
    currentStreakDays,
    longestStreakDays,
    weekCounts,
  }
}
