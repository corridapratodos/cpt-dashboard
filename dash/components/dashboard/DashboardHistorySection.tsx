import type { Activity } from './types'
import { fmt, getDisplayName, getSportLabel, sportMeta } from './helpers'
import { DetailItem, Panel, SectionLead } from './ui'

type Props = {
  historyCount: number
  historyLoading: boolean
  visibleActivities: Activity[]
  historyPage: number
  pageCount: number
  onPreviousPage: () => void
  onNextPage: () => void
  onSelectActivity: (activity: Activity) => void
}

export function DashboardHistorySection({
  historyCount,
  historyLoading,
  visibleActivities,
  historyPage,
  pageCount,
  onPreviousPage,
  onNextPage,
  onSelectActivity,
}: Props) {
  return (
    <>
      <SectionLead
        id="historico"
        eyebrow="Dado bruto"
        title="Historico navegavel do recorte"
        subtitle="Aqui ficam os registros individuais. Eles explicam os KPIs, mas nao devem ser a primeira camada de leitura."
      />
      <section className="table-panel panel">
        <div className="panel-header">
          <div>
            <p className="panel-eyebrow">Historico filtrado</p>
            <h3>Atividades recentes</h3>
          </div>
          <span className="pill pill-ghost">{historyCount} itens na janela ativa</span>
        </div>

        {historyLoading && !visibleActivities.length && <p className="sync-message">Carregando historico...</p>}

        <div className="mobile-activity-list">
          {visibleActivities.map((activity) => {
            const speed = activity.durationSec > 0 ? activity.distanceKm / (activity.durationSec / 3600) : 0
            return (
              <article key={`mobile-${activity.stravaId}`} className="mobile-activity-card">
                <div className="mobile-activity-top">
                  <span className="sport-tag" style={{ background: sportMeta[activity.type]?.chip ?? 'var(--chip-neutral)' }}>
                    {getSportLabel(activity.type)}
                  </span>
                  <span>{fmt.date(activity.date)}</span>
                </div>
                <div className="mobile-activity-title">
                  <strong>{getDisplayName(activity.name)}</strong>
                  {activity.excludedFromMetrics && <span className="analysis-badge">Ignorada</span>}
                </div>
                <div className="mobile-activity-metrics">
                  <DetailItem label="Distancia" value={`${fmt.dist(activity.distanceKm)} km`} />
                  <DetailItem label="Tempo" value={fmt.dur(activity.durationSec)} />
                  <DetailItem
                    label={activity.type === 'Ride' ? 'Velocidade' : 'Pace'}
                    value={activity.type === 'Ride' ? `${speed.toFixed(1)} km/h` : `${fmt.pace(activity.paceSec)}/km`}
                  />
                  <DetailItem label="FC media" value={activity.hrAvg ? `${Math.round(activity.hrAvg)} bpm` : '-'} />
                </div>
                <div className="mobile-activity-actions">
                  <button type="button" className="btn btn-ghost btn-inline" onClick={() => onSelectActivity(activity)}>
                    Ver detalhe
                  </button>
                </div>
              </article>
            )
          })}
        </div>

        <div className="table-wrap">
          <table className="activity-table">
            <thead>
              <tr>
                {['Data', 'Tipo', 'Sessao', 'Distancia', 'Tempo', 'Ritmo/Vel.', 'FC media', 'Altimetria', 'Detalhe'].map((header) => <th key={header}>{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {!visibleActivities.length && !historyLoading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Nenhuma atividade encontrada nesta pagina.</td>
                </tr>
              ) : visibleActivities.map((activity) => {
                const speed = activity.durationSec > 0 ? activity.distanceKm / (activity.durationSec / 3600) : 0
                return (
                  <tr key={activity.stravaId}>
                    <td>{fmt.date(activity.date)}</td>
                    <td><span className="sport-tag" style={{ background: sportMeta[activity.type]?.chip ?? 'var(--chip-neutral)' }}>{getSportLabel(activity.type)}</span></td>
                    <td className="truncate-cell">
                      <div className="activity-name-cell">
                        <span>{getDisplayName(activity.name)}</span>
                        {activity.excludedFromMetrics && <span className="analysis-badge">Ignorada</span>}
                      </div>
                    </td>
                    <td>{fmt.dist(activity.distanceKm)} km</td>
                    <td>{fmt.dur(activity.durationSec)}</td>
                    <td className="metric-emphasis">{activity.type === 'Ride' ? `${speed.toFixed(1)} km/h` : `${fmt.pace(activity.paceSec)}/km`}</td>
                    <td>{activity.hrAvg ? `${Math.round(activity.hrAvg)} bpm` : '-'}</td>
                    <td>{activity.elevationGain > 0 ? `${Math.round(activity.elevationGain)} m` : '-'}</td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-inline" onClick={() => onSelectActivity(activity)}>
                        Ver
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="table-actions table-actions-spread">
          <button type="button" className="btn btn-ghost" disabled={historyPage <= 1} onClick={onPreviousPage}>
            Pagina anterior
          </button>
          <span className="pill pill-ghost">Pagina {historyPage} de {pageCount}</span>
          <button type="button" className="btn btn-ghost" disabled={historyPage >= pageCount} onClick={onNextPage}>
            Proxima pagina
          </button>
        </div>
      </section>
    </>
  )
}
