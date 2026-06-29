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
import type { Activity, Props, RecordEntry, SyncMode, ThemeMode } from './dashboard/types'
import {
  DAY_MS,
  ROWS_STEP,
  WEEK_MS,
  applyTheme,
  chartTooltip,
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
import { CompareTile, DetailItem, InsightItem, MetricCard, Panel, SectionLead } from './dashboard/ui'

export default function DashboardClient({ initialActivities, initialYear, availableYears, isAdmin, meta, userName }: Props) {
  const actualYears = useMemo(
    () => [...availableYears].filter((year) => year !== 'all').sort((a, b) => Number(b) - Number(a)),
    [availableYears]
  )

  const [syncing, setSyncing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
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
  const [page, setPage] = useState(1)
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('cpt-theme')
    const mode: ThemeMode = saved === 'light' ? 'light' : 'dark'
    applyTheme(mode)
    setTheme(mode)
  }, [])

  useEffect(() => {
    if (!selectedYears.length && actualYears.length) {
      setSelectedYears([actualYears[0]])
    }
  }, [actualYears, selectedYears.length])

  useEffect(() => {
    setPage(1)
  }, [selectedYears, selectedSports])

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
      setSyncMsg(`${data.synced} atividades sincronizadas (${modeLabel})`)
      setTimeout(() => window.location.reload(), 1200)
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

  const analyzedActivities = useMemo(
    () => filteredActivities.filter((activity) => !activity.excludedFromMetrics),
    [filteredActivities]
  )

  const ignoredCount = filteredActivities.length - analyzedActivities.length

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
  }, [analyzedActivities, primarySport, reliablePaceActivities])

  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; km: number; sessions: number }>()
    analyzedActivities.forEach((activity) => {
      const key = activity.date.slice(0, 7)
      const current = map.get(key) ?? { month: fmt.month(activity.date), km: 0, sessions: 0 }
      map.set(key, {
        month: current.month,
        km: current.km + activity.distanceKm,
        sessions: current.sessions + 1,
      })
    })
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => ({ ...value, km: Number(value.km.toFixed(1)) }))
  }, [analyzedActivities])

  const performanceTimeline = useMemo(() => {
    const mode = getMetricMode(primarySport)
    const source = mode === 'speed' ? analyzedActivities : reliablePaceActivities
    const recent = [...source].reverse().slice(-24)
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
  }, [analyzedActivities, primarySport, reliablePaceActivities])

  const periodComparison = useMemo(() => {
    if (!analyzedActivities.length) return null
    const latestDate = new Date(analyzedActivities[0].date)
    const currentStart = new Date(latestDate.getTime() - 27 * DAY_MS)
    const previousEnd = new Date(currentStart.getTime() - DAY_MS)
    const previousStart = new Date(previousEnd.getTime() - 27 * DAY_MS)

    const current = analyzedActivities.filter((activity) => {
      const date = new Date(activity.date)
      return date >= currentStart && date <= latestDate
    })
    const previous = analyzedActivities.filter((activity) => {
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
  }, [analyzedActivities])

  const weeklyLoad = useMemo(() => {
    if (!analyzedActivities.length) return [] as Array<{ week: string; km: number; sessions: number; load: number }>
    const latestDate = new Date(analyzedActivities[0].date)
    const currentWeekStart = startOfWeek(latestDate)

    return Array.from({ length: 8 }, (_, index) => {
      const weekStart = new Date(currentWeekStart.getTime() - (7 - index) * WEEK_MS)
      const weekEnd = new Date(weekStart.getTime() + WEEK_MS)
      const items = analyzedActivities.filter((activity) => {
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
  }, [analyzedActivities])

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

  const pageCount = Math.max(1, Math.ceil(filteredActivities.length / ROWS_STEP))
  const visibleActivities = filteredActivities.slice((page - 1) * ROWS_STEP, page * ROWS_STEP)
  const activeAccent = allSportsSelected ? 'var(--accent)' : getSportAccent(primarySport)
  const yearLabel = allYearsSelected ? 'historico completo' : selectedYears.length === 1 ? selectedYears[0] : `${selectedYears.length} anos`
  const totalActivities = Number(meta?.totalActivities ?? 0)
  const viewerRole = String(meta?.viewerRole ?? 'unknown')
  const viewerPlan = String(meta?.viewerPlan ?? 'unknown')
  const viewerAdmin = Boolean(meta?.viewerAdmin ?? isAdmin)
  const viewerScopeLabel = meta?.viewerScope?.fullAccess
    ? 'all'
    : `${Array.isArray(meta?.viewerScope?.types) ? meta.viewerScope.types.join(', ') : '-'} | ${Array.isArray(meta?.viewerScope?.years) ? meta.viewerScope.years.join(', ') : '-'}`
  const mode = getMetricMode(primarySport)
  const focusLabel = allSportsSelected ? 'visao multiesporte' : selectedSports.length === 1 ? getSportLabel(selectedSports[0]) : `${selectedSports.length} esportes`
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
    <main className="shell">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <p className="eyebrow">CPT Performance Lab</p>
            <h1 className="display">Leitura de treino por camadas: volume, desempenho, comparacao e consistencia.</h1>
            <p className="hero-copy">O painel agora assume uma hierarquia clara: primeiro resume o recorte ativo, depois separa o que e volume bruto, o que e desempenho, o que e comparativo de periodo e o que e saude da progressao.</p>
            <div className="hero-meta-row">
              <span className="pill pill-ghost">Atleta: {userName}</span>
              <span className="pill pill-ghost">Foco: {focusLabel}</span>
              <span className="pill pill-ghost">Ano: {yearLabel}</span>
              <span className="pill pill-ghost">Base analitica: {analyzedActivities.length} atividades</span>
              <span className="pill pill-ghost">Base bruta: {mergedActivities.length} atividades</span>
              {ignoredCount > 0 && <span className="pill pill-ghost">Ignoradas: {ignoredCount}</span>}
              <span className="pill pill-ghost">Base total: {totalActivities}</span>
              <span className="pill pill-ghost">Role: {viewerRole}</span>
              <span className="pill pill-ghost">Plan: {viewerPlan}</span>
              <span className="pill pill-ghost">Admin: {viewerAdmin ? 'sim' : 'nao'}</span>
              <span className="pill pill-ghost">Scope: {viewerScopeLabel}</span>
              {meta?.lastSync && <span className="pill pill-ghost">Ultimo sync: {new Date(meta.lastSync).toLocaleDateString('pt-BR')}{meta?.lastSyncMode ? ` | ${meta.lastSyncMode}` : ''}</span>}
            </div>
            <p className="hero-methodology">{methodologyCopy}</p>
            <div className="reading-grid">
              {readingLayers.map((layer) => (
                <article key={layer.title} className="reading-card">
                  <span className="metric-label">{layer.title}</span>
                  <strong>{layer.title}</strong>
                  <p>{layer.copy}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="control-panel">
            <div className="control-header">
              <div>
                <p className="control-label">Leitura principal</p>
                <strong>{allSportsSelected ? 'Tudo no radar' : focusLabel}</strong>
              </div>
              <button onClick={handleThemeToggle} className="btn btn-ghost" type="button">
                {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
              </button>
            </div>

            <div className="filter-block">
              <span className="control-label">Esporte</span>
              <div className="filter-row">
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
              </div>
            </div>

            <div className="filter-block">
              <span className="control-label">Ano</span>
              <div className="filter-row">
                <button
                  type="button"
                  className="sport-chip year-chip"
                  data-active={allYearsSelected}
                  onClick={() => toggleYear('all')}
                  style={{ ['--chip-accent' as string]: 'var(--accent-2)' }}
                >
                  Tudo
                </button>
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
              </div>
            </div>

            <div className="filter-summary">
              <span className="pill pill-ghost">Anos: {yearLabel}</span>
              <span className="pill pill-ghost">Esportes: {focusLabel}</span>
            </div>

            <div className="action-row">
              <button onClick={() => handleSync('incremental')} disabled={syncing || deleting || loadingYears.length > 0} className="btn btn-primary" type="button">
                {syncing ? 'Sincronizando...' : 'Atualizar dados'}
              </button>
              <button onClick={() => signOut({ callbackUrl: '/login' })} className="btn btn-outline" type="button">
                Sair
              </button>
            </div>

            {viewerAdmin && (
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
                        if (data.remaining === 0 && data.enriched > 0) {
                          setTimeout(() => window.location.reload(), 1500)
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
            )}

            {loadingLabel && <p className="sync-message">{loadingLabel}</p>}
            {syncMsg && <p className="sync-message">{syncMsg}</p>}
          </div>
        </div>
      </section>

      {!filteredActivities.length && !loadingYears.length ? (
        <section className="panel">
          <div className="panel-header compact">
            <div>
              <p className="panel-eyebrow">Recorte vazio</p>
              <h3>Sem atividades para este filtro</h3>
            </div>
            <span className="panel-subtitle">Troque o esporte ou o ano para continuar a analise.</span>
          </div>
        </section>
      ) : (
        <>
          {stats && (
            <>
              <SectionLead
                eyebrow="Resumo executivo"
                title="Primeira leitura do recorte ativo"
                subtitle="Aqui entram os numeros de topo. Eles resumem a janela filtrada antes de abrir a analise detalhada."
              />
              <section className="kpi-grid">
                <MetricCard label="Sessoes ativas" value={String(stats.count)} sub={`${yearLabel} | ${focusLabel}`} accent={activeAccent} />
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
            eyebrow="Leitura analitica"
            title="Volume, desempenho, comparacao e consistencia"
            subtitle="Os paineis abaixo ja nao misturam tudo na mesma camada. Cada bloco responde uma pergunta diferente."
          />
          <section className="dashboard-grid">
            <Panel eyebrow="Volume" title="Volume mensal" subtitle="Quilometragem agrupada por mes dentro do ano filtrado">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthly} margin={{ top: 8, right: 4, bottom: 4, left: -16 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--grid)" />
                  <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={chartTooltip} formatter={(value: number) => [`${value} km`, 'Distancia']} />
                  <Bar dataKey="km" radius={[8, 8, 0, 0]}>
                    {monthly.map((entry, index) => (
                      <Cell key={`${entry.month}-${index}`} fill={activeAccent} fillOpacity={0.95 - index * 0.015} />
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
                    formatter={(_value: number, _name: string, item: any) => [
                      getMetricMode(primarySport) === 'speed' ? item.payload.speedLabel : item.payload.paceLabel,
                      getMetricMode(primarySport) === 'speed' ? 'Velocidade' : 'Pace',
                    ]}
                  />
                  <Line type="monotone" dataKey="metricValue" stroke={activeAccent} strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>

            <Panel eyebrow="Comparativo" title="Comparativo 28 dias" subtitle="Janela atual versus as 4 semanas imediatamente anteriores">
              {periodComparison ? (
                <div className="comparison-grid">
                  <CompareTile label="Distancia" current={`${fmt.dist(periodComparison.current.distance)} km`} previous={`${fmt.dist(periodComparison.previous.distance)} km`} delta={fmt.pct(periodComparison.distanceChange)} positive={periodComparison.distanceChange >= 0} />
                  <CompareTile label="Sessoes" current={String(periodComparison.current.sessions)} previous={String(periodComparison.previous.sessions)} delta={fmt.pct(periodComparison.sessionChange)} positive={periodComparison.sessionChange >= 0} />
                  <CompareTile label="Tempo" current={fmt.dur(periodComparison.current.durationSec)} previous={fmt.dur(periodComparison.previous.durationSec)} delta={fmt.pct(periodComparison.durationChange)} positive={periodComparison.durationChange >= 0} />
                  <CompareTile label="Pace" current={fmt.pace(periodComparison.current.avgPace)} previous={fmt.pace(periodComparison.previous.avgPace)} delta={fmt.pct(periodComparison.paceChange)} positive={periodComparison.paceChange >= 0} />
                </div>
              ) : (
                <p className="empty-copy">Ainda nao ha dados suficientes para comparar os ultimos 28 dias.</p>
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
                  <Tooltip contentStyle={chartTooltip} formatter={(value: number) => [value, 'Carga']} />
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
            eyebrow="Leitura de apoio"
            title="Contexto de produto, recordes e leitura qualitativa"
            subtitle="Esses blocos ajudam a interpretar os numeros principais sem transformar o painel em uma planilha crua."
          />
          <section className="insight-grid insight-grid-expanded">
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

            <Panel eyebrow="Produto" title="Leituras rapidas" subtitle="Como interpretar o recorte e a estrutura atual da home">
              <div className="insight-list">
                <InsightItem title="2026 agora carrega completo">O primeiro ano selecionado deixa de ficar preso ao recorte inicial de 160 atividades e passa a buscar o ano inteiro sob demanda.</InsightItem>
                <InsightItem title="Filtros agora podem se combinar">Voce pode ler mais de um ano e mais de um esporte ao mesmo tempo, em vez de trocar a lente inteira a cada clique.</InsightItem>
                <InsightItem title="Carga atual e heuristica">A leitura semanal serve para consistencia e deload, nao como equivalencia cientifica de TRIMP ou TSS.</InsightItem>
              </div>
            </Panel>

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

          <SectionLead
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
              <span className="pill pill-ghost">{filteredActivities.length} itens no historico filtrado</span>
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
  )
}














