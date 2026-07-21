import type { DashboardAiPayload } from '@/lib/dashboard-ai'

export const DASHBOARD_AI_MAX_BODY_BYTES = 64 * 1024

type Validator = (value: unknown) => boolean

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 500
}

function isNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 10_000_000
}

function isNullableNumber(value: unknown) {
  return value == null || isNumber(value)
}

function hasShape(value: unknown, shape: Record<string, Validator>) {
  if (!isRecord(value)) return false
  const expectedKeys = Object.keys(shape)
  const actualKeys = Object.keys(value)
  return actualKeys.length === expectedKeys.length &&
    actualKeys.every((key) => key in shape) &&
    expectedKeys.every((key) => shape[key](value[key]))
}

function isArrayOf(value: unknown, max: number, validator: Validator) {
  return Array.isArray(value) && value.length <= max && value.every(validator)
}

const periodTotalsValidator: Validator = (value) => hasShape(value, {
  distanceKm: isNumber,
  sessions: isNumber,
  durationSec: isNumber,
  avgPaceSec: isNullableNumber,
})

const statsValidator: Validator = (value) => value == null || hasShape(value, {
  sessions: isNumber,
  distanceKm: isNumber,
  durationSec: isNumber,
  avgPaceSec: isNullableNumber,
  longestSessionKm: isNumber,
  fastestPaceSec: isNullableNumber,
})

const consistencyValidator: Validator = (value) => value == null || hasShape(value, {
  activeDays: isNumber,
  trackedWeeks: isNumber,
  solidWeeks: isNumber,
  activeDaysPerWeek: isNumber,
  currentStreakDays: isNumber,
  longestStreakDays: isNumber,
  status: isString,
  title: isString,
  copy: isString,
})

const comparisonValidator: Validator = (value) => value == null || hasShape(value, {
  current: periodTotalsValidator,
  previous: periodTotalsValidator,
  delta: (delta) => hasShape(delta, {
    distancePct: isNumber,
    sessionsPct: isNumber,
    durationPct: isNumber,
    pacePct: isNullableNumber,
  }),
})

const contextValidator: Validator = (value) => value == null || hasShape(value, {
  activeDays: isNumber,
  spanDays: isNumber,
  densityPct: isNumber,
  avgSessionKm: isNumber,
  avgSessionMinutes: isNumber,
  longestSharePct: isNumber,
  sessionsPerWeek: isNumber,
})

const radarValidator: Validator = (value) => value == null || hasShape(value, {
  biggestGapDays: isNumber,
  strongestDay: (day) => hasShape(day, { label: isString, distanceKm: isNumber, durationSec: isNumber }),
  strongestDaySharePct: isNumber,
  topWeekdayLabel: isString,
  topWeekdaySharePct: isNumber,
  weekendSharePct: isNumber,
})

const vdotValidator: Validator = (value) => value == null || hasShape(value, {
  value: isNumber,
  source: isString,
  sourceMeta: isString,
  zones: (zones) => isArrayOf(zones, 8, (zone) => hasShape(zone, {
    label: isString,
    paceRange: isString,
    meta: isString,
  })),
})

const payloadShape: Record<string, Validator> = {
  athleteName: isString,
  generatedAt: isString,
  sportFocus: isString,
  yearLabel: isString,
  windowLabel: isString,
  activeWindowTitle: isString,
  stats: statsValidator,
  routineConsistency: consistencyValidator,
  periodComparison: comparisonValidator,
  periodContext: contextValidator,
  periodRadar: radarValidator,
  analysisInsights: (insights) => isArrayOf(insights, 8, (insight) => hasShape(insight, {
    title: isString,
    copy: isString,
  })),
  vdotEstimate: vdotValidator,
  recentActivities: (activities) => isArrayOf(activities, 12, (activity) => hasShape(activity, {
    date: isString,
    name: isString,
    type: isString,
    distanceKm: isNumber,
    durationSec: isNumber,
    paceSec: isNullableNumber,
    hrAvg: isNullableNumber,
  })),
}

export function validateDashboardAiPayload(value: unknown): value is DashboardAiPayload {
  if (!hasShape(value, payloadShape)) return false
  return new TextEncoder().encode(JSON.stringify(value)).length <= DASHBOARD_AI_MAX_BODY_BYTES
}
