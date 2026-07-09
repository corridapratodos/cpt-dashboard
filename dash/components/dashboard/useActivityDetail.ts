import { useCallback, useEffect, useState } from 'react'
import type { Activity, ActivityDetailPayload, ActivityInterpretation, ActivitySplit } from './types'

type ActivityDetailState = {
  selectedActivity: Activity | null
  splits: ActivitySplit[]
  interpretation: ActivityInterpretation | null
  loading: boolean
  error: string
  reviewing: boolean
}

type ActivityDetailActions = {
  toggleExclusion: (excludedFromMetrics: boolean) => void
}

type OnActivityUpdated = (updated: Activity) => void

type UseActivityDetailParams = {
  activity: Activity | null
  canViewSplits: boolean
  onActivityUpdated: OnActivityUpdated
  setSyncMsg: (msg: string) => void
}

export function useActivityDetail({
  activity,
  canViewSplits,
  onActivityUpdated,
  setSyncMsg,
}: UseActivityDetailParams): ActivityDetailState & ActivityDetailActions {
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(activity)
  const [splits, setSplits] = useState<ActivitySplit[]>([])
  const [interpretation, setInterpretation] = useState<ActivityInterpretation | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reviewing, setReviewing] = useState(false)

  useEffect(() => {
    setSelectedActivity(activity)
  }, [activity])

  useEffect(() => {
    if (!selectedActivity) {
      setSplits([])
      setInterpretation(null)
      setError('')
      setLoading(false)
      return
    }

    if (!canViewSplits) {
      setSplits([])
      setInterpretation(null)
      setError('')
      setLoading(false)
      return
    }

    const activityId = selectedActivity.stravaId
    let active = true
    setLoading(true)
    setError('')
    setSplits([])
    setInterpretation(null)

    async function loadActivityDetail() {
      try {
        const res = await fetch(`/api/activities/${activityId}`)
        const data = (await res.json()) as ActivityDetailPayload & { error?: string }
        if (!res.ok) {
          throw new Error(data?.error ?? 'Nao foi possivel carregar o detalhe da atividade.')
        }

        if (!active) return
        if (data.splitsAccess === false) {
          setSplits([])
          setInterpretation(null)
          return
        }
        setSplits(Array.isArray(data.splits) ? data.splits : [])
        setInterpretation(data.interpretation ?? null)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Nao foi possivel carregar o detalhe da atividade.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadActivityDetail()

    return () => {
      active = false
    }
  }, [canViewSplits, selectedActivity])

  const toggleExclusion = useCallback(
    async (excludedFromMetrics: boolean) => {
      if (!selectedActivity) return

      setReviewing(true)
      setSyncMsg('')

      try {
        const res = await fetch(`/api/activities/${selectedActivity.stravaId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ excludedFromMetrics }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? 'Nao foi possivel atualizar a atividade.')

        const updated = data.activity as Activity
        setSelectedActivity((current) => (current?.stravaId === updated.stravaId ? updated : current))
        onActivityUpdated(updated)
      } catch (err) {
        setSyncMsg(err instanceof Error ? err.message : 'Nao foi possivel atualizar a atividade.')
      } finally {
        setReviewing(false)
      }
    },
    [onActivityUpdated, selectedActivity, setSyncMsg],
  )

  return {
    selectedActivity,
    splits,
    interpretation,
    loading,
    error,
    reviewing,
    toggleExclusion,
  }
}
