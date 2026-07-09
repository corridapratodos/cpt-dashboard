import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ActivityYearAnalytics } from '@/lib/analytics-types'

type Params = {
  initialAnalytics: ActivityYearAnalytics | null
  initialYear: string
  selectedYears: string[]
  analyticsCacheKeyPrefix: string
}

export function useYearAnalytics({
  initialAnalytics,
  initialYear,
  selectedYears,
  analyticsCacheKeyPrefix,
}: Params) {
  const [yearAnalytics, setYearAnalytics] = useState<Record<string, ActivityYearAnalytics>>(
    initialAnalytics && initialYear !== 'all' ? { [initialYear]: initialAnalytics } : {}
  )
  const [partialAnalyticsYears, setPartialAnalyticsYears] = useState<Record<string, boolean>>(
    initialAnalytics && initialYear !== 'all' ? { [initialYear]: false } : {}
  )
  const [loadingAnalyticsYears, setLoadingAnalyticsYears] = useState<string[]>([])
  const [loadError, setLoadError] = useState('')

  const markYearsDirty = useCallback((years: string[]) => {
    setPartialAnalyticsYears((current) => {
      const next = { ...current }
      for (const year of years) next[year] = true
      return next
    })
  }, [])

  useEffect(() => {
    if (!selectedYears.length) return

    let active = true
    const yearsToLoad = selectedYears.filter((year) => !yearAnalytics[year] || partialAnalyticsYears[year])

    if (!yearsToLoad.length) return

    async function loadAnalyticsYears() {
      setLoadingAnalyticsYears(yearsToLoad)
      setLoadError('')

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
        setLoadError(error instanceof Error ? error.message : 'Nao foi possivel carregar os agregados analiticos.')
      } finally {
        if (active) setLoadingAnalyticsYears([])
      }
    }

    void loadAnalyticsYears()

    return () => {
      active = false
    }
  }, [analyticsCacheKeyPrefix, partialAnalyticsYears, selectedYears, yearAnalytics])

  return {
    yearAnalytics,
    loadingAnalyticsYears,
    loadError,
    markYearsDirty,
  }
}
