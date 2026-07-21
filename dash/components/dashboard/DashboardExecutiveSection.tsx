import type { DashboardSlices } from './analytics'
import { AnalysisSpotlight, AnalysisTile, MetricCard, SectionLead } from './ui'
import { fmt, getSportLabel } from './helpers'

type DashboardStats = NonNullable<DashboardSlices['stats']>

type Props = {
  stats: DashboardStats | null
  routineConsistency: DashboardSlices['routineConsistency']
  activeWindowTitle: string
  focusLabel: string
  activeAccent: string
}

export function DashboardExecutiveSection({ stats, routineConsistency, activeWindowTitle, focusLabel, activeAccent }: Props) {
  if (!stats) return null

  return (
    <>
      <SectionLead
        id="resumo"
        eyebrow="Resumo executivo"
        title="Primeira leitura do recorte ativo"
        subtitle="Aqui entram os numeros de topo. Eles resumem a janela filtrada antes de abrir a analise detalhada."
      />
      <section className="kpi-grid">
        <MetricCard label="Sessoes ativas" value={String(stats.count)} sub={`${activeWindowTitle} | ${focusLabel}`} accent={activeAccent} />
        <MetricCard label="Distancia" value={`${fmt.dist(stats.totalDist)} km`} sub="volume no recorte ativo" accent={activeAccent} />
        <MetricCard label="Tempo ativo" value={fmt.dur(stats.totalDur)} sub="movimento no recorte ativo" accent={activeAccent} />
        <MetricCard
          label={stats.mode === 'speed' ? 'Velocidade media' : stats.mode === 'mixed' ? 'Peso da corrida' : 'Pace medio'}
          value={stats.mode === 'speed' ? `${stats.avgSpeed.toFixed(1)} km/h` : stats.mode === 'mixed' ? `${stats.shareRun}%` : fmt.pace(stats.avgPace)}
          sub={stats.mode === 'mixed' ? 'participacao das sessoes de corrida' : stats.mode === 'speed' ? 'media da janela ativa' : 'ritmo agregado por tempo e distancia'}
          accent={activeAccent}
        />
        <MetricCard label="Maior sessao" value={`${fmt.dist(stats.longest.distanceKm)} km`} sub={fmt.fullDate(stats.longest.date)} accent={activeAccent} />
        <MetricCard
          label={stats.mode === 'speed' ? 'Pico de velocidade' : stats.mode === 'mixed' ? 'Esporte dominante' : 'Melhor pace médio de atividade'}
          value={stats.mode === 'speed' ? fmt.speed(stats.fastestSpeed.distanceKm, stats.fastestSpeed.durationSec) : stats.mode === 'mixed' ? getSportLabel(stats.dominantSport?.[0] ?? 'Run') : fmt.pace(stats.fastest?.paceSec ?? null)}
          sub={stats.mode === 'mixed' ? `${stats.dominantSport?.[1] ?? 0} sessoes` : stats.mode === 'speed' ? fmt.fullDate(stats.fastestSpeed.date) : stats.fastest ? fmt.fullDate(stats.fastest.date) : 'sem dados'}
          accent={activeAccent}
        />
      </section>
      {routineConsistency && (
        <section className="panel executive-routine-panel">
          <div className="panel-header compact">
            <div>
              <p className="panel-eyebrow">Rotina</p>
              <h3>Consistencia da rotina</h3>
            </div>
            <span className="panel-subtitle">Leitura de frequencia e continuidade do recorte, sem depender de zona ou modelo externo.</span>
          </div>
          <div className="analysis-grid analysis-grid-compact">
            <AnalysisTile label="Dias ativos / semana" value={routineConsistency.activeDaysPerWeekLabel} meta={`${routineConsistency.activeDays} dias ativos em ${routineConsistency.trackedWeeks} semanas uteis`} />
            <AnalysisTile label="Sequencia atual" value={`${routineConsistency.currentStreakDays}d`} meta={routineConsistency.currentStreakDays >= 4 ? 'ritmo recente sustentado' : 'sequencia ainda curta'} />
            <AnalysisTile label="Maior sequencia" value={`${routineConsistency.longestStreakDays}d`} meta="melhor embalo dentro do recorte" />
            <AnalysisTile label="Semanas firmes" value={`${routineConsistency.solidWeeks}/${routineConsistency.trackedWeeks}`} meta="semanas com 3+ dias ativos" />
          </div>
          <AnalysisSpotlight
            eyebrow="Leitura automatica"
            title={routineConsistency.title}
            copy={routineConsistency.copy}
            badge={routineConsistency.status === 'alto' ? 'ROTINA FIRME' : routineConsistency.status === 'baixo' ? 'PEDINDO RETOMADA' : 'RITMO ESTAVEL'}
          />
        </section>
      )}
    </>
  )
}

