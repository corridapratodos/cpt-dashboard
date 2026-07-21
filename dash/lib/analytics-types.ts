import type { StoredBestEffort } from '@/lib/activity-types'

export const ANALYTICS_CACHE_VERSION = 3
export const ANALYTICS_RECORD_TARGETS = [3, 5, 10, 15, 21.1, 30] as const

export type ActivityLite = {
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

export type AnalyticsActivityStub = Pick<
  ActivityLite,
  'stravaId' | 'name' | 'date' | 'localDate' | 'distanceKm' | 'durationSec' | 'paceSec' | 'type'
>

export type AnalyticsRecordCandidate = {
  targetKm: number
  source: 'strava-best-effort' | 'estimated'
  displayDurationSec: number
  displayPaceSec: number | null
  activity: AnalyticsActivityStub
}

export type AnalyticsDaySport = {
  type: string
  sessions: number
  includedSessions: number
  excludedSessions: number
  distanceKm: number
  durationSec: number
  includedDistanceKm: number
  includedDurationSec: number
  reliableDistanceKm: number
  reliableDurationSec: number
  reliablePaceCount: number
  reliablePaceSumSec: number
  maxDistanceActivity: AnalyticsActivityStub | null
  fastestPaceActivity: AnalyticsActivityStub | null
  fastestSpeedActivity: AnalyticsActivityStub | null
  recordCandidates: AnalyticsRecordCandidate[]
}

export type AnalyticsDay = {
  date: string
  sports: AnalyticsDaySport[]
}

export type ActivityYearAnalytics = {
  year: string
  activityCount: number
  sports: string[]
  totalsByType: Record<string, number>
  days: AnalyticsDay[]
  updatedAt: string | null
  cacheVersion: number
}
