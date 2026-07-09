import type { Activity, ActivityInterpretation, ActivitySplit } from './types'
import { DetailItem } from './ui'
import { fmt, getDisplayName, getSportLabel } from './helpers'

type ActivityDetailModalProps = {
  activity: Activity
  splits: ActivitySplit[]
  interpretation: ActivityInterpretation | null
  splitsLoading: boolean
  splitsError: string
  canViewSplits: boolean
  reviewing: boolean
  onClose: () => void
  onToggleExclusion: (excludedFromMetrics: boolean) => void
}

export function ActivityDetailModal({
  activity,
  splits,
  interpretation,
  splitsLoading,
  splitsError,
  canViewSplits,
  reviewing,
  onClose,
  onToggleExclusion,
}: ActivityDetailModalProps) {
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header compact">
          <div>
            <p className="panel-eyebrow">Detalhe da atividade</p>
            <div className="modal-title-row">
              <h3>{getDisplayName(activity.name)}</h3>
              {activity.excludedFromMetrics && <span className="analysis-badge">Ignorada nas analises</span>}
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-inline" onClick={onClose}>Fechar</button>
        </div>
        <div className="detail-grid">
          <DetailItem label="Data" value={fmt.fullDate(activity.date)} />
          <DetailItem label="Tipo" value={getSportLabel(activity.type)} />
          <DetailItem label="Distancia" value={`${fmt.dist(activity.distanceKm)} km`} />
          <DetailItem label="Tempo" value={fmt.dur(activity.durationSec)} />
          <DetailItem label="Pace" value={activity.type === 'Ride' ? fmt.speed(activity.distanceKm, activity.durationSec) : `${fmt.pace(activity.paceSec)}/km`} />
          <DetailItem label="Elevacao" value={activity.elevationGain ? `${Math.round(activity.elevationGain)} m` : '-'} />
          <DetailItem label="FC media" value={activity.hrAvg != null ? `${Math.round(activity.hrAvg)} bpm` : '-'} />
          <DetailItem label="FC maxima" value={activity.hrMax != null ? `${Math.round(activity.hrMax)} bpm` : '-'} />
          <DetailItem label="Kudos" value={String(activity.kudos ?? 0)} />
          <DetailItem label="Strava ID" value={String(activity.stravaId)} />
          <DetailItem label="Analise" value={activity.excludedFromMetrics ? 'Ignorada nas analises' : 'Ativa nas analises'} />
        </div>
        {interpretation && (
          <div className="activity-interpretation-panel">
            <div className="panel-header compact">
              <div>
                <p className="panel-eyebrow">Leitura do treino</p>
                <h3>{interpretation.title}</h3>
              </div>
              <span className="panel-subtitle">Resumo automatico por regras do proprio bloco, sem chute de contexto externo.</span>
            </div>
            <p className="activity-interpretation-summary">{interpretation.summary}</p>
            <div className="activity-interpretation-list">
              {interpretation.callouts.map((item) => <p key={item} className="activity-interpretation-item">{item}</p>)}
            </div>
          </div>
        )}
        <div className="activity-splits-panel">
          <div className="panel-header compact">
            <div>
              <p className="panel-eyebrow">Parciais</p>
              <h3>Km a km</h3>
            </div>
            <span className="panel-subtitle">
              {canViewSplits ? 'Detalhe consultado uma vez e reaproveitado da base.' : 'Disponivel apenas para contas pro e master.'}
            </span>
          </div>
          {!canViewSplits && (
            <p className="sync-message" style={{ marginTop: 0 }}>
              As parciais km a km ficam restritas a contas pro e master para controlar custo e leitura detalhada.
            </p>
          )}
          {canViewSplits && splitsLoading && <p className="sync-message" style={{ marginTop: 0 }}>Carregando parciais...</p>}
          {canViewSplits && !splitsLoading && splitsError && <p className="sync-message" style={{ marginTop: 0 }}>{splitsError}</p>}
          {canViewSplits && !splitsLoading && !splitsError && !splits.length && (
            <p className="sync-message" style={{ marginTop: 0 }}>O Strava nao retornou parciais metricas para esta atividade.</p>
          )}
          {canViewSplits && !splitsLoading && !splitsError && splits.length > 0 && (
            <div className="activity-splits-table-wrap">
              <table className="activity-splits-table">
                <thead>
                  <tr>
                    <th>Km</th>
                    <th>Tempo</th>
                    <th>Pace</th>
                    <th>FC</th>
                    <th>Elev.</th>
                  </tr>
                </thead>
                <tbody>
                  {splits.map((split) => (
                    <tr key={`${activity.stravaId}-${split.index}`}>
                      <td>{split.index}</td>
                      <td>{fmt.clock(split.movingSec ?? split.elapsedSec)}</td>
                      <td>{split.paceSec != null ? `${fmt.pace(split.paceSec)}/km` : '-'}</td>
                      <td>{split.hrAvg != null ? `${Math.round(split.hrAvg)} bpm` : '-'}</td>
                      <td>{split.elevationGain != null ? `${Math.round(split.elevationGain)} m` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-actions-row">
          <button
            type="button"
            className={`btn ${activity.excludedFromMetrics ? 'btn-ghost' : 'btn-outline'}`}
            disabled={reviewing}
            onClick={() => onToggleExclusion(!activity.excludedFromMetrics)}
          >
            {reviewing
              ? 'Atualizando...'
              : activity.excludedFromMetrics
                ? 'Reativar nas analises'
                : 'Ignorar nas analises'}
          </button>
        </div>
      </div>
    </div>
  )
}
