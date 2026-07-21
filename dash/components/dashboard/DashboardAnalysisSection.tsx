import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DashboardSlices } from './analytics'
import { chartCursor, chartTooltip, chartTooltipItem, chartTooltipLabel, fmt, getMetricMode } from './helpers'
import { CompareTile, Panel, SectionLead } from './ui'

type Props = {
  activeWindow: DashboardSlices['activeWindow']
  primarySport: DashboardSlices['primarySport']
  activeAccent: string
  volumeSeries: DashboardSlices['volumeSeries']
  performanceTimeline: DashboardSlices['performanceTimeline']
  periodComparison: DashboardSlices['periodComparison']
  weeklyLoad: DashboardSlices['weeklyLoad']
  loadInsight: DashboardSlices['loadInsight']
}

export function DashboardAnalysisSection({
  activeWindow,
  primarySport,
  activeAccent,
  volumeSeries,
  performanceTimeline,
  periodComparison,
  weeklyLoad,
  loadInsight,
}: Props) {
  const metricMode = getMetricMode(primarySport)

  return (
    <>
      <SectionLead
        id="volume"
        eyebrow="Leitura analitica"
        title="Volume, desempenho, comparacao e consistencia"
        subtitle="Os paineis abaixo ja nao misturam tudo na mesma camada. Cada bloco responde uma pergunta diferente."
      />
      <section className="dashboard-grid">
        <Panel eyebrow="Volume" title={activeWindow.volumeTitle} subtitle={activeWindow.volumeSubtitle}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={volumeSeries} margin={{ top: 8, right: 4, bottom: 4, left: -16 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="var(--grid)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={chartTooltip} itemStyle={chartTooltipItem} labelStyle={chartTooltipLabel} cursor={chartCursor} formatter={(value: number) => [`${value} km`, 'Distancia']} />
              <Bar dataKey="km" radius={[8, 8, 0, 0]}>
                {volumeSeries.map((entry, index) => (
                  <Cell key={`${entry.label}-${index}`} fill={activeAccent} fillOpacity={0.95 - index * 0.015} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        {metricMode !== 'mixed' && (
          <Panel eyebrow="Desempenho" title={metricMode === 'speed' ? 'Velocidade recente' : 'Evolucao recente'} subtitle="Janela curta para acompanhar tendencia do bloco atual">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={performanceTimeline} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="var(--grid)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                reversed={metricMode !== 'speed'}
                tickFormatter={(value) => metricMode === 'speed' ? `${Number(value).toFixed(0)} km/h` : fmt.pace(Number(value))}
              />
              <Tooltip
                contentStyle={chartTooltip}
                itemStyle={chartTooltipItem}
                labelStyle={chartTooltipLabel}
                cursor={chartCursor}
                formatter={(_value, _name, item) => [
                  metricMode === 'speed' ? item.payload.speedLabel : item.payload.paceLabel,
                  metricMode === 'speed' ? 'Velocidade' : 'Pace',
                ]}
              />
              <Line type="monotone" dataKey="metricValue" stroke={activeAccent} strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          </Panel>
        )}

        <Panel eyebrow="Comparativo" title={activeWindow.comparisonTitle} subtitle={activeWindow.comparisonSubtitle}>
          {periodComparison ? (
            <div className="comparison-grid">
              <CompareTile label="Distancia" current={`${fmt.dist(periodComparison.current.distance)} km`} previous={`${fmt.dist(periodComparison.previous.distance)} km`} delta={fmt.pct(periodComparison.distanceChange)} positive={periodComparison.distanceChange >= 0} />
              <CompareTile label="Sessoes" current={String(periodComparison.current.sessions)} previous={String(periodComparison.previous.sessions)} delta={fmt.pct(periodComparison.sessionChange)} positive={periodComparison.sessionChange >= 0} />
              <CompareTile label="Tempo" current={fmt.dur(periodComparison.current.durationSec)} previous={fmt.dur(periodComparison.previous.durationSec)} delta={fmt.pct(periodComparison.durationChange)} positive={periodComparison.durationChange >= 0} />
              {metricMode !== 'mixed' && (
                <CompareTile label="Pace" current={fmt.pace(periodComparison.current.avgPace)} previous={fmt.pace(periodComparison.previous.avgPace)} delta={fmt.pct(periodComparison.paceChange)} positive={periodComparison.paceChange >= 0} />
              )}
            </div>
          ) : (
            <p className="empty-copy">Ainda nao ha dados suficientes para comparar a janela ativa com o periodo anterior equivalente.</p>
          )}
        </Panel>

        <Panel eyebrow="Consistencia" title="Minutos ativos semanais" subtitle="Tempo ativo recente; nao representa TRIMP, TSS nem intensidade fisiologica">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={weeklyLoad} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
              <defs>
                <linearGradient id="loadFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={activeAccent} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={activeAccent} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="var(--grid)" />
              <XAxis dataKey="week" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={chartTooltip} itemStyle={chartTooltipItem} labelStyle={chartTooltipLabel} cursor={chartCursor} formatter={(value: number) => [value, 'Minutos ativos']} />
              <Area type="monotone" dataKey="load" stroke={activeAccent} fill="url(#loadFill)" strokeWidth={2.4} />
            </AreaChart>
          </ResponsiveContainer>
          {loadInsight && (
            <div className="callout" data-status={loadInsight.status}>
              <strong>{loadInsight.stableWeeks} semanas na faixa recente de volume</strong>
              <p>{loadInsight.recommendation}</p>
              <span>Semana: {loadInsight.currentWeek.load} min | referencia: {loadInsight.avgLoad} min</span>
            </div>
          )}
        </Panel>
      </section>
    </>
  )
}
