import type { BestEffort } from '@/lib/activity-types'
import type { ActivityYearAnalytics } from '@/lib/analytics-types'

export interface Activity {
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
  bestEfforts: BestEffort[]
}

export interface ActivitySplit {
  index: number
  distanceKm: number
  elapsedSec: number
  movingSec: number | null
  paceSec: number | null
  elevationGain: number | null
  hrAvg: number | null
}

export interface ActivityInterpretation {
  title: string
  summary: string
  callouts: string[]
}

export interface ActivityDetailPayload {
  activity: Activity
  splits: ActivitySplit[]
  interpretation: ActivityInterpretation | null
  splitsAccess: boolean
  splitsSource?: 'cache' | 'strava' | 'unavailable'
}

export interface Props {
  initialActivities: Activity[]
  initialAnalytics: ActivityYearAnalytics | null
  initialYear: string
  availableYears: string[]
  isAdmin: boolean
  meta: DashboardMeta | null
  userName: string
}

export type ThemeMode = 'dark' | 'light'
export type SyncMode = 'incremental' | 'full'

export type DashboardMeta = {
  totalActivities?: number
  lastSync?: string
  lastSyncMode?: string
  viewerRole?: string
  viewerPlan?: string
  viewerAdmin?: boolean
  viewerStravaId?: number
  viewerScope?: {
    years?: string[] | 'all'
    types?: string[] | 'all'
    fullAccess?: boolean
  }
}

export type PeriodTotals = {
  distance: number
  durationSec: number
  sessions: number
  avgPace: number | null
}

export type SleepRecord = {
  date: string
  durationMin: number
  sleepTime: string | null
  wakeTime: string | null
}

export type WeightRecord = {
  date: string
  weightKg: number
  bmi: number | null
  fatPct: number | null
  muscleMassKg: number | null
  waterPct: number | null
}

export type RecordEntry = {
  targetKm: number
  activity: Activity
  displayDurationSec: number
  displayPaceSec: number | null
  source: 'strava-best-effort' | 'estimated'
}

export type VdotZone = {
  label: string
  paceRange: string
  meta: string
}

export type VdotEstimate = {
  value: number
  sourceLabel: string
  sourceMeta: string
  formulaLabel: string
  zones: VdotZone[]
}
