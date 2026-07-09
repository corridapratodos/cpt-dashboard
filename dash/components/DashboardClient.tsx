'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { signOut } from 'next-auth/react'
import type { Props, Activity } from './dashboard/types'
import { Sidebar } from './Sidebar'
import { buildActiveAccent, buildSportSummaryLabel, computeDashboardSlices } from './dashboard/analytics'
import { ROWS_STEP, readingLayers } from './dashboard/helpers'
import { useDashboardSync } from './dashboard/useDashboardSync'
import { useDashboardViewState } from './dashboard/useDashboardViewState'
import { useYearAnalytics } from './dashboard/useYearAnalytics'
import { useHealthData } from './dashboard/useHealthData'
import { useDashboardHistory } from './dashboard/useDashboardHistory'
import { useActivityDetail } from './dashboard/useActivityDetail'
import { buildAnalysisInsights, buildLoadingLabel, buildYearLabel } from './dashboard/insights'
import { DashboardHeader } from './dashboard/DashboardHeader'
import { DashboardEmptyState } from './dashboard/DashboardEmptyState'
import { AdminControlPanel } from './dashboard/AdminControlPanel'
import { DashboardExecutiveSection } from './dashboard/DashboardExecutiveSection'
import { DashboardAnalysisSection } from './dashboard/DashboardAnalysisSection'
import { DashboardInterpretationSection } from './dashboard/DashboardInterpretationSection'
import { DashboardHealthSection } from './dashboard/DashboardHealthSection'
import { DashboardHistorySection } from './dashboard/DashboardHistorySection'
import { DashboardLegalSection } from './dashboard/DashboardLegalSection'
import { SyncStatusModal } from './dashboard/SyncStatusModal'
import { ActivityDetailModal } from './dashboard/ActivityDetailModal'

export default function DashboardClient({ initialActivities, initialAnalytics, initialYear, availableYears, isAdmin, meta, userName }: Props) {
  const [cacheRevision, setCacheRevision] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const [page, setPage] = useState(1)

  const viewerRole = String(meta?.viewerRole ?? 'unknown')
  const viewerPlan = String(meta?.viewerPlan ?? 'unknown')
  const viewerAdmin = Boolean(meta?.viewerAdmin ?? isAdmin)
  const canViewActivitySplits = viewerRole === 'master' || viewerPlan === 'pro'

  const {
    actualYears,
    theme,
    selectedYears,
    selectedSports,
    setSelectedSports,
    windowMode,
    setWindowMode,
    selectedMonthKey,
    setSelectedMonthKey,
    selectedWeekKey,
    setSelectedWeekKey,
    previewMode,
    setPreviewMode,
    toggleYear,
    toggleSport,
    handleThemeToggle,
  } = useDashboardViewState({
    availableYears,
    initialYear,
    viewerStravaId: meta?.viewerStravaId,
    userName,
  })

  const analyticsCacheKeyPrefix = useMemo(
    () => `cpt-analytics:${meta?.viewerStravaId ?? userName}:${meta?.lastSync ?? 'nosync'}:${cacheRevision}`,
    [cacheRevision, meta?.lastSync, meta?.viewerStravaId, userName]
  )
  const historyCacheKeyPrefix = useMemo(
    () => `cpt-history:${meta?.viewerStravaId ?? userName}:${meta?.lastSync ?? 'nosync'}:${cacheRevision}`,
    [cacheRevision, meta?.lastSync, meta?.viewerStravaId, userName]
  )

  const bumpCacheRevision = useCallback(() => {
    setCacheRevision((current) => current + 1)
  }, [])

  const { yearAnalytics, loadingAnalyticsYears, loadError, markYearsDirty } = useYearAnalytics({
    initialAnalytics,
    initialYear,
    selectedYears,
    analyticsCacheKeyPrefix,
  })

  const dashboardSync = useDashboardSync({
    selectedYears,
    onYearsDirty: markYearsDirty,
    onCacheBump: bumpCacheRevision,
    onPageReset: () => setPage(1),
  })

  const computed = useMemo(
    () => computeDashboardSlices({
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

  const { sleepData, weightData } = useHealthData({
    isAdmin,
    actualYears,
    selectedYears,
  })

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
  }, [availableSports, setSelectedSports])

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
  }, [monthOptions, selectedMonthKey, setSelectedMonthKey])

  useEffect(() => {
    if (!weekOptions.length) {
      if (selectedWeekKey) setSelectedWeekKey('')
      return
    }

    if (!weekOptions.some((option) => option.key === selectedWeekKey)) {
      setSelectedWeekKey(weekOptions[0].key)
    }
  }, [selectedWeekKey, setSelectedWeekKey, weekOptions])

  const analysisInsights = useMemo(
    () => buildAnalysisInsights({ windowMode, periodComparison, periodBenchmark, periodContext, loadInsight }),
    [loadInsight, periodBenchmark, periodComparison, periodContext, windowMode]
  )

  const effortHighlights = useMemo(() => historyActivities.slice(0, 4), [historyActivities])
  const activeActivities = activeWindow.days
  const loadingYears = loadingAnalyticsYears
  const pageCount = historyPageCount
  const visibleActivities = historyActivities
  const activeAccent = buildActiveAccent(selectedSports, availableSports)
  const yearLabel = buildYearLabel(selectedYears, allYearsSelected)
  const windowLabel = activeWindow.label
  const totalActivities = Number(meta?.totalActivities ?? 0)
  const showOperatorNotes = viewerAdmin && previewMode === 'admin'
  const focusLabel = buildSportSummaryLabel(selectedSports, availableSports)
  const loadingLabel = buildLoadingLabel(loadingYears)
  const statusMessage = loadError || dashboardSync.syncMsg

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

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm('Isso vai excluir todos os seus dados sincronizados do CPT Dashboard. Deseja continuar?')
    if (!confirmed) return

    setDeleting(true)
    dashboardSync.setSyncMsg('')

    try {
      const response = await fetch('/api/account', { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error ?? 'Nao foi possivel excluir os dados.')
      await signOut({ callbackUrl: '/login' })
    } catch (error) {
      dashboardSync.setSyncMsg(error instanceof Error ? error.message : 'Nao foi possivel excluir os dados.')
      setDeleting(false)
    }
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
      <Sidebar meta={meta} isAdmin={showOperatorNotes} />

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
          onToggleSport={(type: string) => toggleSport(type, availableSports)}
          onToggleYear={toggleYear}
          onWindowModeChange={setWindowMode}
          onShiftPeriod={shiftActivePeriod}
          onPeriodKeyChange={(key: string) => (windowMode === 'month' ? setSelectedMonthKey(key) : setSelectedWeekKey(key))}
        />

        <main className="shell">
          {showOperatorNotes && (
            <AdminControlPanel
              loadingLabel={loadingLabel}
              syncMsg={statusMessage}
              syncing={dashboardSync.syncing}
              deleting={deleting}
              backfilling={dashboardSync.backfilling}
              loadingYears={loadingYears.length}
              onFullSync={() => dashboardSync.handleSync('full')}
              onBackfill={dashboardSync.handleBackfillBestEfforts}
            />
          )}

          {!showOperatorNotes && (loadingLabel || statusMessage) && (
            <div className="hero-messages">
              {loadingLabel && <p className="sync-message">{loadingLabel}</p>}
              {statusMessage && <p className="sync-message">{statusMessage}</p>}
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