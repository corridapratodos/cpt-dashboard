const DAY_MS = 24 * 60 * 60 * 1000

export const LEGAL_VERSION = '2026-06-27'
export const FULL_SYNC_COOLDOWN_MS = 7 * DAY_MS
export const CURRENT_YEAR = new Date().getFullYear()
export const FREE_PLAN_YEARS = 2
export const PRO_PLAN_YEARS = 5
export const FREE_PLAN_YEAR = CURRENT_YEAR
export const FREE_PLAN_TYPES = ['Run', 'Walk'] as const
export const PRO_PLAN_TYPES = ['Run', 'Walk', 'TrailRun', 'Hike', 'VirtualRun'] as const

function buildAllowedYears(yearsBack: number): string[] {
  return Array.from({ length: yearsBack }, (_, i) => String(CURRENT_YEAR - i))
}

export type UserPlan = 'free' | 'pro'
export type UserRole = 'master' | 'admin' | 'user'

type UserShape = {
  role?: string | null
  plan?: string | null
  legal?: {
    version?: string | null
    termsAcceptedAt?: unknown
    privacyAcceptedAt?: unknown
  } | null
} | null | undefined

export type UserScope = {
  role: UserRole
  plan: UserPlan
  fullAccess: boolean
  allowedYears: string[] | 'all'
  allowedTypes: string[] | 'all'
}

function parseIdList(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry) && entry > 0)
}

function getMasterIdsFromEnv() {
  return parseIdList(process.env.ADMIN_STRAVA_IDS)
}

function getProIdsFromEnv() {
  return parseIdList(process.env.PRO_STRAVA_IDS)
}

export function hasMasterAccess(stravaId: number, userData?: UserShape) {
  if (userData?.role === 'master') return true
  return getMasterIdsFromEnv().includes(stravaId)
}

export function hasAdminAccess(stravaId: number, userData?: UserShape) {
  if (hasMasterAccess(stravaId, userData)) return true
  return userData?.role === 'admin'
}

export function getUserPlan(stravaId: number, userData?: UserShape): UserPlan {
  if (hasAdminAccess(stravaId, userData)) return 'pro'
  if (userData?.plan === 'pro') return 'pro'
  if (getProIdsFromEnv().includes(stravaId)) return 'pro'
  return 'free'
}

export function getUserScope(stravaId: number, userData?: UserShape): UserScope {
  const role: UserRole = hasMasterAccess(stravaId, userData)
    ? 'master'
    : userData?.role === 'admin'
      ? 'admin'
      : 'user'

  const plan = getUserPlan(stravaId, userData)
  const fullAccess = role === 'master' || role === 'admin'

  if (fullAccess) {
    return {
      role,
      plan: 'pro',
      fullAccess: true,
      allowedYears: 'all',
      allowedTypes: 'all',
    }
  }

  if (plan === 'pro') {
    return {
      role,
      plan: 'pro',
      fullAccess: false,
      allowedYears: buildAllowedYears(PRO_PLAN_YEARS),
      allowedTypes: [...PRO_PLAN_TYPES],
    }
  }

  return {
    role,
    plan: 'free',
    fullAccess: false,
    allowedYears: buildAllowedYears(FREE_PLAN_YEARS),
    allowedTypes: [...FREE_PLAN_TYPES],
  }
}

export function isActivityAllowedForScope(activity: { type?: string | null; date?: string | Date | { toDate?: () => Date } | null }, scope: UserScope) {
  if (scope.fullAccess) return true

  const type = String(activity.type ?? '')
  if (!scope.allowedTypes.includes(type)) return false

  const value = activity.date
  const date = value instanceof Date
    ? value
    : typeof (value as { toDate?: () => Date })?.toDate === 'function'
      ? (value as { toDate: () => Date }).toDate()
      : value
        ? new Date(String(value))
        : null

  if (!date || Number.isNaN(date.getTime())) return false
  if (scope.allowedYears === 'all') return true
  return scope.allowedYears.includes(String(date.getUTCFullYear()))
}

export function hasAcceptedLegal(userData?: UserShape) {
  const legal = userData?.legal
  return Boolean(
    legal?.version === LEGAL_VERSION &&
    legal?.termsAcceptedAt &&
    legal?.privacyAcceptedAt
  )
}

export function parseStoredDate(value: unknown) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof (value as { toDate?: () => Date })?.toDate === 'function') {
    return (value as { toDate: () => Date }).toDate()
  }

  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
