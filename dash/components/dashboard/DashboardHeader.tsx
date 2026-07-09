'use client'

import { useState } from 'react'
import type { DashboardMeta, ThemeMode } from './types'
import type { WindowMode, WindowOption } from './analytics'
import { fmt, getSportLabel, sportMeta } from './helpers'

type DashboardHeaderProps = {
  userName: string
  meta: DashboardMeta | null
  viewerRole: string
  viewerPlan: string
  viewerAdmin: boolean
  previewMode: 'admin' | 'athlete'
  theme: ThemeMode
  ignoredCount: number
  deleting: boolean
  syncing: boolean
  loadingYears: number
  focusLabel: string
  yearLabel: string
  windowLabel: string
  availableSports: string[]
  selectedSports: string[]
  allSportsSelected: boolean
  actualYears: string[]
  selectedYears: string[]
  windowMode: WindowMode
  hasPeriodNavigation: boolean
  activePeriodOptions: WindowOption[]
  activePeriodKey: string
  activePeriodIndex: number
  canGoToNewerPeriod: boolean
  canGoToOlderPeriod: boolean
  onTogglePreview: () => void
  onToggleTheme: () => void
  onSync: () => void
  onSignOut: () => void
  onToggleSport: (type: string) => void
  onToggleYear: (year: string) => void
  onWindowModeChange: (mode: WindowMode) => void
  onShiftPeriod: (direction: 'newer' | 'older') => void
  onPeriodKeyChange: (key: string) => void
}

export function DashboardHeader({
  userName,
  meta,
  viewerRole,
  viewerPlan,
  viewerAdmin,
  previewMode,
  theme,
  ignoredCount,
  deleting,
  syncing,
  loadingYears,
  focusLabel,
  yearLabel,
  windowLabel,
  availableSports,
  selectedSports,
  allSportsSelected,
  actualYears,
  selectedYears,
  windowMode,
  hasPeriodNavigation,
  activePeriodOptions,
  activePeriodKey,
  activePeriodIndex,
  canGoToNewerPeriod,
  canGoToOlderPeriod,
  onTogglePreview,
  onToggleTheme,
  onSync,
  onSignOut,
  onToggleSport,
  onToggleYear,
  onWindowModeChange,
  onShiftPeriod,
  onPeriodKeyChange,
}: DashboardHeaderProps) {
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const mobileFilterSummary = `${focusLabel} | ${yearLabel} | ${windowLabel}`

  return (
    <header className="app-header">
      <div className="app-header-top">
        <div className="app-header-identity">
          {meta && <p className="app-header-role">{viewerRole} | {viewerPlan}</p>}
          <p className="app-header-name">{userName}</p>
        </div>
        <div className="app-header-actions">
          {meta?.lastSync && (
            <span className="app-header-sync-info">
              Last sync | {fmt.dayMonthYear(meta.lastSync)} | {meta?.lastSyncMode ?? 'incremental'}
            </span>
          )}
          {ignoredCount > 0 && <span className="pill pill-ghost">{ignoredCount} ignoradas</span>}
          {viewerAdmin && (
            <button
              type="button"
              className="sport-chip preview-chip"
              data-active={previewMode === 'admin'}
              style={{ ['--chip-accent' as string]: 'var(--accent-4)' }}
              onClick={onTogglePreview}
            >
              {previewMode === 'admin' ? 'Admin' : 'Atleta'}
            </button>
          )}
          <button onClick={onToggleTheme} className="btn btn-ghost" type="button">
            {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          </button>
          <button onClick={onSync} disabled={syncing || deleting || loadingYears > 0} className="btn btn-primary" type="button">
            {syncing ? 'Sincronizando...' : 'Atualizar'}
          </button>
          <button onClick={onSignOut} className="btn btn-ghost" type="button">
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

      <div className={`filter-strip ${mobileFiltersOpen ? 'filter-strip-open' : ''}`}>
        <span className="filter-label">Esporte</span>
        <button
          type="button"
          className="sport-chip"
          data-active={allSportsSelected}
          onClick={() => onToggleSport('All')}
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
            onClick={() => onToggleSport(type)}
            style={{ ['--chip-accent' as string]: sportMeta[type]?.accent ?? 'var(--accent)' }}
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
            onClick={() => onToggleYear(year)}
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
            onClick={() => onWindowModeChange(option.key)}
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
                onClick={() => onShiftPeriod('newer')}
                disabled={!canGoToNewerPeriod}
              >
                Mais recente
              </button>
              <select
                className="period-select period-select-inline"
                value={activePeriodKey}
                onChange={(event) => onPeriodKeyChange(event.target.value)}
              >
                {activePeriodOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
              <button
                type="button"
                className="btn btn-ghost period-shift"
                onClick={() => onShiftPeriod('older')}
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
  )
}
