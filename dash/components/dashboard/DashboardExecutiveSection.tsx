import type { DashboardSlices } from './analytics'
import { fmt, getSportLabel } from './helpers'
import { MetricCard, SectionLead } from './ui'

type DashboardStats = NonNullable<DashboardSlices['stats']>

type Props = {
  stats: DashboardStats | null
  activeWindowTitle: string
  focusLabel: string
  activeAccent: string
}

export function DashboardExecutiveSection({ stats, activeWindowTitle, focusLabel, activeAccent }: Props) {
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
          sub={stats.mode === 'mixed' ? 'participacao das sessoes de corrida' : stats.mode === 'speed' ? 'media da janela ativa' : 'ritmo medio por km'}
          accent={activeAccent}
        />
        <MetricCard label="Maior sessao" value={`${fmt.dist(stats.longest.distanceKm)} km`} sub={fmt.fullDate(stats.longest.date)} accent={activeAccent} />
        <MetricCard
          label={stats.mode === 'speed' ? 'Pico de velocidade' : stats.mode === 'mixed' ? 'Esporte dominante' : 'Melhor pace'}
          value={stats.mode === 'speed' ? fmt.speed(stats.fastestSpeed.distanceKm, stats.fastestSpeed.durationSec) : stats.mode === 'mixed' ? getSportLabel(stats.dominantSport?.[0] ?? 'Run') : fmt.pace(stats.fastest?.paceSec ?? null)}
          sub={stats.mode === 'mixed' ? `${stats.dominantSport?.[1] ?? 0} sessoes` : stats.mode === 'speed' ? fmt.fullDate(stats.fastestSpeed.date) : stats.fastest ? fmt.fullDate(stats.fastest.date) : 'sem dados'}
          accent={activeAccent}
        />
      </section>
    </>
  )
}
