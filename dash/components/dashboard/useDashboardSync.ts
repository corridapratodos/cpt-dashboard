import { useState } from 'react'
import type { SyncMode } from './types'

type SyncAlert = {
  title: string
  message: string
}

type UseDashboardSyncOptions = {
  selectedYears: string[]
  onYearsDirty: (years: string[]) => void
  onCacheBump: () => void
  onPageReset: () => void
}

export function useDashboardSync({
  selectedYears,
  onYearsDirty,
  onCacheBump,
  onPageReset,
}: UseDashboardSyncOptions) {
  const [syncing, setSyncing] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [blockingAlert, setBlockingAlert] = useState<SyncAlert | null>(null)

  const clearBlockingAlert = () => setBlockingAlert(null)

  const handleSync = async (mode: SyncMode = 'incremental') => {
    if (mode === 'full') {
      const confirmed = window.confirm('Reconstruir o historico vai reprocessar toda a base do atleta. Deseja continuar?')
      if (!confirmed) return
    }

    setSyncing(true)
    setSyncMsg('')
    setBlockingAlert(null)

    try {
      const res = await fetch(`/api/strava/sync?mode=${mode}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Erro ao sincronizar')

      const modeLabel = data.mode === 'incremental' ? 'incremental' : 'completo'
      const processedLabel = data.processed && data.processed !== data.synced
        ? `, ${data.processed} processadas`
        : ''

      setSyncMsg(`${data.synced} atividades novas sincronizadas (${modeLabel}${processedLabel})`)

      const rebuiltYears = Array.isArray(data.cacheYearsRebuilt) && data.cacheYearsRebuilt.length
        ? data.cacheYearsRebuilt.map(String)
        : selectedYears

      onYearsDirty(rebuiltYears)
      onCacheBump()
      onPageReset()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao sincronizar'
      setSyncMsg(message)
      setBlockingAlert({ title: 'Sincronizacao nao concluida', message })
    } finally {
      setSyncing(false)
    }
  }

  const handleBackfillBestEfforts = async () => {
    setBackfilling(true)
    setSyncMsg('')

    try {
      const res = await fetch('/api/admin/backfill-efforts', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Erro no backfill')

      setSyncMsg(`Best efforts: ${data.enriched} enriquecidas de ${data.processed} processadas. Restam ${data.remaining}.`)

      if (data.enriched > 0) {
        onYearsDirty(selectedYears)
        onCacheBump()
      }
    } catch (error) {
      setSyncMsg(error instanceof Error ? error.message : 'Erro no backfill')
    } finally {
      setBackfilling(false)
    }
  }

  return {
    syncing,
    backfilling,
    syncMsg,
    setSyncMsg,
    blockingAlert,
    clearBlockingAlert,
    handleSync,
    handleBackfillBestEfforts,
  }
}
