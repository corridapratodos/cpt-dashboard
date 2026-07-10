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
import { useDashboardPeriodNavigation } from './dashboard/useDashboardPeriodNavigation'
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
import { ActivityDetailDialog } from './dashboard/ActivityDetailDialog'

export default function DashboardClient({ initialActivities, initialAnalytics, initialYear, availableYears, isAdmin, meta, userName }: Props) {
  const [cacheRevision, setCacheRevision] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)

  const viewerRole = String(meta?.viewerRole ?? 'unknown')
  const viewerPlan = String(meta?.viewerPlan ?? 'unknown')
  const viewerAdmin = Boolean(meta?.viewerAdmin ?? isAdmin)
  const canViewActivitySplits = viewerRole === 'master' || viewerPlan === 'pro'
  const canUseDashboardAi = viewerRole === 'master'

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
    routineConsistency,
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

  const periodNavigation = useDashboardPeriodNavigation({
    windowMode,
    monthOptions,
    weekOptions,
    selectedMonthKey,
    selectedWeekKey,
    setSelectedMonthKey,
    setSelectedWeekKey,
  })

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
  const aiPayload = useMemo(() => ({
    athleteName: userName,
    generatedAt: new Date().toISOString(),
    sportFocus: focusLabel,
    yearLabel,
    windowLabel,
    activeWindowTitle: activeWindow.title,
    stats: stats
      ? {
          sessions: stats.count,
          distanceKm: Number(stats.totalDist.toFixed(1)),
          durationSec: stats.totalDur,
          avgPaceSec: stats.avgPace ?? null,
          longestSessionKm: Number(stats.longest.distanceKm.toFixed(1)),
          fastestPaceSec: stats.fastest?.paceSec ?? null,
        }
      : null,
    routineConsistency: routineConsistency
      ? {
          activeDays: routineConsistency.activeDays,
          trackedWeeks: routineConsistency.trackedWeeks,
          solidWeeks: routineConsistency.solidWeeks,
          activeDaysPerWeek: routineConsistency.activeDaysPerWeek,
          currentStreakDays: routineConsistency.currentStreakDays,
          longestStreakDays: routineConsistency.longestStreakDays,
          status: routineConsistency.status,
          title: routineConsistency.title,
          copy: routineConsistency.copy,
        }
      : null,
    periodComparison: periodComparison
      ? {
          current: {
            distanceKm: Number(periodComparison.current.distance.toFixed(1)),
            sessions: periodComparison.current.sessions,
            durationSec: periodComparison.current.durationSec,
            avgPaceSec: periodComparison.current.avgPace,
          },
          previous: {
            distanceKm: Number(periodComparison.previous.distance.toFixed(1)),
            sessions: periodComparison.previous.sessions,
            durationSec: periodComparison.previous.durationSec,
            avgPaceSec: periodComparison.previous.avgPace,
          },
          delta: {
            distancePct: Number(periodComparison.distanceChange.toFixed(1)),
            sessionsPct: Number(periodComparison.sessionChange.toFixed(1)),
            durationPct: Number(periodComparison.durationChange.toFixed(1)),
            pacePct: periodComparison.paceChange == null ? null : Number(periodComparison.paceChange.toFixed(1)),
          },
        }
      : null,
    periodContext: periodContext
      ? {
          activeDays: periodContext.activeDays,
          spanDays: periodContext.spanDays,
          densityPct: periodContext.densityPct,
          avgSessionKm: periodContext.avgSessionKm,
          avgSessionMinutes: periodContext.avgSessionMinutes,
          longestSharePct: periodContext.longestSharePct,
          sessionsPerWeek: periodContext.sessionsPerWeek,
        }
      : null,
    periodRadar: periodRadar
      ? {
          biggestGapDays: periodRadar.biggestGapDays,
          strongestDay: {
            label: periodRadar.strongestDay.label,
            distanceKm: Number(periodRadar.strongestDay.distance.toFixed(1)),
            durationSec: periodRadar.strongestDay.durationSec,
          },
          strongestDaySharePct: periodRadar.strongestDaySharePct,
          topWeekdayLabel: periodRadar.topWeekdayLabel,
          topWeekdaySharePct: periodRadar.topWeekdaySharePct,
          weekendSharePct: periodRadar.weekendSharePct,
        }
      : null,
    analysisInsights,
    recentActivities: effortHighlights.map((activity) => ({
      date: activity.date,
      name: activity.name,
      type: activity.type,
      distanceKm: Number(activity.distanceKm.toFixed(1)),
      durationSec: activity.durationSec,
      paceSec: activity.paceSec,
      hrAvg: activity.hrAvg,
    })),
  }), [activeWindow.title, analysisInsights, effortHighlights, focusLabel, periodComparison, periodContext, periodRadar, routineConsistency, stats, userName, windowLabel, yearLabel])

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
          hasPeriodNavigation={periodNavigation.hasPeriodNavigation}
          activePeriodOptions={periodNavigation.activePeriodOptions}
          activePeriodKey={periodNavigation.activePeriodKey}
          activePeriodIndex={periodNavigation.activePeriodIndex}
          canGoToNewerPeriod={periodNavigation.canGoToNewerPeriod}
          canGoToOlderPeriod={periodNavigation.canGoToOlderPeriod}
          onTogglePreview={() => setPreviewMode(previewMode === 'admin' ? 'athlete' : 'admin')}
          onToggleTheme={handleThemeToggle}
          onSync={() => dashboardSync.handleSync('incremental')}
          onSignOut={() => signOut({ callbackUrl: '/login' })}
          onToggleSport={(type: string) => toggleSport(type, availableSports)}
          onToggleYear={toggleYear}
          onWindowModeChange={setWindowMode}
          onShiftPeriod={periodNavigation.shiftActivePeriod}
          onPeriodKeyChange={periodNavigation.handlePeriodKeyChange}
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
                routineConsistency={routineConsistency}
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
                aiPayload={aiPayload}
                canUseDashboardAi={canUseDashboardAi}
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
                onSelectActivity={setSelectedActivity}
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

          {selectedActivity && (
            <ActivityDetailDialog
              activity={selectedActivity}
              canViewActivitySplits={canViewActivitySplits}
              setSyncMsg={dashboardSync.setSyncMsg}
              onActivityUpdated={handleActivityUpdated}
              onClose={() => setSelectedActivity(null)}
            />
          )}
        </main>
      </div>
    </div>
  )
}



