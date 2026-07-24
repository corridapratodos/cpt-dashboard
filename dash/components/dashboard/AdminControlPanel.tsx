import { useState } from 'react'

type AdminControlPanelProps = {
  loadingLabel: string
  syncMsg: string
  syncing: boolean
  deleting: boolean
  backfilling: boolean
  loadingYears: number
  backfillTargetYear: string | null
  onFullSync: () => void
  onBackfill: () => void
  onHealthUploadComplete: () => void
}

export function AdminControlPanel({
  loadingLabel,
  syncMsg,
  syncing,
  deleting,
  backfilling,
  loadingYears,
  backfillTargetYear,
  onFullSync,
  onBackfill,
  onHealthUploadComplete,
}: AdminControlPanelProps) {
  const [uploadingHealth, setUploadingHealth] = useState(false)
  const [healthUploadMsg, setHealthUploadMsg] = useState('')
  const busy = syncing || deleting || backfilling || loadingYears > 0

  return (
    <div id="admin" className="control-panel">
      <div className="admin-tools">
        <div>
          <p className="control-label">Ferramentas de administrador</p>
          <strong>Reconstrucao completa protegida por cooldown</strong>
          <span className="panel-subtitle">
            Best efforts: {backfillTargetYear ? `ano selecionado ${backfillTargetYear}` : 'fila recente'}
          </span>
        </div>
        <div className="admin-actions-row">
          <button onClick={onFullSync} disabled={busy} className="btn btn-outline" type="button">
            Full sync
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={busy}
            onClick={onBackfill}
          >
            {backfilling ? 'Buscando best efforts...' : backfillTargetYear ? `Backfill best efforts ${backfillTargetYear}` : 'Backfill best efforts recentes'}
          </button>
        </div>
      </div>

      <div className="admin-tools" style={{ marginTop: '1rem' }}>
        <div>
          <p className="control-label">Dados de saude</p>
          <strong>Upload de sono, peso e VO2 max (Garmin CSV)</strong>
        </div>
        <div className="admin-actions-row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
            {uploadingHealth ? 'Enviando...' : 'Selecionar arquivos CSV'}
            <input
              type="file"
              accept=".csv"
              multiple
              style={{ display: 'none' }}
              disabled={uploadingHealth}
              onChange={async (e) => {
                const files = e.target.files
                if (!files?.length) return
                setUploadingHealth(true)
                setHealthUploadMsg('')
                const form = new FormData()
                for (const file of Array.from(files)) form.append('files', file)
                try {
                  const res = await fetch('/api/admin/upload-health', { method: 'POST', body: form })
                  const data = await res.json()
                  if (!res.ok) throw new Error(data?.error ?? 'Erro no upload')
                  const parts: string[] = []
                  if (data.sleepSaved) parts.push(`${data.sleepSaved} registros de sono`)
                  if (data.weightSaved) parts.push(`${data.weightSaved} registros de peso`)
                  if (data.vo2MaxSaved) parts.push(`${data.vo2MaxSaved} registros de VO2 max`)
                  if (data.skipped) parts.push(`${data.skipped} linhas ignoradas`)
                  if (data.errors?.length) parts.push(data.errors.join('; '))
                  setHealthUploadMsg(parts.length ? parts.join(' | ') : 'Nenhum dado importado.')
                  if (data.sleepSaved || data.weightSaved || data.vo2MaxSaved) onHealthUploadComplete()
                } catch (error) {
                  setHealthUploadMsg(error instanceof Error ? error.message : 'Erro no upload')
                } finally {
                  setUploadingHealth(false)
                  e.target.value = ''
                }
              }}
            />
          </label>
          {healthUploadMsg && <span className="sync-message" style={{ margin: 0 }}>{healthUploadMsg}</span>}
        </div>
      </div>

      {loadingLabel && <p className="sync-message">{loadingLabel}</p>}
      {syncMsg && <p className="sync-message">{syncMsg}</p>}
    </div>
  )
}
