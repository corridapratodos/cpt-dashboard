export interface Activity {
  stravaId: number
  name: string
  date: string
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
}

export interface Props {
  initialActivities: Activity[]
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

export type RecordEntry = {
  targetKm: number
  activity: Activity
}
