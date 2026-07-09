import { useCallback, useEffect, useMemo } from 'react'
import type { WindowMode, WindowOption } from './analytics'

type UseDashboardPeriodNavigationParams = {
  windowMode: WindowMode
  monthOptions: WindowOption[]
  weekOptions: WindowOption[]
  selectedMonthKey: string
  selectedWeekKey: string
  setSelectedMonthKey: (key: string) => void
  setSelectedWeekKey: (key: string) => void
}

export function useDashboardPeriodNavigation({
  windowMode,
  monthOptions,
  weekOptions,
  selectedMonthKey,
  selectedWeekKey,
  setSelectedMonthKey,
  setSelectedWeekKey,
}: UseDashboardPeriodNavigationParams) {
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

  const hasPeriodNavigation = windowMode === 'month' || windowMode === 'week'

  const activePeriodOptions = useMemo(
    () => (windowMode === 'month' ? monthOptions : windowMode === 'week' ? weekOptions : []),
    [monthOptions, weekOptions, windowMode],
  )

  const activePeriodKey = windowMode === 'month' ? selectedMonthKey : selectedWeekKey
  const activePeriodIndex = activePeriodOptions.findIndex((option) => option.key === activePeriodKey)
  const canGoToNewerPeriod = activePeriodIndex > 0
  const canGoToOlderPeriod = activePeriodIndex >= 0 && activePeriodIndex < activePeriodOptions.length - 1

  const shiftActivePeriod = useCallback(
    (direction: 'newer' | 'older') => {
      if (!hasPeriodNavigation || activePeriodIndex === -1) return

      const nextIndex = direction === 'newer' ? activePeriodIndex - 1 : activePeriodIndex + 1
      const nextOption = activePeriodOptions[nextIndex]
      if (!nextOption) return

      if (windowMode === 'month') {
        setSelectedMonthKey(nextOption.key)
        return
      }

      setSelectedWeekKey(nextOption.key)
    },
    [activePeriodIndex, activePeriodOptions, hasPeriodNavigation, setSelectedMonthKey, setSelectedWeekKey, windowMode],
  )

  const handlePeriodKeyChange = useCallback(
    (key: string) => {
      if (windowMode === 'month') {
        setSelectedMonthKey(key)
        return
      }

      setSelectedWeekKey(key)
    },
    [setSelectedMonthKey, setSelectedWeekKey, windowMode],
  )

  return {
    hasPeriodNavigation,
    activePeriodOptions,
    activePeriodKey,
    activePeriodIndex,
    canGoToNewerPeriod,
    canGoToOlderPeriod,
    shiftActivePeriod,
    handlePeriodKeyChange,
  }
}
