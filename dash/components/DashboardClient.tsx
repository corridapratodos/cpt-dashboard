'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ActivityYearAnalytics } from '@/lib/analytics-types'
import { signOut } from 'next-auth/react'
import type { Activity, Props, SleepRecord, ThemeMode, WeightRecord } from './dashboard/types'
import { Sidebar } from './Sidebar'
import { buildActiveAccent, buildSportSummaryLabel, computeDashboardSlices, type WindowMode } from './dashboard/analytics'
import {
  ROWS_STEP,
  applyTheme,
  fmt,
  getMetricMode,
  readingLayers,
} from './dashboard/helpers'
import { useActivityDetail } from './dashboard/useActivityDetail'
import { usePanelPreferences } from './dashboard/usePanelPreferences'
import { ActivityDetailModal } from './dashboard/ActivityDetailModal'
import { useDashboardSync } from './dashboard/useDashboardSync'
import { useDashboardHistory } from './dashboard/useDashboardHistory'
import { AdminControlPanel } from './dashboard/AdminControlPanel'
import { SyncStatusModal } from './dashboard/SyncStatusModal'
import { DashboardHeader } from './dashboard/DashboardHeader'
import { DashboardEmptyState } from './dashboard/DashboardEmptyState'
import { DashboardExecutiveSection } from './dashboard/DashboardExecutiveSection'
import { DashboardAnalysisSection } from './dashboard/DashboardAnalysisSection'
import { DashboardInterpretationSection } from './dashboard/DashboardInterpretationSection'
import { DashboardHealthSection } from './dashboard/DashboardHealthSection'
import { DashboardHistorySection } from './dashboard/DashboardHistorySection'
import { DashboardLegalSection } from './dashboard/DashboardLegalSection'

export default function DashboardClient({ initialActivities, initialAnalytics, initialYear, availableYears, isAdmin, meta, userName }: Props) {
  const actualYears = useMemo(
    () => [...availableYears].filter((year) => year !== 'all').sort((a, b) => Number(b) - Number(a)),
    [availableYears]
  )
  const [cacheRevision, setCacheRevision] = useState(0)
  const defaultYearSelection = useMemo(() => (initialYear !== 'all' ? [initialYear] : actualYears), [actualYears, initialYear])
  const panelPrefsKey = useMemo(
    () => `cpt-panel-prefs:${meta?.viewerStravaId ?? userName}`,
    [meta?.viewerStravaId, userName]
  )
  const analyticsCacheKeyPrefix = useMemo(
    () => `cpt-analytics:${meta?.viewerStravaId ?? userName}:${meta?.lastSync ?? 'nosync'}:${cacheRevision}`,
    [cacheRevision, meta?.lastSync, meta?.viewerStravaId, userName]
  )
  const historyCacheKeyPrefix = useMemo(
    () => `cpt-history:${meta?.viewerStravaId ?? userName}:${meta?.lastSync ?? 'nosync'}:${cacheRevision}`,
    [cacheRevision, meta?.lastSync, meta?.viewerStravaId, userName]
  )


  const [deleting, setDeleting] = useState(false)
  const [sleepData, setSleepData] = useState<SleepRecord[]>([])
  const [weightData, setWeightData] = useState<WeightRecord[]>([])
  const [theme, setTheme] = useState<ThemeMode>('dark')
  const [yearAnalytics, setYearAnalytics] = useState<Record<string, ActivityYearAnalytics>>(
    initialAnalytics && initialYear !== 'all' ? { [initialYear]: initialAnalytics } : {}
  )
  const [partialAnalyticsYears, setPartialAnalyticsYears] = useState<Record<string, boolean>>(
    initialAnalytics && initialYear !== 'all' ? { [initialYear]: false } : {}
  )
  const [loadingAnalyticsYears, setLoadingAnalyticsYears] = useState<string[]>([])
  const [selectedYears, setSelectedYears] = useState<string[]>(defaultYearSelection)
  const [selectedSports, setSelectedSports] = useState<string[]>(['Run'])
  const [windowMode, setWindowMode] = useState<WindowMode>('year')
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('')
  const [selectedWeekKey, setSelectedWeekKey] = useState<string>('')
  const [previewMode, setPreviewMode] = useState<'admin' | 'athlete'>('admin')
  const [page, setPage] = useState(1)

  const viewerRole = String(meta?.viewerRole ?? 'unknown')
  const viewerPlan = String(meta?.viewerPlan ?? 'unknown')
  const viewerAdmin = Boolean(meta?.viewerAdmin ?? isAdmin)
  const canViewActivitySplits = viewerRole === 'master' || viewerPlan === 'pro'


  useEffect(() => {
    const saved = localStorage.getItem('cpt-theme')
    const mode: ThemeMode = saved === 'light' ? 'light' : 'dark'
    applyTheme(mode)
    setTheme(mode)
  }, [])

  const panelPrefs = usePanelPreferences(
    panelPrefsKey,
    { selectedYears, selectedSports, windowMode, selectedMonthKey, selectedWeekKey, previewMode },
    actualYears,
    defaultYearSelection,
  )


  const markYearsDirty = useCallback((years: string[]) => {
    setPartialAnalyticsYears((current) => {
      const next = { ...current }
      for (const year of years) next[year] = true
      return next
    })
  }, [])

  const bumpCacheRevision = useCallback(() => {
    setCacheRevision((current) => current + 1)
  }, [])

  const dashboardSync = useDashboardSync({
    selectedYears,
    onYearsDirty: markYearsDirty,
    onCacheBump: bumpCacheRevision,
    onPageReset: () => setPage(1),
  })

  useEffect(() => {
    if (!panelPrefs.hydrated || !panelPrefs.initial) return
    const saved = panelPrefs.initial
    if (saved.selectedYears?.length) setSelectedYears(saved.selectedYears)
    if (saved.selectedSports?.length) setSelectedSports(saved.selectedSports)
    if (saved.windowMode) setWindowMode(saved.windowMode)
    if (saved.selectedMonthKey) setSelectedMonthKey(saved.selectedMonthKey)
    if (saved.selectedWeekKey) setSelectedWeekKey(saved.selectedWeekKey)
    if (saved.previewMode) setPreviewMode(saved.previewMode)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelPrefs.hydrated])

  // Panel preferences persistence is now handled by usePanelPreferences hook.

  useEffect(() => {
    if (!isAdmin) return
    const years = selectedYears.length ? selectedYears : actualYears
    if (!years.length) return
    const from = `${Math.min(...years.map(Number))}-01-01`
    const to = `${Math.max(...years.map(Number))}-12-31`
    fetch(`/api/health?from=${from}&to=${to}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return
        setSleepData(data.sleep ?? [])
        setWeightData(data.weight ?? [])
      })
      .catch(() => {})
  }, [actualYears, isAdmin, selectedYears])

  useEffect(() => {
    if (!selectedYears.length && actualYears.length) {
      setSelectedYears([actualYears[0]])
    }
  }, [actualYears, selectedYears.length])

  useEffect(() => {
    if (!selectedYears.length) return

    let active = true
    const yearsToLoad = selectedYears.filter((year) => !yearAnalytics[year] || partialAnalyticsYears[year])

    if (!yearsToLoad.length) return

    async function loadAnalyticsYears() {
      setLoadingAnalyticsYears(yearsToLoad)
      dashboardSync.setSyncMsg('')

      try {
        const cachedResponses: ActivityYearAnalytics[] = []
        const pendingYears: string[] = []

        for (const year of yearsToLoad) {
          try {
            const cached = sessionStorage.getItem(`${analyticsCacheKeyPrefix}:${year}`)
            if (!cached) {
              pendingYears.push(year)
              continue
            }

            cachedResponses.push(JSON.parse(cached) as ActivityYearAnalytics)
          } catch {
            pendingYears.push(year)
          }
        }

        if (cachedResponses.length && active) {
          setYearAnalytics((current) => {
            const next = { ...current }
            for (const analytics of cachedResponses) {
              next[analytics.year] = analytics
            }
            return next
          })

          setPartialAnalyticsYears((current) => {
            const next = { ...current }
            for (const analytics of cachedResponses) {
              next[analytics.year] = false
            }
            return next
          })
        }

        if (!pendingYears.length) {
          if (active) setLoadingAnalyticsYears([])
          return
        }

        const params = new URLSearchParams()
        params.set('years', pendingYears.join(','))
        const res = await fetch(`/api/activities/analytics?${params.toString()}`)
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data?.error ?? 'Nao foi possivel carregar os agregados analiticos.')
        }

        const responses = (data.analytics ?? []) as ActivityYearAnalytics[]
        if (!active) return

        setYearAnalytics((current) => {
          const next = { ...current }
          for (const analytics of responses) {
            next[analytics.year] = analytics
            try {
              sessionStorage.setItem(`${analyticsCacheKeyPrefix}:${analytics.year}`, JSON.stringify(analytics))
            } catch {}
          }
          return next
        })

        setPartialAnalyticsYears((current) => {
          const next = { ...current }
          for (const year of pendingYears) {
            next[year] = false
          }
          return next
        })
      } catch (error) {
        if (!active) return
        dashboardSync.setSyncMsg(error instanceof Error ? error.message : 'Nao foi possivel carregar os agregados analiticos.')
      } finally {
        if (active) setLoadingAnalyticsYears([])
      }
    }

    void loadAnalyticsYears()

    return () => {
      active = false
    }
  }, [analyticsCacheKeyPrefix, partialAnalyticsYears, selectedYears, yearAnalytics])

  const handleThemeToggle = () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm('Isso vai excluir todos os seus dados sincronizados do CPT Dashboard. Deseja continuar?')
    if (!confirmed) return

    setDeleting(true)
    dashboardSync.setSyncMsg('')

    try {
      const res = await fetch('/api/account', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Nao foi possivel excluir os dados.')
      await signOut({ callbackUrl: '/login' })
    } catch (error) {
      dashboardSync.setSyncMsg(error instanceof Error ? error.message : 'Nao foi possivel excluir os dados.')
      setDeleting(false)
    }
  }


  const computed = useMemo(
    () =>
      computeDashboardSlices({
        actualYears,
        selectedYears,
        selectedSports,
        yearAnalytics,
        windowMode,
        selectedMonthKey,
        selectedWeekKey,
      }),
    [actualYears, selectedMonthKey, selectedSports, selectedWeekKey, selectedYears, windowMode, yearAnalytics]
  )

  const {
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
    periodContext,
    periodRadar,
    periodBenchmark,
    records,
  } = computed


  const {
    page: historyPage,
    setPage: setHistoryPage,
    historyLoading,
    historyActivities,
    historyCount,
    historyPageCount,
    replaceActivity,
  } = useDashboardHistory({
    initialActivities,
    page,
    setPage,
    pageSize: ROWS_STEP,
    historyCacheKeyPrefix,
    selectedYears,
    selectedSports,
    allSportsSelected,
    activeWindowStart: activeWindow.start,
    activeWindowEnd: activeWindow.end,
    loadingAnalytics: loadingAnalyticsYears.length > 0,
    setSyncMsg: dashboardSync.setSyncMsg,
  })

  const handleActivityUpdated = useCallback((updated: Activity) => {
    replaceActivity(updated)
    markYearsDirty([updated.date.slice(0, 4)])
    bumpCacheRevision()
  }, [bumpCacheRevision, markYearsDirty, replaceActivity])

  const activityDetail = useActivityDetail(canViewActivitySplits, handleActivityUpdated, dashboardSync.setSyncMsg)

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

  const hasPeriodNavigation = windowMode === 'month' || windowMode === 'week'
  const activePeriodOptions = windowMode === 'month' ? monthOptions : windowMode === 'week' ? weekOptions : []
  const activePeriodKey = windowMode === 'month' ? selectedMonthKey : selectedWeekKey
  const activePeriodIndex = activePeriodOptions.findIndex((option) => option.key === activePeriodKey)
  const canGoToNewerPeriod = activePeriodIndex > 0
  const canGoToOlderPeriod = activePeriodIndex >= 0 && activePeriodIndex < activePeriodOptions.length - 1

  useEffect(() => {
    if (!monthOptions.length) {
      if (selectedMonthKey) setSelectedMonthKey('')
      return
    }

    if (!monthOptions.some((option) => option.key === selectedMonthKey)) {
      setSelectedMonthKey(monthOptions[0].key)
    }
  }, [monthOptions, selectedMonthKey])

  useEffect(() => {
    if (!weekOptions.length) {
      if (selectedWeekKey) setSelectedWeekKey('')
      return
    }

    if (!weekOptions.some((option) => option.key === selectedWeekKey)) {
      setSelectedWeekKey(weekOptions[0].key)
    }
  }, [selectedWeekKey, weekOptions])


  // Activity detail fetching is now handled by useActivityDetail hook.


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

  const effortHighlights = useMemo(() => historyActivities.slice(0, 4), [historyActivities])
  const activeActivities = activeWindow.days
  const loadingYears = loadingAnalyticsYears
  const pageCount = historyPageCount
  const visibleActivities = historyActivities
  const activeAccent = buildActiveAccent(selectedSports, availableSports)
  const yearLabel = allYearsSelected ? 'historico completo' : selectedYears.length === 1 ? selectedYears[0] : `${selectedYears.length} anos`
  const windowLabel = activeWindow.label
  const totalActivities = Number(meta?.totalActivities ?? 0)
  const viewerScopeLabel = meta?.viewerScope?.fullAccess
    ? 'all'
    : `${Array.isArray(meta?.viewerScope?.types) ? meta.viewerScope.types.join(', ') : '-'} | ${Array.isArray(meta?.viewerScope?.years) ? meta.viewerScope.years.join(', ') : '-'}`
  const showOperatorNotes = viewerAdmin && previewMode === 'admin'
  const mode = getMetricMode(primarySport)
  const focusLabel = buildSportSummaryLabel(selectedSports, availableSports)

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

  if (!totalActivities && !mergedDays.length) {
    return (
      <DashboardEmptyState
        syncing={dashboardSync.syncing}
        viewerAdmin={viewerAdmin}
        onIncrementalSync={() => dashboardSync.handleSync('incremental')}
        onFullSync={() => dashboardSync.handleSync('full')}
      />
    )
  }

  return (
    <div className="app-layout">
      <Sidebar
        meta={meta}
        isAdmin={showOperatorNotes}
      />

      <div className="app-main">
        <DashboardHeader
          userName={userName}
          meta={meta}
          viewerRole={viewerRole}
          viewerPlan={viewerPlan}
          viewerAdmin={viewerAdmin}
          previewMode={previewMode}
          theme={theme}
          ignoredCount={ignoredCount}
          deleting={deleting}
          syncing={dashboardSync.syncing}
          loadingYears={loadingYears.length}
          focusLabel={focusLabel}
          yearLabel={yearLabel}
          windowLabel={windowLabel}
          availableSports={availableSports}
          selectedSports={selectedSports}
          allSportsSelected={allSportsSelected}
          actualYears={actualYears}
          selectedYears={selectedYears}
          windowMode={windowMode}
          hasPeriodNavigation={hasPeriodNavigation}
          activePeriodOptions={activePeriodOptions}
          activePeriodKey={activePeriodKey}
          activePeriodIndex={activePeriodIndex}
          canGoToNewerPeriod={canGoToNewerPeriod}
          canGoToOlderPeriod={canGoToOlderPeriod}
          onTogglePreview={() => setPreviewMode(previewMode === 'admin' ? 'athlete' : 'admin')}
          onToggleTheme={handleThemeToggle}
          onSync={() => dashboardSync.handleSync('incremental')}
          onSignOut={() => signOut({ callbackUrl: '/login' })}
          onToggleSport={toggleSport}
          onToggleYear={toggleYear}
          onWindowModeChange={setWindowMode}
          onShiftPeriod={shiftActivePeriod}
          onPeriodKeyChange={(key: string) => (windowMode === 'month' ? setSelectedMonthKey(key) : setSelectedWeekKey(key))}
        />

        <main className="shell">

        {showOperatorNotes && (
          <AdminControlPanel
            loadingLabel={loadingLabel}
            syncMsg={dashboardSync.syncMsg}
            syncing={dashboardSync.syncing}
            deleting={deleting}
            backfilling={dashboardSync.backfilling}
            loadingYears={loadingYears.length}
            onFullSync={() => dashboardSync.handleSync('full')}
            onBackfill={dashboardSync.handleBackfillBestEfforts}
          />

        )}
        {!showOperatorNotes && (loadingLabel || dashboardSync.syncMsg) && (
          <div className="hero-messages">
            {loadingLabel && <p className="sync-message">{loadingLabel}</p>}
            {dashboardSync.syncMsg && <p className="sync-message">{dashboardSync.syncMsg}</p>}
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
          <DashboardExecutiveSection
            stats={stats}
            activeWindowTitle={activeWindow.title}
            focusLabel={focusLabel}
            activeAccent={activeAccent}
          />

          <DashboardAnalysisSection
            activeWindow={activeWindow}
            primarySport={primarySport}
            activeAccent={activeAccent}
            volumeSeries={volumeSeries}
            performanceTimeline={performanceTimeline}
            periodComparison={periodComparison}
            weeklyLoad={weeklyLoad}
            loadInsight={loadInsight}
          />

          <DashboardInterpretationSection
            windowMode={windowMode}
            stats={stats}
            periodContext={periodContext}
            analysisInsights={analysisInsights}
            periodBenchmark={periodBenchmark}
            periodRadar={periodRadar}
            showOperatorNotes={showOperatorNotes}
            records={records}
            effortHighlights={effortHighlights}
          />

          <DashboardHealthSection
            isAdmin={isAdmin}
            sleepData={sleepData}
            weightData={weightData}
            selectedYears={selectedYears}
            activeWindow={activeWindow}
            yearLabel={yearLabel}
            activeAccent={activeAccent}
          />

          <DashboardHistorySection
            historyCount={historyCount}
            historyLoading={historyLoading}
            visibleActivities={visibleActivities}
            historyPage={historyPage}
            pageCount={pageCount}
            onPreviousPage={() => setHistoryPage((current) => Math.max(1, current - 1))}
            onNextPage={() => setHistoryPage((current) => Math.min(pageCount, current + 1))}
            onSelectActivity={activityDetail.select}
          />
        </>
      )}

      <DashboardLegalSection
        deleting={deleting}
        syncing={dashboardSync.syncing}
        onDeleteAccount={handleDeleteAccount}
      />
      {dashboardSync.blockingAlert && (
        <SyncStatusModal
          title={dashboardSync.blockingAlert.title}
          message={dashboardSync.blockingAlert.message}
          onClose={dashboardSync.clearBlockingAlert}
        />
      )}
      {activityDetail.selectedActivity && (
        <ActivityDetailModal
          activity={activityDetail.selectedActivity}
          splits={activityDetail.splits}
          splitsLoading={activityDetail.loading}
          splitsError={activityDetail.error}
          canViewSplits={canViewActivitySplits}
          reviewing={activityDetail.reviewing}
          onClose={() => activityDetail.select(null)}
          onToggleExclusion={activityDetail.toggleExclusion}
        />
      )}
      </main>
      </div>
    </div>
  )
}


