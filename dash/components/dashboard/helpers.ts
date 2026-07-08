import { repairMojibake } from '@/lib/text'
import type { Activity, PeriodTotals } from './types'

export const DAY_MS = 24 * 60 * 60 * 1000
export const WEEK_MS = 7 * DAY_MS
export const ROWS_STEP = 20
export const focusOrder = ['Run', 'Ride', 'Walk', 'Hike', 'Workout']
export const performanceTypes = new Set(['Run', 'TrailRun', 'VirtualRun', 'Walk', 'Hike'])
export const runLikeTypes = new Set(['Run', 'TrailRun', 'VirtualRun'])
export const walkLikeTypes = new Set(['Walk', 'Hike'])
export const recordTargets = [3, 5, 10, 15, 21.1, 30]

export const sportMeta: Record<string, { label: string; accent: string; chip: string }> = {
  Run: { label: 'Corrida', accent: 'var(--accent)', chip: 'var(--chip-run)' },
  Ride: { label: 'Ciclismo', accent: 'var(--accent-2)', chip: 'var(--chip-ride)' },
  Walk: { label: 'Caminhada', accent: 'var(--accent-3)', chip: 'var(--chip-walk)' },
  Hike: { label: 'Trilha', accent: 'var(--accent-4)', chip: 'var(--chip-hike)' },
  Workout: { label: 'Treino', accent: 'var(--chip-neutral)', chip: 'var(--chip-neutral)' },
}

export const fmt = {
  pace: (sec: number | null) => {
    if (sec == null || !Number.isFinite(sec)) return '-'
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
  },
  speed: (km: number, sec: number) => {
    if (!sec) return '-'
    return `${(km / (sec / 3600)).toFixed(1)} km/h`
  },
  dist: (km: number) => km.toFixed(1),
  dur: (sec: number) => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
  },
  clock: (sec: number | null) => {
    if (sec == null || !Number.isFinite(sec)) return '-'
    const total = Math.max(0, Math.round(sec))
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`
  },
  date: (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' }),
  fullDate: (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }),
  month: (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
  dayMonthYear: (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }),
  dayMonthTime: (iso: string) => `${new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })} ${new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}`,
  pct: (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(0)}%`,
}

export function getSportLabel(type: string) {
  return sportMeta[type]?.label ?? type
}

export function getSportAccent(type: string) {
  return sportMeta[type]?.accent ?? 'var(--accent)'
}

export function getMetricMode(filter: string) {
  if (filter === 'Ride') return 'speed'
  if (filter === 'All') return 'mixed'
  return 'pace'
}

export function applyTheme(mode: 'dark' | 'light') {
  document.documentElement.dataset.theme = mode
  localStorage.setItem('cpt-theme', mode)
}

export function getDisplayName(value: string) {
  return repairMojibake(value)
}

export function isReliablePaceActivity(activity: Activity) {
  if (activity.paceSec == null || activity.distanceKm < 2 || activity.durationSec < 20 * 60) return false

  if (runLikeTypes.has(activity.type)) {
    return activity.paceSec >= 270 && activity.paceSec <= 600
  }

  if (walkLikeTypes.has(activity.type)) {
    return activity.paceSec >= 480 && activity.paceSec <= 1500
  }

  return activity.paceSec >= 120 && activity.paceSec <= 3600
}

export function getPeriodTotals(items: Activity[]): PeriodTotals {
  const sessions = items.length
  const distance = items.reduce((sum, item) => sum + item.distanceKm, 0)
  const durationSec = items.reduce((sum, item) => sum + item.durationSec, 0)
  const valid = items.filter(isReliablePaceActivity)
  const avgPace = valid.length
    ? Math.round(valid.reduce((sum, item) => sum + (item.paceSec ?? 0), 0) / valid.length)
    : null

  return { distance, durationSec, sessions, avgPace }
}

export function pctChange(current: number, previous: number) {
  if (!previous && !current) return 0
  if (!previous) return 100
  return ((current - previous) / previous) * 100
}

export function startOfWeek(date: Date) {
  const value = new Date(date)
  const day = value.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  value.setUTCHours(0, 0, 0, 0)
  value.setUTCDate(value.getUTCDate() + diff)
  return value
}

export function getDistanceTolerance(targetKm: number) {
  if (targetKm <= 5) return 0.35
  if (targetKm <= 10) return 0.75
  if (targetKm <= 21.1) return 1.25
  return 1.75
}

export const chartTooltip = {
  backgroundColor: 'var(--surface-elevated)',
  border: '1px solid var(--border-strong)',
  borderRadius: 12,
  color: 'var(--text)',
  boxShadow: '0 18px 45px rgba(0, 0, 0, 0.28)',
  padding: '10px 12px',
}

export const chartTooltipLabel = {
  color: 'var(--text)',
  fontWeight: 700,
  marginBottom: 6,
}

export const chartTooltipItem = {
  color: 'var(--text)',
}

export const chartCursor = {
  fill: 'var(--surface-soft)',
  fillOpacity: 0.42,
  stroke: 'var(--border-strong)',
  strokeOpacity: 0.45,
}

export const readingLayers = [
  { title: 'Resumo', copy: 'leitura rapida do recorte ativo' },
  { title: 'Volume', copy: 'distancia, tempo e frequencia' },
  { title: 'Desempenho', copy: 'pace, velocidade e tendencia' },
  { title: 'Comparativo', copy: 'janela atual versus periodo anterior' },
  { title: 'Consistencia', copy: 'carga sustentada e deload' },
]
