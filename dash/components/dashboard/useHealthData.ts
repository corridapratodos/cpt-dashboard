import { useEffect, useState } from 'react'
import type { SleepRecord, Vo2MaxRecord, WeightRecord } from './types'

type Params = {
  isAdmin: boolean
  actualYears: string[]
  selectedYears: string[]
  refreshKey: number
}

export function useHealthData({ isAdmin, actualYears, selectedYears, refreshKey }: Params) {
  const [sleepData, setSleepData] = useState<SleepRecord[]>([])
  const [weightData, setWeightData] = useState<WeightRecord[]>([])
  const [vo2MaxData, setVo2MaxData] = useState<Vo2MaxRecord[]>([])

  useEffect(() => {
    if (!isAdmin) return
    const years = selectedYears.length ? selectedYears : actualYears
    if (!years.length) return

    const from = `${Math.min(...years.map(Number))}-01-01`
    const to = `${Math.max(...years.map(Number))}-12-31`

    fetch(`/api/health?from=${from}&to=${to}&refresh=${refreshKey}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data) return
        setSleepData(data.sleep ?? [])
        setWeightData(data.weight ?? [])
        setVo2MaxData(data.vo2Max ?? [])
      })
      .catch(() => {})
  }, [actualYears, isAdmin, refreshKey, selectedYears])

  return {
    sleepData,
    weightData,
    vo2MaxData,
  }
}