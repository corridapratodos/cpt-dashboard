'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { signOut } from 'next-auth/react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Activity, Props, RecordEntry, SleepRecord, SyncMode, ThemeMode, WeightRecord } from './dashboard/types'
import { Sidebar } from './Sidebar'
import {
  DAY_MS,
  ROWS_STEP,
  WEEK_MS,
  applyTheme,
  chartCursor,
  chartTooltip,
  chartTooltipItem,
  chartTooltipLabel,
  focusOrder,
  fmt,
  getDisplayName,
  getDistanceTolerance,
  getMetricMode,
  getPeriodTotals,
  getSportAccent,
  getSportLabel,
  isReliablePaceActivity,
  pctChange,
  performanceTypes,
  readingLayers,
  recordTargets,
  sportMeta,
  startOfWeek,
} from './dashboard/helpers'
import { AnalysisTile, CompareTile, DetailItem, InsightItem, MetricCard, Panel, SectionLead } from './dashboard/ui'

type WindowMode = 'year' | 'month' | 'week' | 'rolling28'
type WindowOption = { key: string; label: string; start: Date; end: Date }

export default function DashboardClient({ initialActivities, initialYear, availableYears, isAdmin, meta, userName }: Props) {
  const actualYears = useMemo(
    () => [...availableYears].filter((year) => year !== 'all').sort((a, b) => Number(b) - Number(a)),
    [availableYears]
  )

  const [syncing, setSyncing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [uploadingHealth, setUploadingHealth] = useState(false)
  const [healthUploadMsg, setHealthUploadMsg] = useState('')
  const [sleepData, setSleepData] = useState<SleepRecord[]>([])
  const [weightData, setWeightData] = useState<WeightRecord[]>([])
  const [activityReviewing, setActivityReviewing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [theme, setTheme] = useState<ThemeMode>('dark')
  const [yearActivities, setYearActivities] = useState<Record<string, Activity[]>>(
    initialYear !== 'all' ? { [initialYear]: initialActivities } : {}
  )
  const [partialYears, setPartialYears] = useState<Record<string, boolean>>(
    initialYear !== 'all' ? { [initialYear]: true } : {}
  )
  const [loadingYears, setLoadingYears] = useState<string[]>([])
  const [selectedYears, setSelectedYears] = useState<string[]>(
    initialYear !== 'all' ? [initialYear] : actualYears
  )
  const [selectedSports, setSelectedSports] = useState<string[]>(['Run'])
  const [windowMode, setWindowMode] = useState<WindowMode>('year')
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('')
  const [selectedWeekKey, setSelectedWeekKey] = useState<string>('')
  const [previewMode, setPreviewMode] = useState<'admin' | 'athlete'>('admin')
  const [page, setPage] = useState(1)
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('cpt-theme')
    const mode: ThemeMode = saved === 'light' ? 'light' : 'dark'
    applyTheme(mode)
    setTheme(mode)
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    const years = selectedYears.length ? selectedYears : actualYears
    if (!years.length) return
    const from = `${Math.min(...years.map(Number))}-01-01`
    const to = `${Math.max(...years.map(Number))}-12-31`
    fetch(`/api/health?from=${from}&to=${to}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return
        setSleepData(data.sleep ?? [])
        setWeightData(data.weight ?? [])
      })
      .catch(() => {})
  }, [isAdmin, selectedYears, actualYears])

  useEffect(() => {
    if (!selectedYears.length && actualYears.length) {
      setSelectedYears([actualYears[0]])
    }
  }, [actualYears, selectedYears.length])

  useEffect(() => {
    setPage(1)
  }, [selectedYears, selectedSports, selectedMonthKey, selectedWeekKey, windowMode])

  useEffect(() => {
    if (!selectedYears.length) return

    let active = true
    const yearsToLoad = selectedYears.filter((year) => !yearActivities[year] || partialYears[year])

    if (!yearsToLoad.length) return

    async function loadYears() {
      setLoadingYears(yearsToLoad)
      setSyncMsg('')

      try {
        const responses = await Promise.all(
          yearsToLoad.map(async (year) => {
            const res = await fetch(`/api/activities?year=${encodeURIComponent(year)}`)
            const data = await res.json()
            if (!res.ok) {
              throw new Error(data?.error ?? `Nao foi possivel carregar ${year}.`)
            }
            return { year, activities: (data.activities ?? []) as Activity[] }
          })
        )

        if (!active) return

        setYearActivities((current) => {
          const next = { ...current }
          for (const response of responses) {
            next[response.year] = response.activities
          }
          return next
        })

        setPartialYears((current) => {
          const next = { ...current }
          for (const response of responses) {
            next[response.year] = false
          }
          return next
        })
      } catch (error) {
        if (!active) return
        setSyncMsg(error instanceof Error ? error.message : 'Nao foi possivel carregar as atividades.')
      } finally {
        if (active) setLoadingYears([])
      }
    }

    void loadYears()

    return () => {
      active = false
    }
  }, [partialYears, selectedYears, yearActivities])

  const handleThemeToggle = () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  const handleSync = async (mode: SyncMode = 'incremental') => {
    if (mode === 'full') {
      const confirmed = window.confirm('Reconstruir o historico vai reprocessar toda a base do atleta. Deseja continuar?')
      if (!confirmed) return
    }

    setSyncing(true)
    setSyncMsg('')

    try {
      const res = await fetch(`/api/strava/sync?mode=${mode}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Erro ao sincronizar')
      const modeLabel = data.mode === 'incremental' ? 'incremental' : 'completo'
      const processedLabel = data.processed && data.processed !== data.synced
        ? `, ${data.processed} processadas`
        : ''
      setSyncMsg(`${data.synced} atividades novas sincronizadas (${modeLabel}${processedLabel})`)
      setPartialYears((current) => {
        const next = { ...current }
        for (const year of selectedYears) next[year] = true
        return next
      })
    } catch (error) {
      setSyncMsg(error instanceof Error ? error.message : 'Erro ao sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm('Isso vai excluir todos os seus dados sincronizados do CPT Dashboard. Deseja continuar?')
    if (!confirmed) return

    setDeleting(true)
    setSyncMsg('')

    try {
      const res = await fetch('/api/account', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Nao foi possivel excluir os dados.')
      await signOut({ callbackUrl: '/login' })
    } catch (error) {
      setSyncMsg(error instanceof Error ? error.message : 'Nao foi possivel excluir os dados.')
      setDeleting(false)
    }
  }


  function applyActivityUpdate(updated: Activity) {
    setYearActivities((current) => {
      const next: Record<string, Activity[]> = {}

      for (const [year, activities] of Object.entries(current)) {
        next[year] = activities.map((activity) => activity.stravaId === updated.stravaId ? updated : activity)
      }

      return next
    })

    setSelectedActivity((current) => current?.stravaId === updated.stravaId ? updated : current)
  }

  async function handleActivityExclusion(excludedFromMetrics: boolean) {
    if (!selectedActivity) return

    setActivityReviewing(true)
    setSyncMsg('')

    try {
      const res = await fetch(`/api/activities/${selectedActivity.stravaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludedFromMetrics }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Nao foi possivel atualizar a atividade.')
      applyActivityUpdate(data.activity as Activity)
    } catch (error) {
      setSyncMsg(error instanceof Error ? error.message : 'Nao foi possivel atualizar a atividade.')
    } finally {
      setActivityReviewing(false)
    }
  }
  const mergedActivities = useMemo(() => {
    const deduped = new Map<number, Activity>()

    for (const year of selectedYears) {
      for (const activity of yearActivities[year] ?? []) {
        deduped.set(activity.stravaId, activity)
      }
    }

    return Array.from(deduped.values()).sort((a, b) => b.date.localeCompare(a.date))
  }, [selectedYears, yearActivities])

  const availableSports = useMemo(() => {
    const fromData = Array.from(new Set(mergedActivities.map((activity) => activity.type)))
    const ordered = focusOrder.filter((type) => fromData.includes(type))
    const remaining = fromData.filter((type) => !ordered.includes(type)).sort()
    return [...ordered, ...remaining]
  }, [mergedActivities])

  useEffect(() => {
    if (!availableSports.length) return

    setSelectedSports((current) => {
      const valid = current.filter((sport) => availableSports.includes(sport))
      if (valid.length === current.length) return current
      if (valid.length) return valid
      if (availableSports.includes('Run')) return ['Run']
      return [...availableSports]
    })
  }, [availableSports])
  const allSportsSelected = availableSports.length > 0 && selectedSports.length === availableSports.length
  const allYearsSelected = actualYears.length > 0 && selectedYears.length === actualYears.length

  const filteredActivities = useMemo(() => {
    if (!selectedSports.length || allSportsSelected) return mergedActivities
    const chosen = new Set(selectedSports)
    return mergedActivities.filter((activity) => chosen.has(activity.type))
  }, [allSportsSelected, mergedActivities, selectedSports])

  const monthOptions = useMemo(() => {
    const map = new Map<string, WindowOption>()

    for (const activity of filteredActivities) {
      const date = new Date(activity.date)
      const start = new Date(date.getFullYear(), date.getMonth(), 1)
      const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
      const key = activity.date.slice(0, 7)
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: start.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
          start,
          end,
        })
      }
    }

    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key))
  }, [filteredActivities])

  const weekOptions = useMemo(() => {
    const map = new Map<string, WindowOption>()

    for (const activity of filteredActivities) {
      const start = startOfWeek(new Date(activity.date))
      const end = new Date(start.getTime() + WEEK_MS - 1)
      const key = start.toISOString().slice(0, 10)
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })} - ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`,
          start,
          end,
        })
      }
    }

    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key))
  }, [filteredActivities])

  useEffect(() => {
    if (!monthOptions.length) {
      if (selectedMonthKey) setSelectedMonthKey('')
      return
    }

    if (!monthOptions.some((option) => option.key == selectedMonthKey)) {
      setSelectedMonthKey(monthOptions[0].key)
    }
  }, [monthOptions, selectedMonthKey])

  useEffect(() => {
    if (!weekOptions.length) {
      if (selectedWeekKey) setSelectedWeekKey('')
      return
    }

    if (!weekOptions.some((option) => option.key == selectedWeekKey)) {
      setSelectedWeekKey(weekOptions[0].key)
    }
  }, [selectedWeekKey, weekOptions])

  const activePeriodOptions = useMemo(() => {
    if (windowMode === 'month') return monthOptions
    if (windowMode === 'week') return weekOptions
    return [] as WindowOption[]
  }, [monthOptions, weekOptions, windowMode])

  const hasPeriodNavigation = windowMode === 'month' || windowMode === 'week'
  const activePeriodKey = windowMode === 'month' ? selectedMonthKey : selectedWeekKey
  const activePeriodIndex = activePeriodOptions.findIndex((option) => option.key === activePeriodKey)
  const canGoToNewerPeriod = activePeriodIndex > 0
  const canGoToOlderPeriod = activePeriodIndex >= 0 && activePeriodIndex < activePeriodOptions.length - 1

  const activeWindow = useMemo(() => {
    const baseYearLabel = allYearsSelected ? 'historico completo' : selectedYears.length === 1 ? selectedYears[0] : `${selectedYears.length} anos`

    if (!filteredActivities.length) {
      return {
        activities: [] as Activity[],
        label: baseYearLabel,
        title: 'Ano',
        start: null as Date | null,
        end: null as Date | null,
        volumeTitle: 'Volume mensal',
        volumeSubtitle: 'Quilometragem agrupada por mes dentro do recorte ativo',
        comparisonTitle: 'Comparativo 28 dias',
        comparisonSubtitle: 'Janela atual versus as 4 semanas imediatamente anteriores.',
      }
    }

    const latestDate = new Date(filteredActivities[0].date)

    if (windowMode === 'month') {
      const selectedMonth = monthOptions.find((option) => option.key === selectedMonthKey) ?? monthOptions[0]
      const start = selectedMonth?.start ?? new Date(latestDate.getFullYear(), latestDate.getMonth(), 1)
      const end = selectedMonth?.end ?? new Date(latestDate.getFullYear(), latestDate.getMonth() + 1, 0, 23, 59, 59, 999)
      return {
        activities: filteredActivities.filter((activity) => {
          const date = new Date(activity.date)
          return date >= start && date <= end
        }),
        label: selectedMonth?.label ?? latestDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
        title: 'Mes',
        start,
        end,
        volumeTitle: 'Volume diario',
        volumeSubtitle: 'Quilometragem por dia dentro do mes selecionado',
        comparisonTitle: 'Comparativo mensal',
        comparisonSubtitle: 'Mes selecionado versus o mes imediatamente anterior.',
      }
    }

    if (windowMode === 'week') {
      const selectedWeek = weekOptions.find((option) => option.key === selectedWeekKey) ?? weekOptions[0]
      const start = selectedWeek?.start ?? startOfWeek(latestDate)
      const end = selectedWeek?.end ?? new Date(start.getTime() + WEEK_MS - 1)
      return {
        activities: filteredActivities.filter((activity) => {
          const date = new Date(activity.date)
          return date >= start && date <= end
        }),
        label: selectedWeek?.label ?? `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} a ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}` ,
        title: 'Semana',
        start,
        end,
        volumeTitle: 'Volume diario',
        volumeSubtitle: 'Quilometragem por dia dentro da semana selecionada',
        comparisonTitle: 'Comparativo semanal',
        comparisonSubtitle: 'Semana selecionada versus a semana imediatamente anterior.',
      }
    }

    if (windowMode === 'rolling28') {
      const start = new Date(latestDate.getTime() - 27 * DAY_MS)
      return {
        activities: filteredActivities.filter((activity) => {
          const date = new Date(activity.date)
          return date >= start && date <= latestDate
        }),
        label: `ultimos 28 dias ate ${latestDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`,
        title: '28 dias',
        start,
        end: latestDate,
        volumeTitle: 'Volume diario',
        volumeSubtitle: 'Quilometragem por dia dentro dos ultimos 28 dias',
        comparisonTitle: 'Comparativo 28 dias',
        comparisonSubtitle: 'Janela atual versus as 4 semanas imediatamente anteriores.',
      }
    }

    return {
      activities: filteredActivities,
      label: baseYearLabel,
      title: 'Ano',
      start: null as Date | null,
      end: null as Date | null,
      volumeTitle: 'Volume mensal',
      volumeSubtitle: 'Quilometragem agrupada por mes dentro do recorte ativo',
      comparisonTitle: 'Comparativo 28 dias',
      comparisonSubtitle: 'Janela atual versus as 4 semanas imediatamente anteriores.',
    }
  }, [allYearsSelected, filteredActivities, monthOptions, selectedMonthKey, selectedYears, selectedWeekKey, weekOptions, windowMode])

  const activeActivities = activeWindow.activities

  const scopedAnalyzedActivities = useMemo(
    () => filteredActivities.filter((activity) => !activity.excludedFromMetrics),
    [filteredActivities]
  )

  const analyzedActivities = useMemo(
    () => activeActivities.filter((activity) => !activity.excludedFromMetrics),
    [activeActivities]
  )

  const ignoredCount = activeActivities.length - analyzedActivities.length

  const reliablePaceActivities = useMemo(
    () => analyzedActivities.filter(isReliablePaceActivity),
    [analyzedActivities]
  )

  const primarySport = selectedSports.length === 1 ? selectedSports[0] : 'All'

  const stats = useMemo(() => {
    if (!analyzedActivities.length) return null

    const totalDist = analyzedActivities.reduce((sum, activity) => sum + activity.distanceKm, 0)
    const totalDur = analyzedActivities.reduce((sum, activity) => sum + activity.durationSec, 0)
    const mode = getMetricMode(primarySport)
    const longestSource = mode === 'pace' && reliablePaceActivities.length ? reliablePaceActivities : analyzedActivities
    const longest = longestSource.reduce((max, activity) => activity.distanceKm > max.distanceKm ? activity : max, longestSource[0])
    const avgPace = reliablePaceActivities.length
      ? Math.round(reliablePaceActivities.reduce((sum, activity) => sum + (activity.paceSec ?? 0), 0) / reliablePaceActivities.length)
      : null
    const fastest = reliablePaceActivities.length
      ? reliablePaceActivities.reduce((min, activity) => (activity.paceSec ?? Infinity) < (min.paceSec ?? Infinity) ? activity : min, reliablePaceActivities[0])
      : null
    const avgSpeed = totalDur > 0 ? totalDist / (totalDur / 3600) : 0
    const fastestSpeed = analyzedActivities.reduce((best, activity) => {
      const bestSpeed = best.durationSec > 0 ? best.distanceKm / (best.durationSec / 3600) : 0
      const currentSpeed = activity.durationSec > 0 ? activity.distanceKm / (activity.durationSec / 3600) : 0
      return currentSpeed > bestSpeed ? activity : best
    }, analyzedActivities[0])
    const totalsByType = analyzedActivities.reduce<Record<string, number>>((acc, activity) => {
      acc[activity.type] = (acc[activity.type] ?? 0) + 1
      return acc
    }, {})
    const dominantSport = Object.entries(totalsByType).sort((a, b) => b[1] - a[1])[0]

    return {
      totalDist,
      totalDur,
      longest,
      avgPace,
      fastest,
      avgSpeed,
      fastestSpeed,
      dominantSport,
      count: analyzedActivities.length,
      shareRun: analyzedActivities.length
        ? Math.round((analyzedActivities.filter((activity) => activity.type === 'Run').length / analyzedActivities.length) * 100)
        : 0,
      mode,
    }
  }, [analyzedActivities, primarySport, reliablePaceActivities, windowMode])

  const volumeSeries = useMemo(() => {
    const map = new Map<string, { label: string; km: number; sessions: number }>()
    analyzedActivities.forEach((activity) => {
      const key = windowMode === 'year' ? activity.date.slice(0, 7) : activity.date.slice(0, 10)
      const label = windowMode === 'year' ? fmt.month(activity.date) : fmt.date(activity.date)
      const current = map.get(key) ?? { label, km: 0, sessions: 0 }
      map.set(key, {
        label: current.label,
        km: current.km + activity.distanceKm,
        sessions: current.sessions + 1,
      })
    })
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => ({ ...value, km: Number(value.km.toFixed(1)) }))
  }, [analyzedActivities, windowMode])

  const performanceTimeline = useMemo(() => {
    const mode = getMetricMode(primarySport)
    const source = mode === 'speed' ? analyzedActivities : reliablePaceActivities
    const recent = windowMode === 'year' ? [...source].reverse().slice(-24) : [...source].reverse().slice(-42)
    return recent
      .map((activity) => {
        const speed = activity.durationSec > 0 ? activity.distanceKm / (activity.durationSec / 3600) : 0
        return {
          date: fmt.date(activity.date),
          label: activity.name,
          paceLabel: fmt.pace(activity.paceSec),
          speedLabel: `${speed.toFixed(1)} km/h`,
          metricValue: mode === 'speed' ? speed : activity.paceSec,
        }
      })
      .filter((item) => item.metricValue != null)
  }, [analyzedActivities, primarySport, reliablePaceActivities, windowMode])

  const periodComparison = useMemo(() => {
    if (!scopedAnalyzedActivities.length) return null

    const latestDate = activeWindow.end ?? new Date(scopedAnalyzedActivities[0].date)
    let currentStart = activeWindow.start ?? new Date(latestDate.getTime() - 27 * DAY_MS)
    let currentEnd = activeWindow.end ?? latestDate
    let previousStart = new Date(currentStart.getTime() - 28 * DAY_MS)
    let previousEnd = new Date(currentStart.getTime() - DAY_MS)

    if (windowMode === 'month') {
      previousStart = new Date(currentStart.getFullYear(), currentStart.getMonth() - 1, 1)
      previousEnd = new Date(currentStart.getFullYear(), currentStart.getMonth(), 0, 23, 59, 59, 999)
    } else if (windowMode === 'week') {
      previousStart = new Date(currentStart.getTime() - WEEK_MS)
      previousEnd = new Date(currentStart.getTime() - 1)
    }

    const current = scopedAnalyzedActivities.filter((activity) => {
      const date = new Date(activity.date)
      return date >= currentStart && date <= currentEnd
    })
    const previous = scopedAnalyzedActivities.filter((activity) => {
      const date = new Date(activity.date)
      return date >= previousStart && date <= previousEnd
    })

    const currentTotals = getPeriodTotals(current)
    const previousTotals = getPeriodTotals(previous)

    return {
      current: currentTotals,
      previous: previousTotals,
      distanceChange: pctChange(currentTotals.distance, previousTotals.distance),
      sessionChange: pctChange(currentTotals.sessions, previousTotals.sessions),
      durationChange: pctChange(currentTotals.durationSec, previousTotals.durationSec),
      paceChange: currentTotals.avgPace && previousTotals.avgPace
        ? ((previousTotals.avgPace - currentTotals.avgPace) / previousTotals.avgPace) * 100
        : 0,
    }
  }, [activeWindow.end, activeWindow.start, scopedAnalyzedActivities, windowMode])

  const weeklyLoad = useMemo(() => {
    if (!scopedAnalyzedActivities.length) return [] as Array<{ week: string; km: number; sessions: number; load: number }>
    const latestDate = new Date(scopedAnalyzedActivities[0].date)
    const currentWeekStart = startOfWeek(latestDate)

    return Array.from({ length: 8 }, (_, index) => {
      const weekStart = new Date(currentWeekStart.getTime() - (7 - index) * WEEK_MS)
      const weekEnd = new Date(weekStart.getTime() + WEEK_MS)
      const items = scopedAnalyzedActivities.filter((activity) => {
        const date = new Date(activity.date)
        return date >= weekStart && date < weekEnd
      })
      const km = items.reduce((sum, item) => sum + item.distanceKm, 0)
      const avgPaceItems = items.filter(isReliablePaceActivity)
      const avgPace = avgPaceItems.length
        ? avgPaceItems.reduce((sum, item) => sum + (item.paceSec ?? 0), 0) / avgPaceItems.length
        : null
      const paceFactor = avgPace ? 360 / avgPace : 1
      return {
        week: `${String(weekStart.getDate()).padStart(2, '0')}/${String(weekStart.getMonth() + 1).padStart(2, '0')}`,
        km: Number(km.toFixed(1)),
        sessions: items.length,
        load: Number((km * paceFactor).toFixed(1)),
      }
    })
  }, [scopedAnalyzedActivities])

  const loadInsight = useMemo(() => {
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
      avgLoad: Number(avgLoad.toFixed(1)),
      stableWeeks,
      status,
      recommendation,
    }
  }, [weeklyLoad])

  const periodContext = useMemo(() => {
    if (!stats || !analyzedActivities.length) return null

    const activeDays = new Set(analyzedActivities.map((activity) => activity.date.slice(0, 10))).size
    const activeWeeks = new Set(analyzedActivities.map((activity) => startOfWeek(new Date(activity.date)).toISOString().slice(0, 10))).size
    const oldest = analyzedActivities[analyzedActivities.length - 1]
    const newest = analyzedActivities[0]
    const spanStart = activeWindow.start ?? new Date(oldest.date)
    const spanEnd = activeWindow.end ?? new Date(newest.date)
    const spanDays = Math.max(1, Math.round((spanEnd.getTime() - spanStart.getTime()) / DAY_MS) + 1)
    const densityPct = Math.round((activeDays / spanDays) * 100)
    const avgSessionKm = stats.totalDist / stats.count
    const avgSessionMinutes = stats.totalDur / stats.count / 60
    const longestSharePct = stats.totalDist > 0 ? Math.round((stats.longest.distanceKm / stats.totalDist) * 100) : 0
    const sessionsPerWeek = activeWeeks ? stats.count / activeWeeks : stats.count

    return {
      activeDays,
      spanDays,
      densityPct,
      avgSessionKm: Number(avgSessionKm.toFixed(1)),
      avgSessionMinutes: Math.round(avgSessionMinutes),
      longestSharePct,
      sessionsPerWeek: Number(sessionsPerWeek.toFixed(1)),
    }
  }, [activeWindow.end, activeWindow.start, analyzedActivities, stats])

  const periodRadar = useMemo(() => {
    if (!analyzedActivities.length) return null

    const dayMap = new Map<string, { distance: number; durationSec: number; sessions: number }>()
    const weekdayMap = new Map<string, number>()
    let weekendSessions = 0

    for (const activity of analyzedActivities) {
      const dayKey = activity.date.slice(0, 10)
      const currentDay = dayMap.get(dayKey) ?? { distance: 0, durationSec: 0, sessions: 0 }
      currentDay.distance += activity.distanceKm
      currentDay.durationSec += activity.durationSec
      currentDay.sessions += 1
      dayMap.set(dayKey, currentDay)

      const date = new Date(activity.date)
      const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
      weekdayMap.set(weekday, (weekdayMap.get(weekday) ?? 0) + 1)
      if (date.getDay() === 0 || date.getDay() === 6) weekendSessions += 1
    }

    const dayRows = Array.from(dayMap.entries()).map(([key, value]) => ({ key, ...value }))
    const strongestDay = [...dayRows].sort((a, b) => b.distance - a.distance || b.durationSec - a.durationSec)[0]
    const uniqueDays = dayRows.map((row) => row.key).sort((a, b) => a.localeCompare(b))

    let biggestGapDays = 0
    for (let index = 1; index < uniqueDays.length; index += 1) {
      const previous = new Date(`${uniqueDays[index - 1]}T00:00:00`)
      const current = new Date(`${uniqueDays[index]}T00:00:00`)
      const gapDays = Math.max(0, Math.round((current.getTime() - previous.getTime()) / DAY_MS) - 1)
      if (gapDays > biggestGapDays) biggestGapDays = gapDays
    }

    const topWeekday = Array.from(weekdayMap.entries()).sort((a, b) => b[1] - a[1])[0]
    const topWeekdayLabel = topWeekday
      ? `${topWeekday[0].charAt(0).toUpperCase()}${topWeekday[0].slice(1)}`
      : '-'
    const topWeekdaySharePct = topWeekday ? Math.round((topWeekday[1] / analyzedActivities.length) * 100) : 0
    const weekendSharePct = Math.round((weekendSessions / analyzedActivities.length) * 100)
    const totalDistance = analyzedActivities.reduce((sum, activity) => sum + activity.distanceKm, 0)
    const strongestDaySharePct = totalDistance > 0 ? Math.round((strongestDay.distance / totalDistance) * 100) : 0

    return {
      biggestGapDays,
      strongestDay: {
        ...strongestDay,
        label: fmt.fullDate(strongestDay.key),
      },
      strongestDaySharePct,
      topWeekdayLabel,
      topWeekdaySharePct,
      weekendSharePct,
    }
  }, [analyzedActivities])

  const periodBenchmark = useMemo(() => {
    if (!scopedAnalyzedActivities.length || (windowMode !== 'month' && windowMode !== 'week')) return null

    const groups = new Map<string, { label: string; distance: number; sessions: number; paceValues: number[] }>()

    for (const activity of scopedAnalyzedActivities) {
      const key = windowMode === 'month'
        ? activity.date.slice(0, 7)
        : startOfWeek(new Date(activity.date)).toISOString().slice(0, 10)

      const label = windowMode === 'month'
        ? new Date(`${key}-01T00:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
        : (() => {
            const weekStart = new Date(`${key}T00:00:00`)
            const weekEnd = new Date(weekStart.getTime() + WEEK_MS - 1)
            return `${weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - ${weekEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
          })()

      const current = groups.get(key) ?? { label, distance: 0, sessions: 0, paceValues: [] }
      current.distance += activity.distanceKm
      current.sessions += 1
      if (isReliablePaceActivity(activity) && activity.paceSec != null) {
        current.paceValues.push(activity.paceSec)
      }
      groups.set(key, current)
    }

    const rows = Array.from(groups.entries()).map(([key, value]) => ({
      key,
      label: value.label,
      distance: Number(value.distance.toFixed(1)),
      sessions: value.sessions,
      avgPace: value.paceValues.length
        ? Math.round(value.paceValues.reduce((sum, pace) => sum + pace, 0) / value.paceValues.length)
        : null,
    }))

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
      averageDistance: Number(avgDistance.toFixed(1)),
      averageSessions: Number(avgSessions.toFixed(1)),
      best: byDistance[0],
      current,
      paceDelta,
      label: windowMode === 'month' ? 'meses' : 'semanas',
    }
  }, [scopedAnalyzedActivities, selectedMonthKey, selectedWeekKey, windowMode])

  const analysisInsights = useMemo(() => {
    const insights: Array<{ title: string; copy: string }> = []

    if (periodComparison) {
      if (periodComparison.distanceChange >= 12) {
        insights.push({
          title: 'Volume acima do bloco anterior',
          copy: `A distancia subiu ${fmt.pct(periodComparison.distanceChange)} e a frequencia mudou ${fmt.pct(periodComparison.sessionChange)} frente ao periodo anterior equivalente.`,
        })
      } else if (periodComparison.distanceChange <= -12) {
        insights.push({
          title: 'Volume abaixo do bloco anterior',
          copy: `A distancia caiu ${Math.abs(periodComparison.distanceChange).toFixed(0)}% contra o bloco anterior. Isso pode indicar deload, pausa ou quebra de consistencia.`,
        })
      } else {
        insights.push({
          title: 'Volume em faixa parecida',
          copy: `O recorte atual esta perto do bloco anterior: distancia em ${fmt.pct(periodComparison.distanceChange)} e sessoes em ${fmt.pct(periodComparison.sessionChange)}.`,
        })
      }

      if (periodComparison.current.avgPace && periodComparison.previous.avgPace) {
        const improved = periodComparison.paceChange >= 2
        const regressed = periodComparison.paceChange <= -2
        insights.push({
          title: improved ? 'Desempenho ganhou eficiencia' : regressed ? 'Desempenho perdeu eficiencia' : 'Ritmo muito proximo do bloco anterior',
          copy: improved
            ? `O pace medio melhorou ${fmt.pct(periodComparison.paceChange)} contra o periodo anterior.`
            : regressed
              ? `O pace medio piorou ${Math.abs(periodComparison.paceChange).toFixed(0)}% contra o periodo anterior.`
              : 'O pace medio variou pouco, o que sugere estabilidade de intensidade neste recorte.',
        })
      }
    }

    if (periodBenchmark) {
      insights.push({
        title: `Posicao do ${windowMode === 'month' ? 'mes' : 'bloco semanal'} no historico filtrado`,
        copy: `Este recorte ocupa a posicao ${periodBenchmark.rank} de ${periodBenchmark.total} em volume dentro das ${periodBenchmark.label} carregadas. Melhor janela: ${fmt.dist(periodBenchmark.best.distance)} km em ${periodBenchmark.best.label}.`,
      })

      if (periodBenchmark.paceDelta != null) {
        insights.push({
          title: periodBenchmark.paceDelta >= 2 ? 'Ritmo acima da media comparavel' : periodBenchmark.paceDelta <= -2 ? 'Ritmo abaixo da media comparavel' : 'Ritmo em linha com a media comparavel',
          copy: periodBenchmark.paceDelta >= 2
            ? `O pace do periodo esta ${fmt.pct(periodBenchmark.paceDelta)} melhor que a media das ${periodBenchmark.label} equivalentes do recorte.`
            : periodBenchmark.paceDelta <= -2
              ? `O pace do periodo esta ${Math.abs(periodBenchmark.paceDelta).toFixed(0)}% abaixo da media das ${periodBenchmark.label} equivalentes do recorte.`
              : `O pace do periodo esta praticamente alinhado com a media das ${periodBenchmark.label} equivalentes do recorte.`,
        })
      }
    }

    if (periodContext) {
      insights.push({
        title: 'Densidade de treino do recorte',
        copy: `${periodContext.activeDays} dias ativos em ${periodContext.spanDays} dias de janela, com densidade de ${periodContext.densityPct}% e media de ${periodContext.sessionsPerWeek} sessoes por semana ativa.`,
      })
    }

    if (loadInsight) {
      insights.push({
        title: 'Consistencia recente da carga',
        copy: `${loadInsight.recommendation} Hoje o bloco carrega ${loadInsight.stableWeeks} semanas consecutivas dentro da mesma faixa de manutencao.`,
      })
    }

    return insights.slice(0, 4)
  }, [loadInsight, periodBenchmark, periodComparison, periodContext, windowMode])

  const effortHighlights = useMemo(() => analyzedActivities.slice(0, 4), [analyzedActivities])

  const records = useMemo(() => {
    const candidates = analyzedActivities.filter((activity) => performanceTypes.has(activity.type) && isReliablePaceActivity(activity))
    const result: RecordEntry[] = []

    for (const targetKm of recordTargets) {
      const officialMatches = candidates
        .flatMap((activity) =>
          activity.bestEfforts
            .filter((effort) => Math.abs(effort.distanceKm - targetKm) <= getDistanceTolerance(targetKm))
            .map((effort) => ({ activity, effort }))
        )

      if (officialMatches.length) {
        const bestOfficial = officialMatches.reduce((winner, current) => {
          const winnerTime = winner.effort.movingSec ?? winner.effort.elapsedSec
          const currentTime = current.effort.movingSec ?? current.effort.elapsedSec
          return currentTime < winnerTime ? current : winner
        }, officialMatches[0])

        const durationSec = bestOfficial.effort.movingSec ?? bestOfficial.effort.elapsedSec
        result.push({
          targetKm,
          activity: bestOfficial.activity,
          displayDurationSec: durationSec,
          displayPaceSec: Math.round(durationSec / targetKm),
          source: 'strava-best-effort',
        })
        continue
      }

      const tolerance = getDistanceTolerance(targetKm)
      const estimatedMatches = candidates.filter((activity) => Math.abs(activity.distanceKm - targetKm) <= tolerance)
      if (!estimatedMatches.length) continue
      const bestEstimated = estimatedMatches.reduce((winner, activity) => (activity.paceSec ?? Infinity) < (winner.paceSec ?? Infinity) ? activity : winner, estimatedMatches[0])
      result.push({
        targetKm,
        activity: bestEstimated,
        displayDurationSec: Math.round((bestEstimated.paceSec ?? 0) * targetKm),
        displayPaceSec: bestEstimated.paceSec,
        source: 'estimated',
      })
    }

    return result
  }, [analyzedActivities])

  const pageCount = Math.max(1, Math.ceil(activeActivities.length / ROWS_STEP))
  const visibleActivities = activeActivities.slice((page - 1) * ROWS_STEP, page * ROWS_STEP)
  const activeAccent = allSportsSelected ? 'var(--accent)' : getSportAccent(primarySport)
  const yearLabel = allYearsSelected ? 'historico completo' : selectedYears.length === 1 ? selectedYears[0] : `${selectedYears.length} anos`
  const windowLabel = activeWindow.label
  const totalActivities = Number(meta?.totalActivities ?? 0)
  const viewerRole = String(meta?.viewerRole ?? 'unknown')
  const viewerPlan = String(meta?.viewerPlan ?? 'unknown')
  const viewerAdmin = Boolean(meta?.viewerAdmin ?? isAdmin)
  const viewerScopeLabel = meta?.viewerScope?.fullAccess
    ? 'all'
    : `${Array.isArray(meta?.viewerScope?.types) ? meta.viewerScope.types.join(', ') : '-'} | ${Array.isArray(meta?.viewerScope?.years) ? meta.viewerScope.years.join(', ') : '-'}`
  const showOperatorNotes = viewerAdmin && previewMode === 'admin'
  const mode = getMetricMode(primarySport)
  const focusLabel = allSportsSelected ? 'visao multiesporte' : selectedSports.length === 1 ? getSportLabel(selectedSports[0]) : `${selectedSports.length} esportes`
  const mobileFilterSummary = `${focusLabel} ? ${yearLabel} ? ${windowLabel}`
  const methodologyCopy = mode === 'mixed'
    ? 'Neste recorte misto, os KPIs de topo priorizam composicao, volume e dominancia do esporte.'
    : mode === 'speed'
      ? 'Neste recorte, desempenho e lido por velocidade. Volume e consistencia permanecem comparaveis.'
      : 'Neste recorte, desempenho e lido por pace. Volume e consistencia permanecem comparaveis.'

  const loadingLabel = loadingYears.length
    ? loadingYears.length === 1
      ? `Carregando recorte de ${loadingYears[0]}...`
      : `Carregando ${loadingYears.length} anos selecionados...`
    : ''

  function toggleYear(year: string) {
    if (year === 'all') {
      setSelectedYears(allYearsSelected ? [actualYears[0]] : actualYears)
      return
    }

    setSelectedYears((current) => {
      const exists = current.includes(year)
      if (exists) {
        const next = current.filter((item) => item !== year)
        return next.length ? next : [year]
      }
      return [...current, year].sort((a, b) => Number(b) - Number(a))
    })
  }

  function toggleSport(type: string) {
    if (type === 'All') {
      setSelectedSports(allSportsSelected ? (availableSports.includes('Run') ? ['Run'] : [availableSports[0]]) : availableSports)
      return
    }

    setSelectedSports((current) => {
      const exists = current.includes(type)
      if (exists) {
        const next = current.filter((item) => item !== type)
        return next.length ? next : [type]
      }
      return [...current, type]
    })
  }

  function shiftActivePeriod(direction: 'newer' | 'older') {
    if (!hasPeriodNavigation || activePeriodIndex === -1) return

    const nextIndex = direction === 'newer' ? activePeriodIndex - 1 : activePeriodIndex + 1
    const nextOption = activePeriodOptions[nextIndex]
    if (!nextOption) return

    if (windowMode === 'month') {
      setSelectedMonthKey(nextOption.key)
      return
    }

    setSelectedWeekKey(nextOption.key)
  }

  if (!totalActivities && !mergedActivities.length) {
    return (
      <main className="shell">
        <section className="hero hero-empty">
          <div>
            <p className="eyebrow">CPT Performance Lab</p>
            <h1 className="display">Conecte seu historico para acender o painel.</h1>
            <p className="hero-copy">O dashboard ja esta pronto para leitura multiesporte com foco em corrida. Falta puxar seus treinos do Strava.</p>
          </div>
          <div className="hero-actions hero-actions-stacked">
            <button onClick={() => handleSync('incremental')} disabled={syncing} className="btn btn-primary" type="button">
              {syncing ? 'Sincronizando...' : 'Sincronizar Strava'}
            </button>
            {viewerAdmin && (
              <button onClick={() => handleSync('full')} disabled={syncing} className="btn btn-outline" type="button">
                Reconstruir historico
              </button>
            )}
          </div>
        </section>
      </main>
    )
  }

  return (
    <div className="app-layout">
      <Sidebar
        meta={meta}
        isAdmin={showOperatorNotes}
      />

      <div className="app-main">
        {/* Sticky header */}
        <header className="app-header">
          <div className="app-header-top">
            <div className="app-header-identity">
              {meta && <p className="app-header-role">{viewerRole} · {viewerPlan}</p>}
              <p className="app-header-name">{userName}</p>
            </div>
            <div className="app-header-actions">
              {meta?.lastSync && (
                <span className="app-header-sync-info">
                  ↻ Last sync · {new Date(meta.lastSync).toLocaleDateString('pt-BR')} · {meta?.lastSyncMode ?? 'incremental'}
                </span>
              )}
              {ignoredCount > 0 && <span className="pill pill-ghost">{ignoredCount} ignoradas</span>}
              {viewerAdmin && (
                <button
                  type="button"
                  className="sport-chip preview-chip"
                  data-active={previewMode === 'admin'}
                  style={{ ['--chip-accent' as string]: 'var(--accent-4)' }}
                  onClick={() => setPreviewMode(previewMode === 'admin' ? 'athlete' : 'admin')}
                >
                  {previewMode === 'admin' ? 'Admin' : 'Atleta'}
                </button>
              )}
              <button onClick={handleThemeToggle} className="btn btn-ghost" type="button">
                {theme === 'dark' ? '☀' : '☾'}
              </button>
              <button onClick={() => handleSync('incremental')} disabled={syncing || deleting || loadingYears.length > 0} className="btn btn-primary" type="button">
                {syncing ? 'Sincronizando...' : 'Atualizar'}
              </button>
              <button onClick={() => signOut({ callbackUrl: '/login' })} className="btn btn-ghost" type="button">
                Sair
              </button>
            </div>
          </div>

          <div className="app-header-mobile-controls">
            <span className="app-header-mobile-summary">{mobileFilterSummary}</span>
            <button
              type="button"
              className="btn btn-ghost app-header-mobile-toggle"
              onClick={() => setMobileFiltersOpen((current) => !current)}
            >
              {mobileFiltersOpen ? 'Fechar filtros' : 'Filtros'}
            </button>
          </div>

          {/* Filter strip inside header */}
          <div className={`filter-strip ${mobileFiltersOpen ? 'filter-strip-open' : ''}`}>
            <span className="filter-label">Esporte</span>
            <button
              type="button"
              className="sport-chip"
              data-active={allSportsSelected}
              onClick={() => toggleSport('All')}
              style={{ ['--chip-accent' as string]: 'var(--accent)' }}
            >
              Tudo
            </button>
            {availableSports.map((type) => (
              <button
                key={type}
                type="button"
                className="sport-chip"
                data-active={selectedSports.includes(type)}
                onClick={() => toggleSport(type)}
                style={{ ['--chip-accent' as string]: getSportAccent(type) }}
              >
                {getSportLabel(type)}
              </button>
            ))}
            <span className="filter-divider" />
            <span className="filter-label">Ano</span>
            {actualYears.map((year) => (
              <button
                key={year}
                type="button"
                className="sport-chip year-chip"
                data-active={selectedYears.includes(year)}
                onClick={() => toggleYear(year)}
                style={{ ['--chip-accent' as string]: 'var(--accent-2)' }}
              >
                {year}
              </button>
            ))}
            <span className="filter-divider" />
            <span className="filter-label">Janela</span>
            {([
              { key: 'year', label: 'Ano' },
              { key: 'month', label: 'Mes' },
              { key: 'week', label: 'Semana' },
              { key: 'rolling28', label: '28d' },
            ] as const).map((option) => (
              <button
                key={option.key}
                type="button"
                className="sport-chip window-chip"
                data-active={windowMode === option.key}
                onClick={() => setWindowMode(option.key)}
                style={{ ['--chip-accent' as string]: 'var(--accent-3)' }}
              >
                {option.label}
              </button>
            ))}
            {hasPeriodNavigation && activePeriodOptions.length > 0 && (
              <>
                <span className="filter-divider" />
                <div className="period-picker">
                  <button
                    type="button"
                    className="btn btn-ghost period-shift"
                    onClick={() => shiftActivePeriod('newer')}
                    disabled={!canGoToNewerPeriod}
                  >
                    Mais recente
                  </button>
                  <select
                    className="period-select period-select-inline"
                    value={activePeriodKey}
                    onChange={(e) => (windowMode === 'month' ? setSelectedMonthKey(e.target.value) : setSelectedWeekKey(e.target.value))}
                  >
                    {activePeriodOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                  </select>
                  <button
                    type="button"
                    className="btn btn-ghost period-shift"
                    onClick={() => shiftActivePeriod('older')}
                    disabled={!canGoToOlderPeriod}
                  >
                    Mais antigo
                  </button>
                  <span className="pill pill-ghost period-pill">
                    {activePeriodIndex >= 0
                      ? `${activePeriodIndex + 1}/${activePeriodOptions.length} ${windowMode === 'month' ? 'meses' : 'semanas'}`
                      : ''}
                  </span>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="shell">

        {showOperatorNotes && (
        <div id="admin" className="control-panel">
              <div className="admin-tools">
                <div>
                  <p className="control-label">Ferramentas de administrador</p>
                  <strong>Reconstrucao completa protegida por cooldown</strong>
                </div>
                <div className="admin-actions-row">
                  <button onClick={() => handleSync('full')} disabled={syncing || deleting || backfilling || loadingYears.length > 0} className="btn btn-outline" type="button">
                    Full sync
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={syncing || deleting || backfilling || loadingYears.length > 0}
                    onClick={async () => {
                      setBackfilling(true)
                      setSyncMsg('')
                      try {
                        const res = await fetch('/api/admin/backfill-efforts', { method: 'POST' })
                        const data = await res.json()
                        if (!res.ok) throw new Error(data?.error ?? 'Erro no backfill')
                        setSyncMsg(`Best efforts: ${data.enriched} enriquecidas de ${data.processed} processadas. Restam ${data.remaining}.`)
                        if (data.enriched > 0) {
                          setPartialYears((current) => {
                            const next = { ...current }
                            for (const year of selectedYears) next[year] = true
                            return next
                          })
                        }
                      } catch (error) {
                        setSyncMsg(error instanceof Error ? error.message : 'Erro no backfill')
                      } finally {
                        setBackfilling(false)
                      }
                    }}
                  >
                    {backfilling ? 'Buscando best efforts...' : 'Backfill best efforts'}
                  </button>
                </div>
              </div>

              <div className="admin-tools" style={{ marginTop: '1rem' }}>
                <div>
                  <p className="control-label">Dados de saúde</p>
                  <strong>Upload de sono e peso (Garmin CSV)</strong>
                </div>
                <div className="admin-actions-row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
                    {uploadingHealth ? 'Enviando...' : 'Selecionar arquivos CSV'}
                    <input
                      type="file"
                      accept=".csv"
                      multiple
                      style={{ display: 'none' }}
                      disabled={uploadingHealth}
                      onChange={async (e) => {
                        const files = e.target.files
                        if (!files?.length) return
                        setUploadingHealth(true)
                        setHealthUploadMsg('')
                        const form = new FormData()
                        for (const f of Array.from(files)) form.append('files', f)
                        try {
                          const res = await fetch('/api/admin/upload-health', { method: 'POST', body: form })
                          const data = await res.json()
                          if (!res.ok) throw new Error(data?.error ?? 'Erro no upload')
                          const parts: string[] = []
                          if (data.sleepSaved) parts.push(`${data.sleepSaved} registros de sono`)
                          if (data.weightSaved) parts.push(`${data.weightSaved} registros de peso`)
                          if (data.skipped) parts.push(`${data.skipped} linhas ignoradas`)
                          if (data.errors?.length) parts.push(data.errors.join('; '))
                          setHealthUploadMsg(parts.length ? parts.join(' · ') : 'Nenhum dado importado.')
                        } catch (error) {
                          setHealthUploadMsg(error instanceof Error ? error.message : 'Erro no upload')
                        } finally {
                          setUploadingHealth(false)
                          e.target.value = ''
                        }
                      }}
                    />
                  </label>
                  {healthUploadMsg && <span className="sync-message" style={{ margin: 0 }}>{healthUploadMsg}</span>}
                </div>
              </div>
            {loadingLabel && <p className="sync-message">{loadingLabel}</p>}
            {syncMsg && <p className="sync-message">{syncMsg}</p>}
        </div>
        )}
        {!showOperatorNotes && (loadingLabel || syncMsg) && (
          <div className="hero-messages">
            {loadingLabel && <p className="sync-message">{loadingLabel}</p>}
            {syncMsg && <p className="sync-message">{syncMsg}</p>}
          </div>
        )}

      {!activeActivities.length && !loadingYears.length ? (
        <section className="panel">
          <div className="panel-header compact">
            <div>
              <p className="panel-eyebrow">Recorte vazio</p>
              <h3>Sem atividades para este filtro</h3>
            </div>
            <span className="panel-subtitle">Troque o esporte, o ano ou a janela para continuar a analise.</span>
          </div>
        </section>
      ) : (
        <>
          {stats && (
            <>
              <SectionLead
                id="resumo"
                eyebrow="Resumo executivo"
                title="Primeira leitura do recorte ativo"
                subtitle="Aqui entram os numeros de topo. Eles resumem a janela filtrada antes de abrir a analise detalhada."
              />
              <section className="kpi-grid">
                <MetricCard label="Sessoes ativas" value={String(stats.count)} sub={`${activeWindow.title} | ${focusLabel}`} accent={activeAccent} />
                <MetricCard label="Distancia" value={`${fmt.dist(stats.totalDist)} km`} sub="volume no recorte ativo" accent={activeAccent} />
                <MetricCard label="Tempo ativo" value={fmt.dur(stats.totalDur)} sub="movimento no recorte ativo" accent={activeAccent} />
                <MetricCard
                  label={stats.mode === 'speed' ? 'Velocidade media' : stats.mode === 'mixed' ? 'Peso da corrida' : 'Pace medio'}
                  value={stats.mode === 'speed' ? `${stats.avgSpeed.toFixed(1)} km/h` : stats.mode === 'mixed' ? `${stats.shareRun}%` : fmt.pace(stats.avgPace)}
                  sub={stats.mode === 'mixed' ? 'participacao das sessoes de corrida' : stats.mode === 'speed' ? 'media da janela ativa' : 'ritmo medio por km'}
                  accent={activeAccent}
                />
                <MetricCard label="Maior sessao" value={`${fmt.dist(stats.longest.distanceKm)} km`} sub={fmt.fullDate(stats.longest.date)} accent={activeAccent} />
                <MetricCard
                  label={stats.mode === 'speed' ? 'Pico de velocidade' : stats.mode === 'mixed' ? 'Esporte dominante' : 'Melhor pace'}
                  value={stats.mode === 'speed' ? fmt.speed(stats.fastestSpeed.distanceKm, stats.fastestSpeed.durationSec) : stats.mode === 'mixed' ? getSportLabel(stats.dominantSport?.[0] ?? 'Run') : fmt.pace(stats.fastest?.paceSec ?? null)}
                  sub={stats.mode === 'mixed' ? `${stats.dominantSport?.[1] ?? 0} sessoes` : stats.mode === 'speed' ? fmt.fullDate(stats.fastestSpeed.date) : stats.fastest ? fmt.fullDate(stats.fastest.date) : 'sem dados'}
                  accent={activeAccent}
                />
              </section>
            </>
          )}

          <SectionLead
            id="volume"
            eyebrow="Leitura analitica"
            title="Volume, desempenho, comparacao e consistencia"
            subtitle="Os paineis abaixo ja nao misturam tudo na mesma camada. Cada bloco responde uma pergunta diferente."
          />
          <section className="dashboard-grid">
            <Panel eyebrow="Volume" title={activeWindow.volumeTitle} subtitle={activeWindow.volumeSubtitle}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={volumeSeries} margin={{ top: 8, right: 4, bottom: 4, left: -16 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--grid)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={chartTooltip} itemStyle={chartTooltipItem} labelStyle={chartTooltipLabel} cursor={chartCursor} formatter={(value: number) => [`${value} km`, 'Distancia']} />
                  <Bar dataKey="km" radius={[8, 8, 0, 0]}>
                    {volumeSeries.map((entry, index) => (
                      <Cell key={`${entry.label}-${index}`} fill={activeAccent} fillOpacity={0.95 - index * 0.015} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel eyebrow="Desempenho" title={getMetricMode(primarySport) === 'speed' ? 'Velocidade recente' : 'Evolucao recente'} subtitle="Janela curta para acompanhar tendencia do bloco atual">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={performanceTimeline} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--grid)" />
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    reversed={getMetricMode(primarySport) !== 'speed'}
                    tickFormatter={(value) => getMetricMode(primarySport) === 'speed' ? `${Number(value).toFixed(0)} km/h` : fmt.pace(Number(value))}
                  />
                  <Tooltip
                    contentStyle={chartTooltip}
                    itemStyle={chartTooltipItem}
                    labelStyle={chartTooltipLabel}
                    cursor={chartCursor}
                    formatter={(_value: number, _name: string, item: any) => [
                      getMetricMode(primarySport) === 'speed' ? item.payload.speedLabel : item.payload.paceLabel,
                      getMetricMode(primarySport) === 'speed' ? 'Velocidade' : 'Pace',
                    ]}
                  />
                  <Line type="monotone" dataKey="metricValue" stroke={activeAccent} strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>

            <Panel eyebrow="Comparativo" title={activeWindow.comparisonTitle} subtitle={activeWindow.comparisonSubtitle}>
              {periodComparison ? (
                <div className="comparison-grid">
                  <CompareTile label="Distancia" current={`${fmt.dist(periodComparison.current.distance)} km`} previous={`${fmt.dist(periodComparison.previous.distance)} km`} delta={fmt.pct(periodComparison.distanceChange)} positive={periodComparison.distanceChange >= 0} />
                  <CompareTile label="Sessoes" current={String(periodComparison.current.sessions)} previous={String(periodComparison.previous.sessions)} delta={fmt.pct(periodComparison.sessionChange)} positive={periodComparison.sessionChange >= 0} />
                  <CompareTile label="Tempo" current={fmt.dur(periodComparison.current.durationSec)} previous={fmt.dur(periodComparison.previous.durationSec)} delta={fmt.pct(periodComparison.durationChange)} positive={periodComparison.durationChange >= 0} />
                  <CompareTile label="Pace" current={fmt.pace(periodComparison.current.avgPace)} previous={fmt.pace(periodComparison.previous.avgPace)} delta={fmt.pct(periodComparison.paceChange)} positive={periodComparison.paceChange >= 0} />
                </div>
              ) : (
                <p className="empty-copy">Ainda nao ha dados suficientes para comparar a janela ativa com o periodo anterior equivalente.</p>
              )}
            </Panel>
            <Panel eyebrow="Consistencia" title="Carga semanal" subtitle="Heuristica de volume recente e manutencao de carga">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={weeklyLoad} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
                  <defs>
                    <linearGradient id="loadFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={activeAccent} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={activeAccent} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--grid)" />
                  <XAxis dataKey="week" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={chartTooltip} itemStyle={chartTooltipItem} labelStyle={chartTooltipLabel} cursor={chartCursor} formatter={(value: number) => [value, 'Carga']} />
                  <Area type="monotone" dataKey="load" stroke={activeAccent} fill="url(#loadFill)" strokeWidth={2.4} />
                </AreaChart>
              </ResponsiveContainer>
              {loadInsight && (
                <div className="callout" data-status={loadInsight.status}>
                  <strong>{loadInsight.stableWeeks} semanas sustentando a faixa de carga</strong>
                  <p>{loadInsight.recommendation}</p>
                  <span>Semana atual: {fmt.dist(loadInsight.currentWeek.km)} km | referencia recente: {loadInsight.avgLoad} de carga</span>
                </div>
              )}
            </Panel>
          </section>

          <SectionLead
            id="comparativo"
            eyebrow="Leitura comparativa"
            title="Periodo em contexto e interpretacao automatica"
            subtitle="Aqui o recorte atual deixa de ser so numero absoluto e passa a ser lido contra o bloco anterior e contra o proprio historico carregado."
          />
          <section className="dashboard-grid">
            <Panel eyebrow="Contexto" title="Leituras do periodo" subtitle="Composicao do bloco atual alem dos KPIs de topo">
              {periodContext && stats ? (
                <div className="analysis-grid">
                  <AnalysisTile label="Densidade" value={`${periodContext.densityPct}%`} meta={`${periodContext.activeDays} dias ativos em ${periodContext.spanDays} dias`} />
                  <AnalysisTile label="Sessao media" value={`${fmt.dist(periodContext.avgSessionKm)} km`} meta={`${periodContext.avgSessionMinutes} min por sessao`} />
                  <AnalysisTile label="Peso do longao" value={`${periodContext.longestSharePct}%`} meta={`${fmt.dist(stats.longest.distanceKm)} km do volume total`} />
                  <AnalysisTile label="Cadencia" value={`${periodContext.sessionsPerWeek.toFixed(1)}/sem`} meta="sessoes por semana ativa" />
                </div>
              ) : (
                <p className="empty-copy">Ainda nao ha base suficiente para contextualizar a janela ativa.</p>
              )}
            </Panel>

            <Panel eyebrow="Leitura automatica" title="Comparativos do recorte" subtitle="Resumo interpretado do bloco atual contra referencias equivalentes">
              {analysisInsights.length ? (
                <div className="insight-list">
                  {analysisInsights.map((insight) => (
                    <InsightItem key={insight.title} title={insight.title}>{insight.copy}</InsightItem>
                  ))}
                </div>
              ) : (
                <p className="empty-copy">Ainda nao ha comparativos suficientes para gerar leitura automatica deste recorte.</p>
              )}
              {periodBenchmark && (
                <div className="analysis-grid analysis-grid-compact">
                  <AnalysisTile label="Posicao em volume" value={`#${periodBenchmark.rank}/${periodBenchmark.total}`} meta={`${periodBenchmark.label} do recorte`} />
                  <AnalysisTile label="Media comparavel" value={`${fmt.dist(periodBenchmark.averageDistance)} km`} meta={`${periodBenchmark.averageSessions.toFixed(1)} sessoes por periodo`} />
                  <AnalysisTile label="Melhor janela" value={`${fmt.dist(periodBenchmark.best.distance)} km`} meta={periodBenchmark.best.label} />
                  <AnalysisTile label="Janela atual" value={`${fmt.dist(periodBenchmark.current.distance)} km`} meta={periodBenchmark.current.label} />
                </div>
              )}
            </Panel>

            <Panel eyebrow="Radar" title="Distribuicao do bloco" subtitle="Leituras deterministicas da janela ativa, sem depender de LLM">
              {periodRadar ? (
                <div className="analysis-grid">
                  <AnalysisTile label="Dia mais forte" value={`${fmt.dist(periodRadar.strongestDay.distance)} km`} meta={`${periodRadar.strongestDay.label} | ${periodRadar.strongestDaySharePct}% do volume`} />
                  <AnalysisTile label="Maior intervalo" value={`${periodRadar.biggestGapDays}d`} meta="entre dias ativos do recorte" />
                  <AnalysisTile label="Dia dominante" value={periodRadar.topWeekdayLabel} meta={`${periodRadar.topWeekdaySharePct}% das sessoes`} />
                  <AnalysisTile label="Fim de semana" value={`${periodRadar.weekendSharePct}%`} meta="das sessoes em sabado e domingo" />
                </div>
              ) : (
                <p className="empty-copy">Ainda nao ha base suficiente para ler a distribuicao interna do recorte.</p>
              )}
            </Panel>
          </section>

          <SectionLead
            eyebrow="Leitura de apoio"
            title={showOperatorNotes ? 'Contexto de produto, recordes e leitura qualitativa' : 'Recordes e leitura qualitativa'}
            subtitle={showOperatorNotes ? 'Esses blocos ajudam a interpretar os numeros principais sem transformar o painel em uma planilha crua.' : 'Blocos de apoio para interpretar a fase atual sem mergulhar direto no bruto.'}
          />
          <section className={`insight-grid ${showOperatorNotes ? 'insight-grid-expanded' : 'athlete-insight-grid'}`}>
            <Panel eyebrow="Recordes" title="Melhores marcas do recorte" subtitle="Prioriza best efforts oficiais do Strava. Quando nao houver detalhamento disponivel, cai para aproximacao pela atividade inteira.">
              {records.length ? (
                <div className="record-grid">
                  {records.map((record) => (
                    <article key={`${record.targetKm}-${record.activity.stravaId}`} className="compare-tile">
                      <p className="metric-label">{record.targetKm} km</p>
                      <strong>{fmt.clock(record.displayDurationSec)}</strong>
                      <span className="compare-previous">
                        {record.source === 'strava-best-effort'
                          ? `best effort oficial - ${fmt.pace(record.displayPaceSec)}/km`
                          : `aproximado pela atividade - ${fmt.pace(record.displayPaceSec)}/km`}
                      </span>
                      <span className="compare-previous">{getDisplayName(record.activity.name)} | {fmt.fullDate(record.activity.date)}</span>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="empty-copy">Ainda nao ha atividades proximas das distancias de referencia neste recorte.</p>
              )}
            </Panel>

            {showOperatorNotes && (
              <Panel eyebrow="Produto" title="Leituras rapidas" subtitle="Como interpretar o recorte e a estrutura atual da home">
                <div className="insight-list">
                  <InsightItem title="Janelas agora mudam a leitura">Voce pode alternar entre ano, mes ativo, semana ativa e 28 dias sem perder o mesmo recorte base de esporte e ano.</InsightItem>
                  <InsightItem title="2026 agora carrega completo">O primeiro ano selecionado deixa de ficar preso ao recorte inicial de 160 atividades e passa a buscar o ano inteiro sob demanda.</InsightItem>
                  <InsightItem title="Carga atual e heuristica">A leitura semanal serve para consistencia e deload, nao como equivalencia cientifica de TRIMP ou TSS.</InsightItem>
                </div>
              </Panel>
            )}

            <Panel eyebrow="Qualitativo" title="Ultimos treinos" subtitle="Amostra recente para leitura qualitativa">
              <div className="recent-grid">
                {effortHighlights.map((activity) => (
                  <article key={activity.stravaId} className="mini-card">
                    <div className="mini-topline">
                      <span className="sport-tag" style={{ background: sportMeta[activity.type]?.chip ?? 'var(--chip-neutral)' }}>{getSportLabel(activity.type)}</span>
                      <span>{fmt.date(activity.date)}</span>
                    </div>
                    <h4>{getDisplayName(activity.name)}</h4>
                    <div className="mini-metrics">
                      <span>{fmt.dist(activity.distanceKm)} km</span>
                      <span>{fmt.dur(activity.durationSec)}</span>
                      <span>{activity.type === 'Ride' ? fmt.speed(activity.distanceKm, activity.durationSec) : `${fmt.pace(activity.paceSec)}/km`}</span>
                    </div>
                  </article>
                ))}
              </div>
            </Panel>
          </section>

          {isAdmin && (sleepData.length > 0 || weightData.length > 0) && (() => {
            const healthWindowStart = activeWindow.start
            const healthWindowEnd = activeWindow.end
            const healthWindowSubtitle = healthWindowStart && healthWindowEnd
              ? `Dados importados do Garmin. Recorte ativo: ${activeWindow.label}.`
              : `Dados importados do Garmin. Janela anual de ${yearLabel}.`

            const sleepFiltered = sleepData.filter((s) => {
              const y = s.date.slice(0, 4)
              if (selectedYears.length > 0 && !selectedYears.includes(y)) return false
              const date = new Date(`${s.date}T00:00:00`)
              if (healthWindowStart && date < healthWindowStart) return false
              if (healthWindowEnd && date > healthWindowEnd) return false
              return true
            })

            const weightFiltered = weightData.filter((w) => {
              const y = w.date.slice(0, 4)
              if (selectedYears.length > 0 && !selectedYears.includes(y)) return false
              const date = new Date(`${w.date}T00:00:00`)
              if (healthWindowStart && date < healthWindowStart) return false
              if (healthWindowEnd && date > healthWindowEnd) return false
              return true
            })

            const weightSmoothed = weightFiltered.map((w, i, arr) => {
              const win = arr.slice(Math.max(0, i - 3), i + 4)
              const avg = win.reduce((s, x) => s + x.weightKg, 0) / win.length
              return { ...w, weightSmooth: parseFloat(avg.toFixed(1)) }
            })

            const avgSleep = sleepFiltered.length
              ? (sleepFiltered.reduce((s, r) => s + r.durationMin, 0) / sleepFiltered.length / 60).toFixed(1)
              : null

            const firstWeight = weightSmoothed[0]
            const lastWeight = weightSmoothed[weightSmoothed.length - 1]

            return (
              <section id="saude" className="dashboard-health">
                {sleepFiltered.length > 0 && (
                  <SectionLead
                    eyebrow="Saude & Recuperacao"
                    title="Sono"
                    subtitle={healthWindowSubtitle}
                  />
                )}
                {sleepFiltered.length > 0 && (
                    <Panel
                      eyebrow="Sono"
                      title="Duracao diaria"
                      subtitle={avgSleep ? `Media do periodo: ${avgSleep}h` : ''}
                    >
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={sleepFiltered} margin={{ top: 8, right: 4, bottom: 4, left: -16 }}>
                          <CartesianGrid strokeDasharray="4 4" stroke="var(--grid)" />
                          <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: string) => v.slice(5)} interval={Math.floor(sleepFiltered.length / 10)} />
                          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${Math.round(v / 60)}h`} domain={[0, 660]} />
                          <Tooltip contentStyle={chartTooltip} itemStyle={chartTooltipItem} labelStyle={chartTooltipLabel} cursor={chartCursor} formatter={(v: number) => [`${Math.floor(v / 60)}h ${v % 60}min`, 'Sono']} labelFormatter={(l: string) => l} />
                          <Bar dataKey="durationMin" radius={[4, 4, 0, 0]}>
                            {sleepFiltered.map((s) => (
                              <Cell key={s.date} fill={s.durationMin < 300 ? 'var(--accent-4)' : activeAccent} fillOpacity={0.9} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--accent-4)', marginRight: 4, verticalAlign: 'middle' }} />
                        Menos de 5h
                      </p>
                    </Panel>
                  )}

                  {weightSmoothed.length > 0 && (
                    <SectionLead
                      eyebrow="Saude & Recuperacao"
                      title="Composicao corporal"
                      subtitle={healthWindowSubtitle}
                    />
                  )}
                  {weightSmoothed.length > 0 && (
                    <Panel
                      eyebrow="Peso"
                      title="Tendencia corporal"
                      subtitle={firstWeight && lastWeight ? `${firstWeight.weightKg} -> ${lastWeight.weightKg} kg no recorte` : ''}
                    >
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={weightSmoothed} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
                          <CartesianGrid strokeDasharray="4 4" stroke="var(--grid)" />
                          <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: string) => v.slice(5)} interval={Math.floor(weightSmoothed.length / 10)} />
                          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}kg`} domain={['auto', 'auto']} />
                          <Tooltip contentStyle={chartTooltip} itemStyle={chartTooltipItem} labelStyle={chartTooltipLabel} cursor={chartCursor} formatter={(v: number, name: string) => [`${v} kg`, name === 'weightSmooth' ? 'Media 7d' : 'Diario']} labelFormatter={(l: string) => l} />
                          <Line type="monotone" dataKey="weightKg" dot={false} stroke={activeAccent} strokeWidth={1} strokeOpacity={0.25} />
                          <Line type="monotone" dataKey="weightSmooth" dot={false} stroke={activeAccent} strokeWidth={2.5} />
                        </LineChart>
                      </ResponsiveContainer>
                      {lastWeight?.fatPct != null && (
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                          Ultima leitura: gordura {lastWeight.fatPct}% · musculo {lastWeight.muscleMassKg} kg · agua {lastWeight.waterPct}%
                        </p>
                      )}
                    </Panel>
                  )}
              </section>
            )
          })()}

          <SectionLead
            id="historico"
            eyebrow="Dado bruto"
            title="Historico navegavel do recorte"
            subtitle="Aqui ficam os registros individuais. Eles explicam os KPIs, mas nao devem ser a primeira camada de leitura."
          />
          <section className="table-panel panel">
            <div className="panel-header">
              <div>
                <p className="panel-eyebrow">Historico filtrado</p>
                <h3>Atividades recentes</h3>
              </div>
              <span className="pill pill-ghost">{activeActivities.length} itens na janela ativa</span>
            </div>

            <div className="mobile-activity-list">
              {visibleActivities.map((activity) => {
                const speed = activity.durationSec > 0 ? activity.distanceKm / (activity.durationSec / 3600) : 0
                return (
                  <article key={`mobile-${activity.stravaId}`} className="mobile-activity-card">
                    <div className="mobile-activity-top">
                      <span className="sport-tag" style={{ background: sportMeta[activity.type]?.chip ?? 'var(--chip-neutral)' }}>
                        {getSportLabel(activity.type)}
                      </span>
                      <span>{fmt.date(activity.date)}</span>
                    </div>
                    <div className="mobile-activity-title">
                      <strong>{getDisplayName(activity.name)}</strong>
                      {activity.excludedFromMetrics && <span className="analysis-badge">Ignorada</span>}
                    </div>
                    <div className="mobile-activity-metrics">
                      <DetailItem label="Distancia" value={`${fmt.dist(activity.distanceKm)} km`} />
                      <DetailItem label="Tempo" value={fmt.dur(activity.durationSec)} />
                      <DetailItem
                        label={activity.type === 'Ride' ? 'Velocidade' : 'Pace'}
                        value={activity.type === 'Ride' ? `${speed.toFixed(1)} km/h` : `${fmt.pace(activity.paceSec)}/km`}
                      />
                      <DetailItem label="FC media" value={activity.hrAvg ? `${Math.round(activity.hrAvg)} bpm` : '-'} />
                    </div>
                    <div className="mobile-activity-actions">
                      <button type="button" className="btn btn-ghost btn-inline" onClick={() => setSelectedActivity(activity)}>
                        Ver detalhe
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="table-wrap">
              <table className="activity-table">
                <thead>
                  <tr>
                    {['Data', 'Tipo', 'Sessao', 'Distancia', 'Tempo', 'Ritmo/Vel.', 'FC media', 'Altimetria', 'Detalhe'].map((header) => <th key={header}>{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {visibleActivities.map((activity) => {
                    const speed = activity.durationSec > 0 ? activity.distanceKm / (activity.durationSec / 3600) : 0
                    return (
                      <tr key={activity.stravaId}>
                        <td>{fmt.date(activity.date)}</td>
                        <td><span className="sport-tag" style={{ background: sportMeta[activity.type]?.chip ?? 'var(--chip-neutral)' }}>{getSportLabel(activity.type)}</span></td>
                        <td className="truncate-cell">
                          <div className="activity-name-cell">
                            <span>{getDisplayName(activity.name)}</span>
                            {activity.excludedFromMetrics && <span className="analysis-badge">Ignorada</span>}
                          </div>
                        </td>
                        <td>{fmt.dist(activity.distanceKm)} km</td>
                        <td>{fmt.dur(activity.durationSec)}</td>
                        <td className="metric-emphasis">{activity.type === 'Ride' ? `${speed.toFixed(1)} km/h` : `${fmt.pace(activity.paceSec)}/km`}</td>
                        <td>{activity.hrAvg ? `${Math.round(activity.hrAvg)} bpm` : '-'}</td>
                        <td>{activity.elevationGain > 0 ? `${Math.round(activity.elevationGain)} m` : '-'}</td>
                        <td>
                          <button type="button" className="btn btn-ghost btn-inline" onClick={() => setSelectedActivity(activity)}>
                            Ver
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="table-actions table-actions-spread">
              <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                Pagina anterior
              </button>
              <span className="pill pill-ghost">Pagina {page} de {pageCount}</span>
              <button type="button" className="btn btn-ghost" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>
                Proxima pagina
              </button>
            </div>
          </section>
        </>
      )}

      <section className="panel legal-panel">
        <div className="panel-header compact">
          <div>
            <p className="panel-eyebrow">Privacidade e dados</p>
            <h3>Controle da conta</h3>
          </div>
          <span className="panel-subtitle">Voce pode revisar a base legal e excluir seus dados a qualquer momento.</span>
        </div>

        <div className="legal-actions-grid">
          <a href="/privacy" className="btn btn-ghost">Politica de privacidade</a>
          <a href="/terms" className="btn btn-ghost">Termos de uso</a>
          <button onClick={handleDeleteAccount} disabled={deleting || syncing} className="btn btn-outline danger-button" type="button">
            {deleting ? 'Excluindo dados...' : 'Excluir meus dados'}
          </button>
        </div>

        <p className="legal-footnote">A exclusao remove seu historico salvo do Firestore. Se quiser encerrar o acesso de origem, revogue tambem o app nas configuracoes do Strava.</p>
      </section>
      {selectedActivity && (
        <div className="modal-scrim" onClick={() => setSelectedActivity(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header compact">
              <div>
                <p className="panel-eyebrow">Detalhe da atividade</p>
                <div className="modal-title-row">
                  <h3>{getDisplayName(selectedActivity.name)}</h3>
                  {selectedActivity.excludedFromMetrics && <span className="analysis-badge">Ignorada nas analises</span>}
                </div>
              </div>
              <button type="button" className="btn btn-ghost btn-inline" onClick={() => setSelectedActivity(null)}>Fechar</button>
            </div>
            <div className="detail-grid">
              <DetailItem label="Data" value={fmt.fullDate(selectedActivity.date)} />
              <DetailItem label="Tipo" value={getSportLabel(selectedActivity.type)} />
              <DetailItem label="Distancia" value={`${fmt.dist(selectedActivity.distanceKm)} km`} />
              <DetailItem label="Tempo" value={fmt.dur(selectedActivity.durationSec)} />
              <DetailItem label="Pace" value={selectedActivity.type === 'Ride' ? fmt.speed(selectedActivity.distanceKm, selectedActivity.durationSec) : `${fmt.pace(selectedActivity.paceSec)}/km`} />
              <DetailItem label="Elevacao" value={selectedActivity.elevationGain ? `${Math.round(selectedActivity.elevationGain)} m` : '-'} />
              <DetailItem label="FC media" value={selectedActivity.hrAvg ? `${Math.round(selectedActivity.hrAvg)} bpm` : '-'} />
              <DetailItem label="FC maxima" value={selectedActivity.hrMax ? `${Math.round(selectedActivity.hrMax)} bpm` : '-'} />
              <DetailItem label="Kudos" value={String(selectedActivity.kudos ?? 0)} />
              <DetailItem label="Strava ID" value={String(selectedActivity.stravaId)} />
              <DetailItem label="Analise" value={selectedActivity.excludedFromMetrics ? 'Ignorada nas analises' : 'Ativa nas analises'} />
            </div>
            <div className="modal-actions-row">
              <button
                type="button"
                className={`btn ${selectedActivity.excludedFromMetrics ? 'btn-ghost' : 'btn-outline'}`}
                disabled={activityReviewing}
                onClick={() => handleActivityExclusion(!selectedActivity.excludedFromMetrics)}
              >
                {activityReviewing
                  ? 'Atualizando...'
                  : selectedActivity.excludedFromMetrics
                    ? 'Reativar nas analises'
                    : 'Ignorar nas analises'}
              </button>
            </div>
          </div>
        </div>
      )}
        </main>
      </div>
    </div>
  )
}














