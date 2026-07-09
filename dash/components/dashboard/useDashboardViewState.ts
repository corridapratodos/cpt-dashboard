import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WindowMode } from './analytics'
import { applyTheme } from './helpers'
import type { ThemeMode } from './types'
import { usePanelPreferences } from './usePanelPreferences'

type PreviewMode = 'admin' | 'athlete'

type Params = {
  availableYears: string[]
  initialYear: string
  viewerStravaId: number | undefined
  userName: string
}

export function useDashboardViewState({
  availableYears,
  initialYear,
  viewerStravaId,
  userName,
}: Params) {
  const actualYears = useMemo(
    () => [...availableYears].filter((year) => year !== 'all').sort((a, b) => Number(b) - Number(a)),
    [availableYears]
  )
  const defaultYearSelection = useMemo(() => (initialYear !== 'all' ? [initialYear] : actualYears), [actualYears, initialYear])
  const panelPrefsKey = useMemo(() => `cpt-panel-prefs:${viewerStravaId ?? userName}`, [viewerStravaId, userName])

  const [theme, setTheme] = useState<ThemeMode>('dark')
  const [selectedYears, setSelectedYears] = useState<string[]>(defaultYearSelection)
  const [selectedSports, setSelectedSports] = useState<string[]>(['Run'])
  const [windowMode, setWindowMode] = useState<WindowMode>('year')
  const [selectedMonthKey, setSelectedMonthKey] = useState('')
  const [selectedWeekKey, setSelectedWeekKey] = useState('')
  const [previewMode, setPreviewMode] = useState<PreviewMode>('admin')

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

  useEffect(() => {
    if (!selectedYears.length && actualYears.length) {
      setSelectedYears([actualYears[0]])
    }
  }, [actualYears, selectedYears.length])

  const toggleYear = useCallback((year: string) => {
    if (year === 'all') {
      setSelectedYears((current) => (current.length === actualYears.length ? [actualYears[0]] : actualYears))
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
  }, [actualYears])

  const toggleSport = useCallback((type: string, availableSports: string[]) => {
    if (type === 'All') {
      setSelectedSports((current) =>
        current.length === availableSports.length
          ? (availableSports.includes('Run') ? ['Run'] : [availableSports[0]])
          : availableSports
      )
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
  }, [])

  const handleThemeToggle = useCallback(() => {
    setTheme((current) => {
      const next: ThemeMode = current === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      return next
    })
  }, [])

  return {
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
  }
}