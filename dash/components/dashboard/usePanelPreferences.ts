import { useEffect, useState } from 'react'
import type { WindowMode } from './analytics'

type PanelPrefsShape = {
  selectedYears?: string[]
  selectedSports?: string[]
  windowMode?: WindowMode
  selectedMonthKey?: string
  selectedWeekKey?: string
  previewMode?: 'admin' | 'athlete'
}

type PanelPrefsResult = {
  hydrated: boolean
  initial: PanelPrefsShape | null
}

/**
 * Reads panel preferences from localStorage once and returns the hydrated values.
 * Also persists the current values back to localStorage whenever they change.
 */
export function usePanelPreferences(
  key: string,
  currentValues: PanelPrefsShape,
  actualYears: string[],
  defaultYearSelection: string[],
): PanelPrefsResult {
  const [hydrated, setHydrated] = useState(false)
  const [initial, setInitial] = useState<PanelPrefsShape | null>(null)

  // Read from localStorage once on mount
  useEffect(() => {
    if (hydrated) return

    try {
      const raw = localStorage.getItem(key)
      if (!raw) {
        setHydrated(true)
        return
      }

      const saved = JSON.parse(raw) as PanelPrefsShape

      const restoredYears = Array.isArray(saved.selectedYears)
        ? saved.selectedYears.filter((year) => actualYears.includes(year)).sort((a, b) => Number(b) - Number(a))
        : []

      const result: PanelPrefsShape = {}

      if (restoredYears.length) {
        result.selectedYears = restoredYears
      } else if (defaultYearSelection.length) {
        result.selectedYears = defaultYearSelection
      }

      if (Array.isArray(saved.selectedSports) && saved.selectedSports.length) {
        result.selectedSports = Array.from(new Set(saved.selectedSports.map(String).filter(Boolean)))
      }

      const validWindowModes: WindowMode[] = ['year', 'month', 'week', 'rolling28']
      if (typeof saved.windowMode === 'string' && validWindowModes.includes(saved.windowMode)) {
        result.windowMode = saved.windowMode
      }

      if (typeof saved.selectedMonthKey === 'string') {
        result.selectedMonthKey = saved.selectedMonthKey
      }

      if (typeof saved.selectedWeekKey === 'string') {
        result.selectedWeekKey = saved.selectedWeekKey
      }

      if (saved.previewMode === 'admin' || saved.previewMode === 'athlete') {
        result.previewMode = saved.previewMode
      }

      setInitial(result)
    } catch {
      // Prefer defaults when persistence is invalid.
    } finally {
      setHydrated(true)
    }
  }, [actualYears, defaultYearSelection, hydrated, key])

  // Persist current values back to localStorage
  useEffect(() => {
    if (!hydrated) return

    try {
      localStorage.setItem(key, JSON.stringify(currentValues))
    } catch {
      // Ignore browser storage failures.
    }
  }, [hydrated, key, currentValues])

  return { hydrated, initial }
}
