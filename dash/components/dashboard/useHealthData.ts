import { useEffect, useState } from 'react'
import type { SleepRecord, WeightRecord } from './types'

type Params = {
  isAdmin: boolean
  actualYears: string[]
  selectedYears: string[]
}

export function useHealthData({ isAdmin, actualYears, selectedYears }: Params) {
  const [sleepData, setSleepData] = useState<SleepRecord[]>([])
  const [weightData, setWeightData] = useState<WeightRecord[]>([])

  useEffect(() => {
    if (!isAdmin) return
    const years = selectedYears.length ? selectedYears : actualYears
    if (!years.length) return

    const from = `${Math.min(...years.map(Number))}-01-01`
    const to = `${Math.max(...years.map(Number))}-12-31`

    fetch(`/api/health?from=${from}&to=${to}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data) return
        setSleepData(data.sleep ?? [])
        setWeightData(data.weight ?? [])
      })
      .catch(() => {})
  }, [actualYears, isAdmin, selectedYears])

  return {
    sleepData,
    weightData,
  }
}