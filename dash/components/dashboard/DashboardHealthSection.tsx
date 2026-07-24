import {
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
import type { SleepRecord, Vo2MaxRecord, WeightRecord } from './types'
import { chartCursor, chartTooltip, chartTooltipItem, chartTooltipLabel } from './helpers'
import { Panel, SectionLead } from './ui'

type WeightTrendRecord = WeightRecord & { weightSmooth: number }

type Props = {
  isAdmin: boolean
  sleepData: SleepRecord[]
  weightData: WeightRecord[]
  vo2MaxData: Vo2MaxRecord[]
  selectedYears: string[]
  activeWindow: DashboardSlices['activeWindow']
  yearLabel: string
  activeAccent: string
}

function inActiveWindow(dateValue: string, selectedYears: string[], start: Date | null, end: Date | null) {
  const year = dateValue.slice(0, 4)
  if (selectedYears.length > 0 && !selectedYears.includes(year)) return false
  const date = new Date(`${dateValue}T00:00:00`)
  if (start && date < start) return false
  if (end && date > end) return false
  return true
}

function smoothWeight(weightFiltered: WeightRecord[]): WeightTrendRecord[] {
  return weightFiltered.map((weight, index, records) => {
    const windowRecords = records.slice(Math.max(0, index - 3), index + 4)
    const average = windowRecords.reduce((sum, record) => sum + record.weightKg, 0) / windowRecords.length
    return { ...weight, weightSmooth: Number(average.toFixed(1)) }
  })
}

function formatVo2Delta(first: Vo2MaxRecord | undefined, last: Vo2MaxRecord | undefined) {
  if (!first || !last) return ''
  const delta = Number((last.vo2Max - first.vo2Max).toFixed(1))
  const sign = delta > 0 ? '+' : ''
  return `${first.vo2Max} -> ${last.vo2Max} ml/kg/min (${sign}${delta})`
}

export function DashboardHealthSection({ isAdmin, sleepData, weightData, vo2MaxData, selectedYears, activeWindow, yearLabel, activeAccent }: Props) {
  if (!isAdmin || (!sleepData.length && !weightData.length && !vo2MaxData.length)) return null

  const healthWindowStart = activeWindow.start
  const healthWindowEnd = activeWindow.end
  const healthWindowSubtitle = healthWindowStart && healthWindowEnd
    ? `Dados importados do Garmin. Recorte ativo: ${activeWindow.label}.`
    : `Dados importados do Garmin. Janela anual de ${yearLabel}.`

  const sleepFiltered = sleepData.filter((record) => inActiveWindow(record.date, selectedYears, healthWindowStart, healthWindowEnd))
  const weightFiltered = weightData.filter((record) => inActiveWindow(record.date, selectedYears, healthWindowStart, healthWindowEnd))
  const vo2MaxFiltered = vo2MaxData.filter((record) => inActiveWindow(record.date, selectedYears, healthWindowStart, healthWindowEnd))
  const weightSmoothed = smoothWeight(weightFiltered)

  if (!sleepFiltered.length && !weightSmoothed.length && !vo2MaxFiltered.length) return null

  const avgSleep = sleepFiltered.length
    ? (sleepFiltered.reduce((sum, record) => sum + record.durationMin, 0) / sleepFiltered.length / 60).toFixed(1)
    : null

  const firstWeight = weightSmoothed[0]
  const lastWeight = weightSmoothed[weightSmoothed.length - 1]
  const firstVo2 = vo2MaxFiltered[0]
  const lastVo2 = vo2MaxFiltered[vo2MaxFiltered.length - 1]

  return (
    <section id="saude" className="dashboard-health">
      {sleepFiltered.length > 0 && (
        <SectionLead
          eyebrow="Saude & Recuperacao"
          title="Sono"
          subtitle={healthWindowSubtitle}
        />
      )}
      {sleepFiltered.length > 0 && (
        <Panel
          eyebrow="Sono"
          title="Duracao diaria"
          subtitle={avgSleep ? `Media do periodo: ${avgSleep}h` : ''}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={sleepFiltered} margin={{ top: 8, right: 4, bottom: 4, left: -16 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="var(--grid)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value: string) => value.slice(5)} interval={Math.floor(sleepFiltered.length / 10)} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value: number) => `${Math.round(value / 60)}h`} domain={[0, 660]} />
              <Tooltip contentStyle={chartTooltip} itemStyle={chartTooltipItem} labelStyle={chartTooltipLabel} cursor={chartCursor} formatter={(value: number) => [`${Math.floor(value / 60)}h ${value % 60}min`, 'Sono']} labelFormatter={(label: string) => label} />
              <Bar dataKey="durationMin" radius={[4, 4, 0, 0]}>
                {sleepFiltered.map((record) => (
                  <Cell key={record.date} fill={record.durationMin < 300 ? 'var(--accent-4)' : activeAccent} fillOpacity={0.9} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--accent-4)', marginRight: 4, verticalAlign: 'middle' }} />
            Menos de 5h
          </p>
        </Panel>
      )}

      {weightSmoothed.length > 0 && (
        <SectionLead
          eyebrow="Saude & Recuperacao"
          title="Composicao corporal"
          subtitle={healthWindowSubtitle}
        />
      )}
      {weightSmoothed.length > 0 && (
        <Panel
          eyebrow="Peso"
          title="Tendencia corporal"
          subtitle={firstWeight && lastWeight ? `${firstWeight.weightKg} -> ${lastWeight.weightKg} kg no recorte` : ''}
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={weightSmoothed} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="var(--grid)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value: string) => value.slice(5)} interval={Math.floor(weightSmoothed.length / 10)} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value: number) => `${value}kg`} domain={['auto', 'auto']} />
              <Tooltip contentStyle={chartTooltip} itemStyle={chartTooltipItem} labelStyle={chartTooltipLabel} cursor={chartCursor} formatter={(value: number, name: string) => [`${value} kg`, name === 'weightSmooth' ? 'Media 7d' : 'Diario']} labelFormatter={(label: string) => label} />
              <Line type="monotone" dataKey="weightKg" dot={false} stroke={activeAccent} strokeWidth={1} strokeOpacity={0.25} />
              <Line type="monotone" dataKey="weightSmooth" dot={false} stroke={activeAccent} strokeWidth={2.5} />
            </LineChart>
          </ResponsiveContainer>
          {lastWeight?.fatPct != null && (
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              Ultima leitura: gordura {lastWeight.fatPct}% | musculo {lastWeight.muscleMassKg} kg | agua {lastWeight.waterPct}%
            </p>
          )}
        </Panel>
      )}

      {vo2MaxFiltered.length > 0 && (
        <SectionLead
          eyebrow="Saude & Desempenho"
          title="VO2 max"
          subtitle={healthWindowSubtitle}
        />
      )}
      {vo2MaxFiltered.length > 0 && (
        <Panel
          eyebrow="VO2 max"
          title={lastVo2 ? `${lastVo2.vo2Max} ml/kg/min` : 'Evolucao mensal'}
          subtitle={formatVo2Delta(firstVo2, lastVo2)}
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={vo2MaxFiltered} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="var(--grid)" />
              <XAxis dataKey="monthLabel" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} interval={Math.floor(vo2MaxFiltered.length / 8)} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
              <Tooltip contentStyle={chartTooltip} itemStyle={chartTooltipItem} labelStyle={chartTooltipLabel} cursor={chartCursor} formatter={(value: number) => [`${value} ml/kg/min`, 'VO2 max']} labelFormatter={(label: string) => label} />
              <Line type="monotone" dataKey="vo2Max" dot={{ r: 3 }} stroke="var(--accent-2)" strokeWidth={2.5} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      )}
    </section>
  )
}