import type { ActivityYearAnalytics, AnalyticsActivityStub, AnalyticsDay, AnalyticsDaySport } from '@/lib/analytics-types'
import type { Activity, PeriodTotals, RecordEntry, VdotEstimate } from './types'
import {
  DAY_MS,
  WEEK_MS,
  focusOrder,
  fmt,
  getMetricMode,
  getSportAccent,
  getSportLabel,
  pctChange,
  runLikeTypes,
  startOfWeek,
} from './helpers'

export type WindowMode = 'year' | 'month' | 'week' | 'rolling28'
export type WindowOption = { key: string; label: string; start: Date; end: Date }

type ActiveDay = AnalyticsDay & {
  sessions: number
  excludedSessions: number
  distanceKm: number
  durationSec: number
  reliablePaceCount: number
  reliablePaceSumSec: number
}

type DayGroupTotals = PeriodTotals & {
  activeDays: number
}

type RoutineConsistency = {
  activeDays: number
  trackedWeeks: number
  solidWeeks: number
  activeDaysPerWeek: number
  activeDaysPerWeekLabel: string
  currentStreakDays: number
  longestStreakDays: number
  status: 'alto' | 'baixo' | 'equilibrado'
  title: string
  copy: string
}

function round1(value: number) {
  return Number(value.toFixed(1))
}

function toActivity(stub: AnalyticsActivityStub): Activity {
  return {
    stravaId: stub.stravaId,
    name: stub.name,
    date: stub.date,
    distanceKm: stub.distanceKm,
    durationSec: stub.durationSec,
    paceSec: stub.paceSec,
    hrAvg: null,
    hrMax: null,
    elevationGain: 0,
    kudos: 0,
    type: stub.type,
    excludedFromMetrics: false,
    qualityFlags: [],
    bestEfforts: [],
  }
}

function decorateDay(day: AnalyticsDay): ActiveDay {
  return day.sports.reduce(
    (acc, sport) => {
      acc.sessions += sport.sessions
      acc.excludedSessions += sport.excludedSessions
      acc.distanceKm = round1(acc.distanceKm + sport.includedDistanceKm)
      acc.durationSec += sport.includedDurationSec
      acc.reliablePaceCount += sport.reliablePaceCount
      acc.reliablePaceSumSec += sport.reliablePaceSumSec
      return acc
    },
    {
      ...day,
      sessions: 0,
      excludedSessions: 0,
      distanceKm: 0,
      durationSec: 0,
      reliablePaceCount: 0,
      reliablePaceSumSec: 0,
    }
  )
}

function groupTotals(days: ActiveDay[]): DayGroupTotals {
  const totals = days.reduce(
    (acc, day) => {
      acc.distance += day.distanceKm
      acc.durationSec += day.durationSec
      acc.sessions += day.sessions
      acc.paceCount += day.reliablePaceCount
      acc.paceSum += day.reliablePaceSumSec
      return acc
    },
    {
      distance: 0,
      durationSec: 0,
      sessions: 0,
      paceCount: 0,
      paceSum: 0,
    }
  )

  return {
    distance: round1(totals.distance),
    durationSec: totals.durationSec,
    sessions: totals.sessions,
    avgPace: totals.paceCount ? Math.round(totals.paceSum / totals.paceCount) : null,
    activeDays: days.length,
  }
}

function groupDaysByPeriod(days: ActiveDay[], mode: 'month' | 'week') {
  const groups = new Map<string, { label: string; days: ActiveDay[] }>()

  for (const day of days) {
    const date = new Date(`${day.date}T00:00:00Z`)
    const key =
      mode === 'month'
        ? day.date.slice(0, 7)
        : startOfWeek(date).toISOString().slice(0, 10)

    if (!groups.has(key)) {
      if (mode === 'month') {
        const start = new Date(`${key}-01T00:00:00Z`)
        groups.set(key, {
          label: start.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
          days: [],
        })
      } else {
        const start = new Date(`${key}T00:00:00Z`)
        const end = new Date(start.getTime() + WEEK_MS - 1)
        groups.set(key, {
          label: `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })} - ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' })}`,
          days: [],
        })
      }
    }

    groups.get(key)?.days.push(day)
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, value]) => ({
      key,
      label: value.label,
      days: value.days.sort((a, b) => b.date.localeCompare(a.date)),
    }))
}

function buildWindowOptions(days: ActiveDay[], mode: 'month' | 'week'): WindowOption[] {
  return groupDaysByPeriod(days, mode).map((group) => {
    const newest = group.days[0]?.date ?? ''
    if (mode === 'month') {
      const start = new Date(`${group.key}-01T00:00:00Z`)
      const date = newest ? new Date(`${newest}T00:00:00Z`) : start
      const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999))
      return { key: group.key, label: group.label, start, end }
    }

    const start = new Date(`${group.key}T00:00:00Z`)
    const end = new Date(start.getTime() + WEEK_MS - 1)
    return { key: group.key, label: group.label, start, end }
  })
}


function getRoutineConsistency(days: ActiveDay[]): RoutineConsistency | null {
  if (!days.length) return null

  const sortedAsc = [...days].sort((a, b) => a.date.localeCompare(b.date))
  const sortedDesc = [...days].sort((a, b) => b.date.localeCompare(a.date))
  const weekMap = new Map<string, number>()

  for (const day of days) {
    const weekKey = startOfWeek(new Date(`${day.date}T00:00:00Z`)).toISOString().slice(0, 10)
    weekMap.set(weekKey, (weekMap.get(weekKey) ?? 0) + 1)
  }

  let currentStreakDays = 1
  for (let index = 1; index < sortedDesc.length; index += 1) {
    const previous = new Date(`${sortedDesc[index - 1].date}T00:00:00Z`)
    const current = new Date(`${sortedDesc[index].date}T00:00:00Z`)
    const gap = Math.round((previous.getTime() - current.getTime()) / DAY_MS)
    if (gap !== 1) break
    currentStreakDays += 1
  }

  let longestStreakDays = 1
  let streak = 1
  for (let index = 1; index < sortedAsc.length; index += 1) {
    const previous = new Date(`${sortedAsc[index - 1].date}T00:00:00Z`)
    const current = new Date(`${sortedAsc[index].date}T00:00:00Z`)
    const gap = Math.round((current.getTime() - previous.getTime()) / DAY_MS)
    if (gap === 1) {
      streak += 1
      longestStreakDays = Math.max(longestStreakDays, streak)
    } else {
      streak = 1
    }
  }

  const trackedWeeks = weekMap.size
  const solidWeeks = [...weekMap.values()].filter((count) => count >= 3).length
  const activeDays = days.length
  const activeDaysPerWeek = trackedWeeks > 0 ? activeDays / trackedWeeks : activeDays
  const activeDaysPerWeekLabel = `${activeDaysPerWeek.toFixed(1)}d`
  const solidRatio = trackedWeeks > 0 ? solidWeeks / trackedWeeks : 0

  let status: RoutineConsistency['status'] = 'equilibrado'
  let title = 'Rotina sustentada'
  let copy = `Voce manteve media de ${activeDaysPerWeek.toFixed(1)} dias ativos por semana e emplacou ${solidWeeks} das ${trackedWeeks} semanas com pelo menos 3 dias de treino.`

  if (activeDaysPerWeek >= 4 && solidRatio >= 0.7 && currentStreakDays >= 3) {
    status = 'alto'
    title = 'Rotina bem encaixada'
    copy = `A frequencia do recorte esta forte: ${activeDaysPerWeek.toFixed(1)} dias ativos por semana, ${solidWeeks} semanas firmes e ${currentStreakDays} dias seguidos no momento.`
  } else if (activeDaysPerWeek < 2.5 || solidRatio < 0.45) {
    status = 'baixo'
    title = 'Rotina ainda irregular'
    copy = `O recorte mostra menos continuidade do que volume puro. A media ficou em ${activeDaysPerWeek.toFixed(1)} dias ativos por semana e so ${solidWeeks} das ${trackedWeeks} semanas bateram 3 dias de treino.`
  }

  return {
    activeDays,
    trackedWeeks,
    solidWeeks,
    activeDaysPerWeek: round1(activeDaysPerWeek),
    activeDaysPerWeekLabel,
    currentStreakDays,
    longestStreakDays,
    status,
    title,
    copy,
  }
}

const VDOT_RECENT_DAYS = 90
const VDOT_ZONE_DEFS = [
  { label: 'Leve', min: 0.59, max: 0.74, meta: 'base aerobica e recuperacao' },
  { label: 'Maratona', min: 0.75, max: 0.84, meta: 'ritmo sustentado controlado' },
  { label: 'Limiar', min: 0.83, max: 0.88, meta: 'tempo run e blocos longos' },
  { label: 'Intervalado', min: 0.95, max: 1, meta: 'VO2, tiros de 3 a 5 min' },
  { label: 'Repeticao', min: 1.05, max: 1.1, meta: 'economia e velocidade curta' },
]

function estimateVdot(distanceKm: number, durationSec: number) {
  if (distanceKm < 3 || durationSec <= 0) return null

  const timeMin = durationSec / 60
  const velocityMPerMin = (distanceKm * 1000) / timeMin
  const oxygenCost = -4.6 + 0.182258 * velocityMPerMin + 0.000104 * velocityMPerMin ** 2
  const maxFraction = 0.8 + 0.1894393 * Math.exp(-0.012778 * timeMin) + 0.2989558 * Math.exp(-0.1932605 * timeMin)
  const vdot = oxygenCost / maxFraction

  return Number.isFinite(vdot) && vdot >= 20 && vdot <= 85 ? vdot : null
}

function velocityForOxygenCost(oxygenCost: number) {
  const a = 0.000104
  const b = 0.182258
  const c = -4.6 - oxygenCost
  const discriminant = b ** 2 - 4 * a * c
  if (discriminant <= 0) return null
  return (-b + Math.sqrt(discriminant)) / (2 * a)
}

function paceForVelocity(velocityMPerMin: number) {
  return Math.round(1000 / velocityMPerMin * 60)
}

function getVdotEstimate(days: ActiveDay[]): VdotEstimate | null {
  const runDays = days.filter((day) => day.sports.some((sport) => runLikeTypes.has(sport.type)))
  if (!runDays.length) return null

  const latestDate = new Date(`${runDays[0].date}T00:00:00Z`)
  const recentCutoff = new Date(latestDate.getTime() - VDOT_RECENT_DAYS * DAY_MS).toISOString().slice(0, 10)
  const candidates = runDays.flatMap((day) =>
    day.sports
      .filter((sport) => runLikeTypes.has(sport.type))
      .flatMap((sport) => sport.recordCandidates.map((candidate) => ({ ...candidate, dayDate: day.date })))
  )

  const scored = candidates
    .map((candidate) => ({ ...candidate, vdot: estimateVdot(candidate.targetKm, candidate.displayDurationSec) }))
    .filter((candidate): candidate is typeof candidate & { vdot: number } => candidate.vdot != null)

  if (!scored.length) return null

  const chooseBest = (items: typeof scored) => [...items].sort((a, b) => b.vdot - a.vdot || b.targetKm - a.targetKm)[0]
  const recent = scored.filter((candidate) => candidate.dayDate >= recentCutoff)
  const best =
    chooseBest(recent.filter((candidate) => candidate.source === 'strava-best-effort')) ??
    chooseBest(recent) ??
    chooseBest(scored.filter((candidate) => candidate.source === 'strava-best-effort')) ??
    chooseBest(scored)

  if (!best) return null

  const vdot = round1(best.vdot)
  const vdotVelocity = velocityForOxygenCost(vdot)
  if (!vdotVelocity) return null

  const zones = VDOT_ZONE_DEFS.map((zone) => {
    const fastPace = paceForVelocity(vdotVelocity * zone.max)
    const slowPace = paceForVelocity(vdotVelocity * zone.min)
    return {
      label: zone.label,
      paceRange: `${fmt.pace(fastPace)}-${fmt.pace(slowPace)}/km`,
      meta: zone.meta,
    }
  })

  const isRecent = best.dayDate >= recentCutoff
  const sourceKind = best.source === 'strava-best-effort' ? 'best effort oficial' : 'atividade estimada'

  return {
    value: vdot,
    sourceLabel: `${best.targetKm} km em ${fmt.clock(best.displayDurationSec)}`,
    sourceMeta: `${sourceKind} ${isRecent ? 'recente' : 'historico'} - ${fmt.fullDate(`${best.dayDate}T00:00:00Z`)}`,
    formulaLabel: 'VDOT = VO2 estimado / fracao sustentavel pelo tempo',
    zones,
  }
}
function getRecords(days: ActiveDay[]): RecordEntry[] {
  const candidates = new Map<number, RecordEntry>()

  for (const day of days) {
    for (const sport of day.sports) {
      for (const candidate of sport.recordCandidates) {
        const current = candidates.get(candidate.targetKm)
        if (!current || candidate.displayDurationSec < current.displayDurationSec) {
          candidates.set(candidate.targetKm, {
            targetKm: candidate.targetKm,
            activity: toActivity(candidate.activity),
            displayDurationSec: candidate.displayDurationSec,
            displayPaceSec: candidate.displayPaceSec,
            source: candidate.source,
          })
        }
      }
    }
  }

  return Array.from(candidates.values()).sort((a, b) => a.targetKm - b.targetKm)
}

export function computeDashboardSlices(params: {
  actualYears: string[]
  selectedYears: string[]
  selectedSports: string[]
  yearAnalytics: Record<string, ActivityYearAnalytics>
  windowMode: WindowMode
  selectedMonthKey: string
  selectedWeekKey: string
}) {
  const { actualYears, selectedYears, selectedSports, yearAnalytics, windowMode, selectedMonthKey, selectedWeekKey } = params

  const mergedDays = selectedYears
    .flatMap((year) => yearAnalytics[year]?.days ?? [])
    .sort((a, b) => b.date.localeCompare(a.date))

  const availableSportsSource = Array.from(
    new Set(selectedYears.flatMap((year) => yearAnalytics[year]?.sports ?? []))
  )
  const availableSports = [
    ...focusOrder.filter((type) => availableSportsSource.includes(type)),
    ...availableSportsSource.filter((type) => !focusOrder.includes(type)).sort(),
  ]

  const allSportsSelected = availableSports.length > 0 && selectedSports.length === availableSports.length
  const allYearsSelected = actualYears.length > 0 && selectedYears.length === actualYears.length
  const selectedSportSet = new Set(selectedSports)

  const filteredDays = mergedDays
    .map((day) => ({
      ...day,
      sports: !selectedSports.length || allSportsSelected ? day.sports : day.sports.filter((sport) => selectedSportSet.has(sport.type)),
    }))
    .filter((day) => day.sports.length > 0)
    .map(decorateDay)

  const monthOptions = buildWindowOptions(filteredDays, 'month')
  const weekOptions = buildWindowOptions(filteredDays, 'week')
  const primarySport = selectedSports.length === 1 ? selectedSports[0] : 'All'
  const baseYearLabel = allYearsSelected ? 'historico completo' : selectedYears.length === 1 ? selectedYears[0] : `${selectedYears.length} anos`

  const emptyWindow = {
    days: [] as ActiveDay[],
    label: baseYearLabel,
    title: 'Ano',
    start: null as Date | null,
    end: null as Date | null,
    volumeTitle: 'Volume mensal',
    volumeSubtitle: 'Quilometragem agrupada por mes dentro do recorte ativo',
    comparisonTitle: 'Comparativo 28 dias',
    comparisonSubtitle: 'Janela atual versus as 4 semanas imediatamente anteriores.',
  }

  if (!filteredDays.length) {
    return {
      availableSports,
      allSportsSelected,
      allYearsSelected,
      mergedDays,
      filteredDays,
      monthOptions,
      weekOptions,
      primarySport,
      activeWindow: emptyWindow,
      ignoredCount: 0,
      stats: null,
      volumeSeries: [] as Array<{ label: string; km: number; sessions: number }>,
      performanceTimeline: [] as Array<{ date: string; label: string; paceLabel: string; speedLabel: string; metricValue: number | null }>,
      periodComparison: null,
      weeklyLoad: [] as Array<{ week: string; km: number; sessions: number; load: number }>,
      loadInsight: null,
      routineConsistency: null as RoutineConsistency | null,
      periodContext: null,
      periodRadar: null,
      periodBenchmark: null,
      records: [] as RecordEntry[],
      vdotEstimate: null as VdotEstimate | null,
    }
  }

  const latestDate = new Date(`${filteredDays[0].date}T00:00:00Z`)
  let activeWindow = emptyWindow

  if (windowMode === 'month') {
    const selectedMonth = monthOptions.find((option) => option.key === selectedMonthKey) ?? monthOptions[0]
    const start = selectedMonth?.start ?? new Date(Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth(), 1))
    const end = selectedMonth?.end ?? new Date(Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth() + 1, 0, 23, 59, 59, 999))
    activeWindow = {
      days: filteredDays.filter((day) => day.date >= start.toISOString().slice(0, 10) && day.date <= end.toISOString().slice(0, 10)),
      label: selectedMonth?.label ?? latestDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      title: 'Mes',
      start,
      end,
      volumeTitle: 'Volume diario',
      volumeSubtitle: 'Quilometragem por dia dentro do mes selecionado',
      comparisonTitle: 'Comparativo mensal',
      comparisonSubtitle: 'Mes selecionado versus o mes imediatamente anterior.',
    }
  } else if (windowMode === 'week') {
    const selectedWeek = weekOptions.find((option) => option.key === selectedWeekKey) ?? weekOptions[0]
    const start = selectedWeek?.start ?? startOfWeek(latestDate)
    const end = selectedWeek?.end ?? new Date(start.getTime() + WEEK_MS - 1)
    activeWindow = {
      days: filteredDays.filter((day) => day.date >= start.toISOString().slice(0, 10) && day.date <= end.toISOString().slice(0, 10)),
      label: selectedWeek?.label ?? `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' })} a ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' })}`,
      title: 'Semana',
      start,
      end,
      volumeTitle: 'Volume diario',
      volumeSubtitle: 'Quilometragem por dia dentro da semana selecionada',
      comparisonTitle: 'Comparativo semanal',
      comparisonSubtitle: 'Semana selecionada versus a semana imediatamente anterior.',
    }
  } else if (windowMode === 'rolling28') {
    const start = new Date(latestDate.getTime() - 27 * DAY_MS)
    activeWindow = {
      days: filteredDays.filter((day) => day.date >= start.toISOString().slice(0, 10) && day.date <= latestDate.toISOString().slice(0, 10)),
      label: `ultimos 28 dias ate ${latestDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' })}`,
      title: '28 dias',
      start,
      end: latestDate,
      volumeTitle: 'Volume diario',
      volumeSubtitle: 'Quilometragem por dia dentro dos ultimos 28 dias',
      comparisonTitle: 'Comparativo 28 dias',
      comparisonSubtitle: 'Janela atual versus as 4 semanas imediatamente anteriores.',
    }
  } else {
    activeWindow = {
      ...emptyWindow,
      days: filteredDays,
    }
  }

  const analyzedDays = activeWindow.days.filter((day) => day.sessions > day.excludedSessions)
  const ignoredCount = activeWindow.days.reduce((sum, day) => sum + day.excludedSessions, 0)
  const daySports = activeWindow.days.flatMap((day) => day.sports)
  const analyzedSports = activeWindow.days.flatMap((day) =>
    day.sports.filter((sport) => sport.sessions > sport.excludedSessions)
  )
  const statsTotals = groupTotals(analyzedDays)

  let longest: AnalyticsActivityStub | null = null
  let fastestPace: AnalyticsActivityStub | null = null
  let fastestSpeed: AnalyticsActivityStub | null = null
  const totalsByType = analyzedSports.reduce<Record<string, number>>((acc, sport) => {
    acc[sport.type] = (acc[sport.type] ?? 0) + (sport.sessions - sport.excludedSessions)
    longest = sport.maxDistanceActivity && (!longest || sport.maxDistanceActivity.distanceKm > longest.distanceKm)
      ? sport.maxDistanceActivity
      : longest
    fastestPace =
      sport.fastestPaceActivity &&
      (!fastestPace || (sport.fastestPaceActivity.paceSec ?? Infinity) < (fastestPace.paceSec ?? Infinity))
        ? sport.fastestPaceActivity
        : fastestPace
    fastestSpeed = sport.fastestSpeedActivity
      ? (() => {
          const currentSpeed = fastestSpeed && fastestSpeed.durationSec > 0 ? fastestSpeed.distanceKm / (fastestSpeed.durationSec / 3600) : 0
          const candidateSpeed = sport.fastestSpeedActivity.durationSec > 0 ? sport.fastestSpeedActivity.distanceKm / (sport.fastestSpeedActivity.durationSec / 3600) : 0
          return candidateSpeed > currentSpeed ? sport.fastestSpeedActivity : fastestSpeed
        })()
      : fastestSpeed
    return acc
  }, {})

  const dominantSport = Object.entries(totalsByType).sort((a, b) => b[1] - a[1])[0] ?? null
  const mode = getMetricMode(primarySport)
  const longestActivity = longest ? toActivity(longest) : null
  const fastestActivity = fastestPace ? toActivity(fastestPace) : null
  const fastestSpeedActivity = fastestSpeed ? toActivity(fastestSpeed) : null

  const stats = longestActivity
    ? {
        totalDist: statsTotals.distance,
        totalDur: statsTotals.durationSec,
        longest: longestActivity,
        avgPace: statsTotals.avgPace,
        fastest: fastestActivity,
        avgSpeed: statsTotals.durationSec > 0 ? statsTotals.distance / (statsTotals.durationSec / 3600) : 0,
        fastestSpeed: fastestSpeedActivity ?? longestActivity,
        dominantSport,
        count: statsTotals.sessions,
        shareRun: statsTotals.sessions ? Math.round(((totalsByType.Run ?? 0) / statsTotals.sessions) * 100) : 0,
        mode,
      }
    : null

  const volumeSeries = (() => {
    const map = new Map<string, { label: string; km: number; sessions: number }>()
    for (const day of analyzedDays) {
      const key = windowMode === 'year' ? day.date.slice(0, 7) : day.date
      const label = windowMode === 'year' ? fmt.month(`${day.date}T00:00:00Z`) : fmt.date(`${day.date}T00:00:00Z`)
      const current = map.get(key) ?? { label, km: 0, sessions: 0 }
      current.km += day.distanceKm
      current.sessions += day.sessions - day.excludedSessions
      map.set(key, current)
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => ({ label: value.label, km: round1(value.km), sessions: value.sessions }))
  })()

  const performanceTimeline = (() => {
    const recent = [...analyzedDays].reverse().slice(windowMode === 'year' ? -24 : -42)
    return recent
      .map((day) => {
        const metricValue =
          mode === 'speed'
            ? day.durationSec > 0
              ? day.distanceKm / (day.durationSec / 3600)
              : null
            : day.reliablePaceCount
              ? day.reliablePaceSumSec / day.reliablePaceCount
              : null
        const speed = day.durationSec > 0 ? day.distanceKm / (day.durationSec / 3600) : 0
        return {
          date: fmt.date(`${day.date}T00:00:00Z`),
          label: fmt.fullDate(`${day.date}T00:00:00Z`),
          paceLabel: day.reliablePaceCount ? fmt.pace(Math.round(day.reliablePaceSumSec / day.reliablePaceCount)) : '-',
          speedLabel: `${speed.toFixed(1)} km/h`,
          metricValue,
        }
      })
      .filter((item) => item.metricValue != null)
  })()

  const periodComparison = (() => {
    if (!filteredDays.length) return null

    const currentEnd = activeWindow.end ?? new Date(`${filteredDays[0].date}T00:00:00Z`)
    const currentStart = activeWindow.start ?? new Date(currentEnd.getTime() - 27 * DAY_MS)
    let previousStart = new Date(currentStart.getTime() - 28 * DAY_MS)
    let previousEnd = new Date(currentStart.getTime() - DAY_MS)

    if (windowMode === 'month') {
      previousStart = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() - 1, 1))
      previousEnd = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth(), 0, 23, 59, 59, 999))
    } else if (windowMode === 'week') {
      previousStart = new Date(currentStart.getTime() - WEEK_MS)
      previousEnd = new Date(currentStart.getTime() - 1)
    }

    const current = groupTotals(
      filteredDays.filter((day) => day.date >= currentStart.toISOString().slice(0, 10) && day.date <= currentEnd.toISOString().slice(0, 10) && day.sessions > day.excludedSessions)
    )
    const previous = groupTotals(
      filteredDays.filter((day) => day.date >= previousStart.toISOString().slice(0, 10) && day.date <= previousEnd.toISOString().slice(0, 10) && day.sessions > day.excludedSessions)
    )

    return {
      current,
      previous,
      distanceChange: pctChange(current.distance, previous.distance),
      sessionChange: pctChange(current.sessions, previous.sessions),
      durationChange: pctChange(current.durationSec, previous.durationSec),
      paceChange: current.avgPace && previous.avgPace ? ((previous.avgPace - current.avgPace) / previous.avgPace) * 100 : 0,
    }
  })()

  const weeklyLoad = (() => {
    const baseDays = filteredDays.filter((day) => day.sessions > day.excludedSessions)
    if (!baseDays.length) return [] as Array<{ week: string; km: number; sessions: number; load: number }>

    const latest = new Date(`${baseDays[0].date}T00:00:00Z`)
    const currentWeekStart = startOfWeek(latest)

    return Array.from({ length: 8 }, (_, index) => {
      const weekStart = new Date(currentWeekStart.getTime() - (7 - index) * WEEK_MS)
      const weekEnd = new Date(weekStart.getTime() + WEEK_MS)
      const items = baseDays.filter((day) => {
        const date = new Date(`${day.date}T00:00:00Z`)
        return date >= weekStart && date < weekEnd
      })
      const totals = groupTotals(items)
      const paceFactor = totals.avgPace ? 360 / totals.avgPace : 1
      return {
        week: `${String(weekStart.getUTCDate()).padStart(2, '0')}/${String(weekStart.getUTCMonth() + 1).padStart(2, '0')}`,
        km: totals.distance,
        sessions: totals.sessions,
        load: round1(totals.distance * paceFactor),
      }
    })
  })()

  const loadInsight = (() => {
    if (weeklyLoad.length < 5) return null
    const currentWeek = weeklyLoad[weeklyLoad.length - 1]
    const baseline = weeklyLoad.slice(-5, -1)
    const avgLoad = baseline.reduce((sum, item) => sum + item.load, 0) / baseline.length
    const avgKm = baseline.reduce((sum, item) => sum + item.km, 0) / baseline.length
    const ratio = avgLoad > 0 ? currentWeek.load / avgLoad : 1

    let stableWeeks = 0
    for (let index = weeklyLoad.length - 1; index >= 0; index -= 1) {
      const item = weeklyLoad[index]
      if (avgKm === 0) break
      const withinBand = item.km >= avgKm * 0.85 && item.km <= avgKm * 1.15
      if (!withinBand) break
      stableWeeks += 1
    }

    let status = 'equilibrado'
    let recommendation = 'Carga sob controle. Da para manter a progressao atual.'
    if (ratio >= 1.18) {
      status = 'alto'
      recommendation = 'Semana acima da media recente. Vale considerar deload ou reduzir intensidade na proxima janela.'
    } else if (ratio <= 0.72) {
      status = 'baixo'
      recommendation = 'Semana bem abaixo da media recente. Pode ser recuperacao ou quebra de consistencia.'
    }

    return {
      currentWeek,
      avgLoad: round1(avgLoad),
      stableWeeks,
      status,
      recommendation,
    }
  })()

  const routineConsistency = getRoutineConsistency(analyzedDays)
  const vdotEstimate = getVdotEstimate(filteredDays.filter((day) => day.sessions > day.excludedSessions))

  const periodContext = (() => {
    if (!stats || !analyzedDays.length) return null
    const activeWeeks = new Set(analyzedDays.map((day) => startOfWeek(new Date(`${day.date}T00:00:00Z`)).toISOString().slice(0, 10))).size
    const oldest = analyzedDays[analyzedDays.length - 1]
    const newest = analyzedDays[0]
    const spanStart = activeWindow.start ?? new Date(`${oldest.date}T00:00:00Z`)
    const spanEnd = activeWindow.end ?? new Date(`${newest.date}T00:00:00Z`)
    const spanDays = Math.max(1, Math.round((spanEnd.getTime() - spanStart.getTime()) / DAY_MS) + 1)
    const densityPct = Math.round((analyzedDays.length / spanDays) * 100)
    const avgSessionKm = stats.totalDist / stats.count
    const avgSessionMinutes = stats.totalDur / stats.count / 60
    const longestSharePct = stats.totalDist > 0 ? Math.round((stats.longest.distanceKm / stats.totalDist) * 100) : 0
    const sessionsPerWeek = activeWeeks ? stats.count / activeWeeks : stats.count

    return {
      activeDays: analyzedDays.length,
      spanDays,
      densityPct,
      avgSessionKm: round1(avgSessionKm),
      avgSessionMinutes: Math.round(avgSessionMinutes),
      longestSharePct,
      sessionsPerWeek: round1(sessionsPerWeek),
    }
  })()

  const periodRadar = (() => {
    if (!analyzedDays.length) return null

    const weekdayMap = new Map<string, number>()
    let weekendSessions = 0

    for (const day of analyzedDays) {
      const date = new Date(`${day.date}T00:00:00Z`)
      const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '')
      weekdayMap.set(weekday, (weekdayMap.get(weekday) ?? 0) + day.sessions)
      if (date.getUTCDay() === 0 || date.getUTCDay() === 6) weekendSessions += day.sessions
    }

    const strongestDay = [...analyzedDays].sort((a, b) => b.distanceKm - a.distanceKm || b.durationSec - a.durationSec)[0]
    const uniqueDays = analyzedDays.map((day) => day.date).sort((a, b) => a.localeCompare(b))

    let biggestGapDays = 0
    for (let index = 1; index < uniqueDays.length; index += 1) {
      const previous = new Date(`${uniqueDays[index - 1]}T00:00:00Z`)
      const current = new Date(`${uniqueDays[index]}T00:00:00Z`)
      const gapDays = Math.max(0, Math.round((current.getTime() - previous.getTime()) / DAY_MS) - 1)
      if (gapDays > biggestGapDays) biggestGapDays = gapDays
    }

    const topWeekday = Array.from(weekdayMap.entries()).sort((a, b) => b[1] - a[1])[0]
    const totalSessions = analyzedDays.reduce((sum, day) => sum + day.sessions, 0)
    return {
      biggestGapDays,
      strongestDay: {
        key: strongestDay.date,
        distance: strongestDay.distanceKm,
        durationSec: strongestDay.durationSec,
        label: fmt.fullDate(`${strongestDay.date}T00:00:00Z`),
      },
      strongestDaySharePct: totalSessions > 0 ? Math.round((strongestDay.distanceKm / statsTotals.distance) * 100) : 0,
      topWeekdayLabel: topWeekday ? `${topWeekday[0].charAt(0).toUpperCase()}${topWeekday[0].slice(1)}` : '-',
      topWeekdaySharePct: topWeekday && totalSessions > 0 ? Math.round((topWeekday[1] / totalSessions) * 100) : 0,
      weekendSharePct: totalSessions > 0 ? Math.round((weekendSessions / totalSessions) * 100) : 0,
    }
  })()

  const periodBenchmark = (() => {
    if (windowMode !== 'month' && windowMode !== 'week') return null

    const rows = groupDaysByPeriod(filteredDays.filter((day) => day.sessions > day.excludedSessions), windowMode).map((group) => {
      const totals = groupTotals(group.days)
      return {
        key: group.key,
        label: group.label,
        distance: totals.distance,
        sessions: totals.sessions,
        avgPace: totals.avgPace,
      }
    })

    const currentKey = windowMode === 'month' ? selectedMonthKey : selectedWeekKey
    const current = rows.find((row) => row.key === currentKey)
    if (!current || rows.length < 2) return null

    const byDistance = [...rows].sort((a, b) => b.distance - a.distance)
    const rank = byDistance.findIndex((row) => row.key === current.key) + 1
    const avgDistance = rows.reduce((sum, row) => sum + row.distance, 0) / rows.length
    const avgSessions = rows.reduce((sum, row) => sum + row.sessions, 0) / rows.length
    const paceRows = rows.filter((row) => row.avgPace != null)
    const avgPace = paceRows.length
      ? Math.round(paceRows.reduce((sum, row) => sum + (row.avgPace ?? 0), 0) / paceRows.length)
      : null
    const paceDelta = current.avgPace != null && avgPace != null
      ? ((avgPace - current.avgPace) / avgPace) * 100
      : null

    return {
      rank,
      total: rows.length,
      averageDistance: round1(avgDistance),
      averageSessions: round1(avgSessions),
      best: byDistance[0],
      current,
      paceDelta,
      label: windowMode === 'month' ? 'meses' : 'semanas',
    }
  })()

  return {
    availableSports,
    allSportsSelected,
    allYearsSelected,
    mergedDays,
    filteredDays,
    monthOptions,
    weekOptions,
    primarySport,
    activeWindow,
    ignoredCount,
    stats,
    volumeSeries,
    performanceTimeline,
    periodComparison,
    weeklyLoad,
    loadInsight,
    routineConsistency,
    periodContext,
    periodRadar,
    periodBenchmark,
    records: getRecords(analyzedDays),
    vdotEstimate,
  }
}

export function buildSportSummaryLabel(selectedSports: string[], availableSports: string[]) {
  if (availableSports.length > 0 && selectedSports.length === availableSports.length) return 'visao multiesporte'
  if (selectedSports.length === 1) return getSportLabel(selectedSports[0])
  return `${selectedSports.length} esportes`
}

export function buildActiveAccent(selectedSports: string[], availableSports: string[]) {
  const allSportsSelected = availableSports.length > 0 && selectedSports.length === availableSports.length
  if (allSportsSelected || selectedSports.length !== 1) return 'var(--accent)'
  return getSportAccent(selectedSports[0])
}





export type DashboardSlices = ReturnType<typeof computeDashboardSlices>

