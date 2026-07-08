import type { WriteBatch } from 'firebase-admin/firestore'
import { isRunLikeType } from '@/lib/activity-types'
import type {
  ActivityLite,
  ActivityYearAnalytics,
  AnalyticsActivityStub,
  AnalyticsDay,
  AnalyticsDaySport,
  AnalyticsRecordCandidate,
} from '@/lib/analytics-types'
import { ANALYTICS_CACHE_VERSION, ANALYTICS_RECORD_TARGETS } from '@/lib/analytics-types'
import type { UserScope } from '@/lib/access'
import { isActivityAllowedForScope } from '@/lib/access'
import { yearAnalyticsRef } from '@/lib/firebase'

const PERFORMANCE_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun', 'Walk', 'Hike'])

function round1(value: number) {
  return Number(value.toFixed(1))
}

function toIsoDate(value: unknown) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof (value as { toDate?: () => Date })?.toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString()
  }
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function getDistanceTolerance(targetKm: number) {
  if (targetKm <= 5) return 0.35
  if (targetKm <= 10) return 0.75
  if (targetKm <= 21.1) return 1.25
  return 1.75
}

function isReliablePaceActivity(activity: ActivityLite) {
  if (activity.excludedFromMetrics) return false
  if (activity.paceSec == null || activity.distanceKm < 2 || activity.durationSec < 20 * 60) return false

  if (isRunLikeType(activity.type)) {
    return activity.paceSec >= 270 && activity.paceSec <= 600
  }

  if (activity.type === 'Walk' || activity.type === 'Hike') {
    return activity.paceSec >= 480 && activity.paceSec <= 1500
  }

  return activity.paceSec >= 120 && activity.paceSec <= 3600
}

function toActivityStub(activity: ActivityLite): AnalyticsActivityStub {
  return {
    stravaId: activity.stravaId,
    name: activity.name,
    date: activity.date,
    distanceKm: round1(activity.distanceKm),
    durationSec: Math.round(activity.durationSec),
    paceSec: activity.paceSec == null ? null : Math.round(activity.paceSec),
    type: activity.type,
  }
}

function chooseLongerActivity(current: AnalyticsActivityStub | null, candidate: AnalyticsActivityStub) {
  if (!current) return candidate
  if (candidate.distanceKm > current.distanceKm) return candidate
  if (candidate.distanceKm === current.distanceKm && candidate.durationSec > current.durationSec) return candidate
  return current
}

function chooseFasterPaceActivity(current: AnalyticsActivityStub | null, candidate: AnalyticsActivityStub) {
  if (candidate.paceSec == null) return current
  if (!current || current.paceSec == null) return candidate
  return candidate.paceSec < current.paceSec ? candidate : current
}

function chooseFasterSpeedActivity(current: AnalyticsActivityStub | null, candidate: AnalyticsActivityStub) {
  const currentSpeed = current && current.durationSec > 0 ? current.distanceKm / (current.durationSec / 3600) : 0
  const candidateSpeed = candidate.durationSec > 0 ? candidate.distanceKm / (candidate.durationSec / 3600) : 0
  return candidateSpeed > currentSpeed ? candidate : current
}

function buildRecordCandidates(activity: ActivityLite): AnalyticsRecordCandidate[] {
  if (!PERFORMANCE_TYPES.has(activity.type) || !isReliablePaceActivity(activity)) return []

  const officialByTarget = new Map<number, AnalyticsRecordCandidate>()

  for (const targetKm of ANALYTICS_RECORD_TARGETS) {
    const officialMatches = activity.bestEfforts
      .filter((effort) => Math.abs(effort.distanceKm - targetKm) <= getDistanceTolerance(targetKm))
      .map((effort) => {
        const displayDurationSec = effort.movingSec ?? effort.elapsedSec
        return {
          targetKm,
          source: 'strava-best-effort' as const,
          displayDurationSec,
          displayPaceSec: Math.round(displayDurationSec / targetKm),
          activity: toActivityStub(activity),
        }
      })

    if (!officialMatches.length) continue

    const best = officialMatches.reduce((winner, current) =>
      current.displayDurationSec < winner.displayDurationSec ? current : winner
    )
    officialByTarget.set(targetKm, best)
  }

  const candidates = Array.from(officialByTarget.values())

  for (const targetKm of ANALYTICS_RECORD_TARGETS) {
    if (officialByTarget.has(targetKm)) continue
    const tolerance = getDistanceTolerance(targetKm)
    if (Math.abs(activity.distanceKm - targetKm) > tolerance) continue

    candidates.push({
      targetKm,
      source: 'estimated',
      displayDurationSec: Math.round((activity.paceSec ?? 0) * targetKm),
      displayPaceSec: activity.paceSec == null ? null : Math.round(activity.paceSec),
      activity: toActivityStub(activity),
    })
  }

  return candidates
}

function mergeRecordCandidates(current: AnalyticsRecordCandidate[], incoming: AnalyticsRecordCandidate[]) {
  const map = new Map<number, AnalyticsRecordCandidate>()

  for (const candidate of current) {
    map.set(candidate.targetKm, candidate)
  }

  for (const candidate of incoming) {
    const existing = map.get(candidate.targetKm)
    if (!existing || candidate.displayDurationSec < existing.displayDurationSec) {
      map.set(candidate.targetKm, candidate)
    }
  }

  return Array.from(map.values()).sort((a, b) => a.targetKm - b.targetKm)
}

function sanitizeActivityStub(value: unknown): AnalyticsActivityStub | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  return {
    stravaId: Number(source.stravaId ?? 0),
    name: String(source.name ?? 'Atividade'),
    date: String(source.date ?? ''),
    distanceKm: Number(source.distanceKm ?? 0),
    durationSec: Number(source.durationSec ?? 0),
    paceSec: source.paceSec == null ? null : Number(source.paceSec),
    type: String(source.type ?? 'Workout'),
  }
}

function sanitizeRecordCandidate(value: unknown): AnalyticsRecordCandidate | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const activity = sanitizeActivityStub(source.activity)
  if (!activity) return null

  return {
    targetKm: Number(source.targetKm ?? 0),
    source: source.source === 'strava-best-effort' ? 'strava-best-effort' : 'estimated',
    displayDurationSec: Number(source.displayDurationSec ?? 0),
    displayPaceSec: source.displayPaceSec == null ? null : Number(source.displayPaceSec),
    activity,
  }
}

function sanitizeDaySport(value: unknown): AnalyticsDaySport | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const recordCandidates = Array.isArray(source.recordCandidates)
    ? source.recordCandidates
        .map(sanitizeRecordCandidate)
        .filter((candidate): candidate is AnalyticsRecordCandidate => Boolean(candidate))
    : []

  return {
    type: String(source.type ?? 'Workout'),
    sessions: Number(source.sessions ?? 0),
    excludedSessions: Number(source.excludedSessions ?? 0),
    distanceKm: Number(source.distanceKm ?? 0),
    durationSec: Number(source.durationSec ?? 0),
    includedDistanceKm: Number(source.includedDistanceKm ?? source.distanceKm ?? 0),
    includedDurationSec: Number(source.includedDurationSec ?? source.durationSec ?? 0),
    reliablePaceCount: Number(source.reliablePaceCount ?? 0),
    reliablePaceSumSec: Number(source.reliablePaceSumSec ?? 0),
    maxDistanceActivity: sanitizeActivityStub(source.maxDistanceActivity),
    fastestPaceActivity: sanitizeActivityStub(source.fastestPaceActivity),
    fastestSpeedActivity: sanitizeActivityStub(source.fastestSpeedActivity),
    recordCandidates,
  }
}

function sanitizeDay(value: unknown): AnalyticsDay | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const sports = Array.isArray(source.sports)
    ? source.sports.map(sanitizeDaySport).filter((sport): sport is AnalyticsDaySport => Boolean(sport))
    : []

  return {
    date: String(source.date ?? ''),
    sports,
  }
}

export function buildYearAnalytics(year: string, activities: ActivityLite[]): ActivityYearAnalytics {
  const dayMap = new Map<string, Map<string, AnalyticsDaySport>>()
  const totalsByType = activities.reduce<Record<string, number>>((acc, activity) => {
    acc[activity.type] = (acc[activity.type] ?? 0) + 1
    return acc
  }, {})

  for (const activity of activities) {
    const dayKey = activity.date.slice(0, 10)
    const sportKey = activity.type
    const daySports = dayMap.get(dayKey) ?? new Map<string, AnalyticsDaySport>()
    const current = daySports.get(sportKey) ?? {
      type: sportKey,
      sessions: 0,
      excludedSessions: 0,
      distanceKm: 0,
      durationSec: 0,
      includedDistanceKm: 0,
      includedDurationSec: 0,
      reliablePaceCount: 0,
      reliablePaceSumSec: 0,
      maxDistanceActivity: null,
      fastestPaceActivity: null,
      fastestSpeedActivity: null,
      recordCandidates: [],
    }

    const stub = toActivityStub(activity)
    current.sessions += 1
    current.distanceKm = round1(current.distanceKm + activity.distanceKm)
    current.durationSec += Math.round(activity.durationSec)

    if (activity.excludedFromMetrics) {
      current.excludedSessions += 1
    } else {
      current.includedDistanceKm = round1(current.includedDistanceKm + activity.distanceKm)
      current.includedDurationSec += Math.round(activity.durationSec)
    }

    if (isReliablePaceActivity(activity) && activity.paceSec != null) {
      current.reliablePaceCount += 1
      current.reliablePaceSumSec += Math.round(activity.paceSec)
      current.fastestPaceActivity = chooseFasterPaceActivity(current.fastestPaceActivity, stub)
    }

    current.maxDistanceActivity = chooseLongerActivity(current.maxDistanceActivity, stub)
    current.fastestSpeedActivity = chooseFasterSpeedActivity(current.fastestSpeedActivity, stub)
    current.recordCandidates = mergeRecordCandidates(current.recordCandidates, buildRecordCandidates(activity))

    daySports.set(sportKey, current)
    dayMap.set(dayKey, daySports)
  }

  const days = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sportsMap]) => ({
      date,
      sports: Array.from(sportsMap.values()).sort((a, b) => a.type.localeCompare(b.type)),
    }))

  return {
    year,
    activityCount: activities.length,
    sports: Array.from(new Set(activities.map((activity) => activity.type))).sort(),
    totalsByType,
    days,
    updatedAt: new Date().toISOString(),
    cacheVersion: ANALYTICS_CACHE_VERSION,
  }
}

export function deleteYearAnalyticsBatch(batch: WriteBatch, stravaId: number, year: string) {
  batch.delete(yearAnalyticsRef(stravaId, year))
}

export function writeYearAnalyticsBatch(
  batch: WriteBatch,
  stravaId: number,
  analytics: ActivityYearAnalytics
) {
  batch.set(
    yearAnalyticsRef(stravaId, analytics.year),
    {
      ...analytics,
      updatedAt: new Date(),
    },
    { merge: true }
  )
}

export async function loadYearAnalyticsFromCache(stravaId: number, year: string): Promise<ActivityYearAnalytics | null> {
  const snap = await yearAnalyticsRef(stravaId, year).get()
  if (!snap.exists) return null

  const data = snap.data() ?? {}
  const days = Array.isArray(data.days)
    ? data.days.map(sanitizeDay).filter((day): day is AnalyticsDay => Boolean(day))
    : []

  return {
    year,
    activityCount: Number(data.activityCount ?? 0),
    sports: Array.isArray(data.sports) ? data.sports.map(String) : [],
    totalsByType:
      data.totalsByType && typeof data.totalsByType === 'object'
        ? Object.fromEntries(Object.entries(data.totalsByType as Record<string, unknown>).map(([type, count]) => [type, Number(count ?? 0)]))
        : {},
    days,
    updatedAt: toIsoDate(data.updatedAt),
    cacheVersion: Number(data.cacheVersion ?? 0),
  }
}

export function applyScopeToYearAnalytics(analytics: ActivityYearAnalytics, scope: UserScope): ActivityYearAnalytics {
  if (scope.fullAccess || scope.allowedTypes === 'all') return analytics

  const allowedTypes = new Set(scope.allowedTypes)
  const filteredDays = analytics.days
    .map((day) => ({
      ...day,
      sports: day.sports.filter((sport) => allowedTypes.has(sport.type)),
    }))
    .filter((day) => day.sports.length > 0)

  const totalsByType = filteredDays.reduce<Record<string, number>>((acc, day) => {
    for (const sport of day.sports) {
      acc[sport.type] = (acc[sport.type] ?? 0) + sport.sessions
    }
    return acc
  }, {})

  return {
    ...analytics,
    activityCount: Object.values(totalsByType).reduce((sum, value) => sum + value, 0),
    sports: Object.keys(totalsByType).sort(),
    totalsByType,
    days: filteredDays,
  }
}

export function extractScopedAnalyticsActivities(analytics: ActivityYearAnalytics, scope: UserScope) {
  return analytics.days.flatMap((day) =>
    day.sports.flatMap((sport) =>
      sport.recordCandidates
        .map((candidate) => candidate.activity)
        .filter((activity) => isActivityAllowedForScope(activity, scope))
    )
  )
}





