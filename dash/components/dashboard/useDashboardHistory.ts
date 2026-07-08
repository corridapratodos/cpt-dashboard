import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useState } from 'react'
import type { Activity } from './types'

type UseDashboardHistoryOptions = {
  initialActivities: Activity[]
  page: number
  setPage: Dispatch<SetStateAction<number>>
  pageSize: number
  historyCacheKeyPrefix: string
  selectedYears: string[]
  selectedSports: string[]
  allSportsSelected: boolean
  activeWindowStart: Date | null
  activeWindowEnd: Date | null
  loadingAnalytics: boolean
  setSyncMsg: (msg: string) => void
}

export function useDashboardHistory({
  initialActivities,
  page,
  setPage,
  pageSize,
  historyCacheKeyPrefix,
  selectedYears,
  selectedSports,
  allSportsSelected,
  activeWindowStart,
  activeWindowEnd,
  loadingAnalytics,
  setSyncMsg,
}: UseDashboardHistoryOptions) {
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyActivities, setHistoryActivities] = useState<Activity[]>(initialActivities.slice(0, pageSize))
  const [historyCount, setHistoryCount] = useState(0)
  const [historyPageCount, setHistoryPageCount] = useState(1)

  useEffect(() => {
    if (!selectedYears.length || loadingAnalytics) return

    let active = true

    async function loadHistoryPage() {
      setHistoryLoading(true)

      try {
        const params = new URLSearchParams()
        params.set('years', selectedYears.join(','))
        params.set('page', String(page))
        params.set('pageSize', String(pageSize))

        if (!allSportsSelected && selectedSports.length) {
          params.set('sports', selectedSports.join(','))
        }

        if (activeWindowStart) {
          params.set('start', activeWindowStart.toISOString().slice(0, 10))
        }

        if (activeWindowEnd) {
          params.set('end', activeWindowEnd.toISOString().slice(0, 10))
        }

        const historyCacheKey = `${historyCacheKeyPrefix}:${params.toString()}`

        try {
          const cached = sessionStorage.getItem(historyCacheKey)
          if (cached) {
            const parsed = JSON.parse(cached) as { activities?: Activity[]; count?: number; pageCount?: number }
            if (!active) return
            setHistoryActivities((parsed.activities ?? []) as Activity[])
            setHistoryCount(Number(parsed.count ?? 0))
            setHistoryPageCount(Number(parsed.pageCount ?? 1))
            return
          }
        } catch {}

        const res = await fetch(`/api/activities/history?${params.toString()}`)
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data?.error ?? 'Nao foi possivel carregar o historico paginado.')
        }

        try {
          sessionStorage.setItem(
            historyCacheKey,
            JSON.stringify({
              activities: data.activities ?? [],
              count: Number(data.count ?? 0),
              pageCount: Number(data.pageCount ?? 1),
            }),
          )
        } catch {}

        if (!active) return
        setHistoryActivities((data.activities ?? []) as Activity[])
        setHistoryCount(Number(data.count ?? 0))
        setHistoryPageCount(Number(data.pageCount ?? 1))
      } catch (error) {
        if (!active) return
        setSyncMsg(error instanceof Error ? error.message : 'Nao foi possivel carregar o historico paginado.')
      } finally {
        if (active) setHistoryLoading(false)
      }
    }

    void loadHistoryPage()

    return () => {
      active = false
    }
  }, [
    activeWindowEnd,
    activeWindowStart,
    allSportsSelected,
    historyCacheKeyPrefix,
    loadingAnalytics,
    page,
    pageSize,
    selectedSports,
    selectedYears,
    setSyncMsg,
  ])

  const replaceActivity = useCallback((updated: Activity) => {
    setHistoryActivities((current) =>
      current.map((activity) => (activity.stravaId === updated.stravaId ? updated : activity)),
    )
  }, [])

  return {
    page,
    setPage,
    historyLoading,
    historyActivities,
    historyCount,
    historyPageCount,
    replaceActivity,
  }
}
