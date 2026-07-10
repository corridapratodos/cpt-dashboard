'use client'

import { useMemo, useState } from 'react'
import type { DashboardAiPayload, DashboardAiReading } from '@/lib/dashboard-ai'
import { AnalysisSpotlight } from './ui'

type Props = {
  payload: DashboardAiPayload
}

export function DashboardAiReadingCard({ payload }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reading, setReading] = useState<DashboardAiReading | null>(null)

  const disabled = useMemo(() => !payload.stats, [payload.stats])

  async function handleGenerate() {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/ai/dashboard-reading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error ?? 'Nao foi possivel gerar a leitura com IA.')
      }

      setReading(data.reading as DashboardAiReading)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nao foi possivel gerar a leitura com IA.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="dashboard-ai-card">
      <div className="panel-header compact">
        <div>
          <p className="panel-eyebrow">IA beta</p>
          <h3>Leitura assistida do recorte</h3>
          <p className="panel-sub">Usa o resumo estruturado do dashboard para gerar uma leitura curta no proprio painel.</p>
        </div>
        <button type="button" className="btn btn-outline" disabled={loading || disabled} onClick={handleGenerate}>
          {loading ? 'Gerando...' : reading ? 'Gerar de novo' : 'Gerar leitura'}
        </button>
      </div>

      {!reading && !error && (
        <p className="empty-copy">
          A ideia aqui nao e substituir o dashboard, e sim somar uma leitura integrada em cima do proprio recorte atual, sem pedir que a pessoa copie tudo para fora.
        </p>
      )}

      {error && <p className="sync-message" style={{ marginTop: 0 }}>{error}</p>}

      {reading && (
        <AnalysisSpotlight eyebrow="Leitura com IA" title={reading.title} copy={reading.summary} badge="BETA">
          <div className="analysis-spotlight-list">
            {reading.bullets.map((item) => (
              <article key={item} className="analysis-spotlight-note">
                <p>{item}</p>
              </article>
            ))}
            {reading.caution && (
              <article className="analysis-spotlight-note">
                <strong>Ponto de atencao</strong>
                <p>{reading.caution}</p>
              </article>
            )}
          </div>
          <p className="analysis-ai-footnote">Modelo usado: {reading.model}.</p>
        </AnalysisSpotlight>
      )}
    </div>
  )
}
