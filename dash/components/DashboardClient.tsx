'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { signOut } from 'next-auth/react'
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

interface Activity {
  stravaId: number
  name: string
  date: string
  distanceKm: number
  durationSec: number
  paceSec: number | null
  hrAvg: number | null
  hrMax: number | null
  elevationGain: number
  kudos: number
  type: string
}

interface Props {
  initialActivities: Activity[]
  initialYear: string
  availableYears: string[]
  isAdmin: boolean
  meta: DashboardMeta | null
  userName: string
}

type ThemeMode = 'dark' | 'light'
type SyncMode = 'incremental' | 'full'

type DashboardMeta = {
  totalActivities?: number
  lastSync?: string
  lastSyncMode?: string
  viewerRole?: string
  viewerPlan?: string
  viewerAdmin?: boolean
  viewerScope?: {
    years?: string[] | 'all'
    types?: string[] | 'all'
    fullAccess?: boolean
  }
}

type PeriodTotals = {
  distance: number
  durationSec: number
  sessions: number
  avgPace: number | null
}

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
const ROWS_STEP = 24
const focusOrder = ['Run', 'Ride', 'Walk', 'Hike', 'Workout']

const sportMeta: Record<string, { label: string; accent: string; chip: string }> = {
  Run: { label: 'Corrida', accent: 'var(--accent)', chip: 'var(--chip-run)' },
  Ride: { label: 'Ciclismo', accent: 'var(--accent-2)', chip: 'var(--chip-ride)' },
  Walk: { label: 'Caminhada', accent: 'var(--accent-3)', chip: 'var(--chip-walk)' },
  Hike: { label: 'Trilha', accent: 'var(--accent-4)', chip: 'var(--chip-hike)' },
  Workout: { label: 'Treino', accent: 'var(--chip-neutral)', chip: 'var(--chip-neutral)' },
}

const fmt = {
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
  date: (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
  fullDate: (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }),
  month: (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
  pct: (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(0)}%`,
}

function getSportLabel(type: string) {
  return sportMeta[type]?.label ?? type
}

function getSportAccent(type: string) {
  return sportMeta[type]?.accent ?? 'var(--accent)'
}

function getMetricMode(filter: string) {
  if (filter === 'Ride') return 'speed'
  if (filter === 'All') return 'mixed'
  return 'pace'
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode
  localStorage.setItem('cpt-theme', mode)
}

function getPeriodTotals(items: Activity[]): PeriodTotals {
  const sessions = items.length
  const distance = items.reduce((sum, item) => sum + item.distanceKm, 0)
  const durationSec = items.reduce((sum, item) => sum + item.durationSec, 0)
  const valid = items.filter((item) => item.paceSec != null)
  const avgPace = valid.length
    ? Math.round(valid.reduce((sum, item) => sum + (item.paceSec ?? 0), 0) / valid.length)
    : null

  return { distance, durationSec, sessions, avgPace }
}

function pctChange(current: number, previous: number) {
  if (!previous && !current) return 0
  if (!previous) return 100
  return ((current - previous) / previous) * 100
}

function startOfWeek(date: Date) {
  const value = new Date(date)
  const day = value.getDay()
  const diff = day === 0 ? -6 : 1 - day
  value.setHours(0, 0, 0, 0)
  value.setDate(value.getDate() + diff)
  return value
}

const chartTooltip = {
  background: 'var(--surface-elevated)',
  border: '1px solid var(--border-strong)',
  borderRadius: 18,
  color: 'var(--text)',
  boxShadow: '0 18px 45px rgba(0, 0, 0, 0.18)',
}

const readingLayers = [
  { title: 'Resumo', copy: 'leitura rapida do recorte ativo' },
  { title: 'Volume', copy: 'distancia, tempo e frequencia' },
  { title: 'Desempenho', copy: 'pace, velocidade e tendencia' },
  { title: 'Comparativo', copy: 'janela atual versus periodo anterior' },
  { title: 'Consistencia', copy: 'carga sustentada e deload' },
]

export default function DashboardClient({ initialActivities, initialYear, availableYears, isAdmin, meta, userName }: Props) {
  const [syncing, setSyncing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [theme, setTheme] = useState<ThemeMode>('dark')
  const [sportFilter, setSportFilter] = useState('Run')
  const [yearFilter, setYearFilter] = useState(initialYear)
  const [loadedYear, setLoadedYear] = useState(initialYear)
  const [activities, setActivities] = useState<Activity[]>(initialActivities)
  const [loadingActivities, setLoadingActivities] = useState(false)
  const [visibleRows, setVisibleRows] = useState(ROWS_STEP)
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('cpt-theme')
    const mode: ThemeMode = saved === 'light' ? 'light' : 'dark'
    applyTheme(mode)
    setTheme(mode)
  }, [])

  useEffect(() => {
    setVisibleRows(ROWS_STEP)
  }, [sportFilter, yearFilter])

  useEffect(() => {
    if (yearFilter === loadedYear) return

    let active = true

    async function loadActivities() {
      setLoadingActivities(true)
      setSyncMsg('')

      try {
        const res = await fetch(`/api/activities?year=${encodeURIComponent(yearFilter)}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? 'Nao foi possivel carregar as atividades.')
        if (!active) return
        setActivities(data.activities ?? [])
        setLoadedYear(yearFilter)
      } catch (error) {
        if (!active) return
        setSyncMsg(error instanceof Error ? error.message : 'Nao foi possivel carregar as atividades.')
      } finally {
        if (active) setLoadingActivities(false)
      }
    }

    void loadActivities()

    return () => {
      active = false
    }
  }, [loadedYear, yearFilter])

  const handleThemeToggle = () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  const handleSync = async (mode: SyncMode = 'incremental') => {
    if (mode === 'full') {
      const confirmed = window.confirm('Reconstruir o historico vai reprocessar toda a base do atleta. Deseja continuar?')
      if (!confirmed) return
    }

    setSyncing(true)
    setSyncMsg('')

    try {
      const res = await fetch(`/api/strava/sync?mode=${mode}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Erro ao sincronizar')
      const modeLabel = data.mode === 'incremental' ? 'incremental' : 'completo'
      setSyncMsg(`${data.synced} atividades sincronizadas (${modeLabel})`)
      setTimeout(() => window.location.reload(), 1200)
    } catch (error) {
      setSyncMsg(error instanceof Error ? error.message : 'Erro ao sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm('Isso vai excluir todos os seus dados sincronizados do CPT Dashboard. Deseja continuar?')
    if (!confirmed) return

    setDeleting(true)
    setSyncMsg('')

    try {
      const res = await fetch('/api/account', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Nao foi possivel excluir os dados.')
      await signOut({ callbackUrl: '/login' })
    } catch (error) {
      setSyncMsg(error instanceof Error ? error.message : 'Nao foi possivel excluir os dados.')
      setDeleting(false)
    }
  }

  const yearOptions = useMemo(() => {
    const merged = Array.from(new Set(['all', ...availableYears, ...activities.map((activity) => String(new Date(activity.date).getFullYear()))]))
    const allFirst = merged.filter((year) => year === 'all')
    const sortedYears = merged
      .filter((year) => year !== 'all')
      .sort((a, b) => Number(b) - Number(a))
    return [...allFirst, ...sortedYears]
  }, [activities, availableYears])

  const availableSports = useMemo(() => {
    const fromData = Array.from(new Set(activities.map((activity) => activity.type)))
    const ordered = focusOrder.filter((type) => fromData.includes(type))
    const remaining = fromData.filter((type) => !ordered.includes(type)).sort()
    return ['All', ...ordered, ...remaining]
  }, [activities])

  useEffect(() => {
    if (!availableSports.includes(sportFilter)) {
      setSportFilter(availableSports.includes('Run') ? 'Run' : 'All')
    }
  }, [availableSports, sportFilter])

  const filteredActivities = useMemo(() => {
    if (sportFilter === 'All') return activities
    return activities.filter((activity) => activity.type === sportFilter)
  }, [activities, sportFilter])

  const validPaceActivities = useMemo(
    () => filteredActivities.filter((activity) => activity.paceSec != null && activity.distanceKm > 0),
    [filteredActivities]
  )

  const stats = useMemo(() => {
    if (!filteredActivities.length) return null

    const totalDist = filteredActivities.reduce((sum, activity) => sum + activity.distanceKm, 0)
    const totalDur = filteredActivities.reduce((sum, activity) => sum + activity.durationSec, 0)
    const longest = filteredActivities.reduce((max, activity) => activity.distanceKm > max.distanceKm ? activity : max, filteredActivities[0])
    const mode = getMetricMode(sportFilter)
    const avgPace = validPaceActivities.length
      ? Math.round(validPaceActivities.reduce((sum, activity) => sum + (activity.paceSec ?? 0), 0) / validPaceActivities.length)
      : null
    const fastest = validPaceActivities.length
      ? validPaceActivities.reduce((min, activity) => (activity.paceSec ?? Infinity) < (min.paceSec ?? Infinity) ? activity : min, validPaceActivities[0])
      : null
    const avgSpeed = totalDur > 0 ? totalDist / (totalDur / 3600) : 0
    const fastestSpeed = filteredActivities.reduce((best, activity) => {
      const bestSpeed = best.durationSec > 0 ? best.distanceKm / (best.durationSec / 3600) : 0
      const currentSpeed = activity.durationSec > 0 ? activity.distanceKm / (activity.durationSec / 3600) : 0
      return currentSpeed > bestSpeed ? activity : best
    }, filteredActivities[0])
    const totalsByType = filteredActivities.reduce<Record<string, number>>((acc, activity) => {
      acc[activity.type] = (acc[activity.type] ?? 0) + 1
      return acc
    }, {})
    const dominantSport = Object.entries(totalsByType).sort((a, b) => b[1] - a[1])[0]

    return {
      totalDist,
      totalDur,
      longest,
      avgPace,
      fastest,
      avgSpeed,
      fastestSpeed,
      dominantSport,
      count: filteredActivities.length,
      shareRun: filteredActivities.length
        ? Math.round((filteredActivities.filter((activity) => activity.type === 'Run').length / filteredActivities.length) * 100)
        : 0,
      mode,
    }
  }, [filteredActivities, sportFilter, validPaceActivities])

  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; km: number; sessions: number }>()
    filteredActivities.forEach((activity) => {
      const key = activity.date.slice(0, 7)
      const current = map.get(key) ?? { month: fmt.month(activity.date), km: 0, sessions: 0 }
      map.set(key, {
        month: current.month,
        km: current.km + activity.distanceKm,
        sessions: current.sessions + 1,
      })
    })
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => ({ ...value, km: Number(value.km.toFixed(1)) }))
  }, [filteredActivities])

  const performanceTimeline = useMemo(() => {
    const recent = [...filteredActivities].reverse().slice(-24)
    const mode = getMetricMode(sportFilter)
    return recent
      .map((activity) => {
        const speed = activity.durationSec > 0 ? activity.distanceKm / (activity.durationSec / 3600) : 0
        return {
          date: fmt.date(activity.date),
          label: activity.name,
          paceLabel: fmt.pace(activity.paceSec),
          speedLabel: `${speed.toFixed(1)} km/h`,
          metricValue: mode === 'speed' ? speed : activity.paceSec,
        }
      })
      .filter((item) => item.metricValue != null)
  }, [filteredActivities, sportFilter])

  const periodComparison = useMemo(() => {
    if (!filteredActivities.length) return null
    const latestDate = new Date(filteredActivities[0].date)
    const currentStart = new Date(latestDate.getTime() - 27 * DAY_MS)
    const previousEnd = new Date(currentStart.getTime() - DAY_MS)
    const previousStart = new Date(previousEnd.getTime() - 27 * DAY_MS)

    const current = filteredActivities.filter((activity) => {
      const date = new Date(activity.date)
      return date >= currentStart && date <= latestDate
    })
    const previous = filteredActivities.filter((activity) => {
      const date = new Date(activity.date)
      return date >= previousStart && date <= previousEnd
    })

    const currentTotals = getPeriodTotals(current)
    const previousTotals = getPeriodTotals(previous)

    return {
      current: currentTotals,
      previous: previousTotals,
      distanceChange: pctChange(currentTotals.distance, previousTotals.distance),
      sessionChange: pctChange(currentTotals.sessions, previousTotals.sessions),
      durationChange: pctChange(currentTotals.durationSec, previousTotals.durationSec),
      paceChange: currentTotals.avgPace && previousTotals.avgPace
        ? ((previousTotals.avgPace - currentTotals.avgPace) / previousTotals.avgPace) * 100
        : 0,
    }
  }, [filteredActivities])

  const weeklyLoad = useMemo(() => {
    if (!filteredActivities.length) return [] as Array<{ week: string; km: number; sessions: number; load: number }>
    const latestDate = new Date(filteredActivities[0].date)
    const currentWeekStart = startOfWeek(latestDate)

    return Array.from({ length: 8 }, (_, index) => {
      const weekStart = new Date(currentWeekStart.getTime() - (7 - index) * WEEK_MS)
      const weekEnd = new Date(weekStart.getTime() + WEEK_MS)
      const items = filteredActivities.filter((activity) => {
        const date = new Date(activity.date)
        return date >= weekStart && date < weekEnd
      })
      const km = items.reduce((sum, item) => sum + item.distanceKm, 0)
      const avgPaceItems = items.filter((item) => item.paceSec != null)
      const avgPace = avgPaceItems.length
        ? avgPaceItems.reduce((sum, item) => sum + (item.paceSec ?? 0), 0) / avgPaceItems.length
        : null
      const paceFactor = avgPace ? 360 / avgPace : 1
      return {
        week: `${String(weekStart.getDate()).padStart(2, '0')}/${String(weekStart.getMonth() + 1).padStart(2, '0')}`,
        km: Number(km.toFixed(1)),
        sessions: items.length,
        load: Number((km * paceFactor).toFixed(1)),
      }
    })
  }, [filteredActivities])

  const loadInsight = useMemo(() => {
    if (weeklyLoad.length < 5) return null
    const currentWeek = weeklyLoad[weeklyLoad.length - 1]
    const baseline = weeklyLoad.slice(-5, -1)
    const avgLoad = baseline.reduce((sum, item) => sum + item.load, 0) / baseline.length
    const avgKm = baseline.reduce((sum, item) => sum + item.km, 0) / baseline.length
    const ratio = avgLoad > 0 ? currentWeek.load / avgLoad : 1

    let stableWeeks = 0
    for (let index = weeklyLoad.length - 1; index >= 0; index -= 1) {
      const item = weeklyLoad[index]
      if (avgKm === 0) break
      const withinBand = item.km >= avgKm * 0.85 && item.km <= avgKm * 1.15
      if (!withinBand) break
      stableWeeks += 1
    }

    let status = 'equilibrado'
    let recommendation = 'Carga sob controle. Da para manter a progressao atual.'
    if (ratio >= 1.18) {
      status = 'alto'
      recommendation = 'Semana acima da media recente. Vale considerar deload ou reduzir intensidade na proxima janela.'
    } else if (ratio <= 0.72) {
      status = 'baixo'
      recommendation = 'Semana bem abaixo da media recente. Pode ser recuperacao ou quebra de consistencia.'
    }

    return {
      currentWeek,
      avgLoad: Number(avgLoad.toFixed(1)),
      stableWeeks,
      status,
      recommendation,
    }
  }, [weeklyLoad])

  const effortHighlights = useMemo(() => activities.slice(0, 4), [activities])
  const visibleActivities = filteredActivities.slice(0, visibleRows)
  const activeAccent = sportFilter === 'All' ? 'var(--accent)' : getSportAccent(sportFilter)
  const yearLabel = yearFilter === 'all' ? 'historico completo' : yearFilter
  const totalActivities = Number(meta?.totalActivities ?? 0)
  const viewerRole = String(meta?.viewerRole ?? 'unknown')
  const viewerPlan = String(meta?.viewerPlan ?? 'unknown')
  const viewerAdmin = Boolean(meta?.viewerAdmin ?? isAdmin)
  const viewerScopeLabel = meta?.viewerScope?.fullAccess
    ? 'all'
    : `${Array.isArray(meta?.viewerScope?.types) ? meta.viewerScope.types.join(', ') : '-'} | ${Array.isArray(meta?.viewerScope?.years) ? meta.viewerScope.years.join(', ') : '-'}`
  const mode = getMetricMode(sportFilter)
  const focusLabel = sportFilter === 'All' ? 'visao multiesporte' : getSportLabel(sportFilter)
  const methodologyCopy = mode === 'mixed'
    ? 'Neste recorte misto, os KPIs de topo priorizam composicao, volume e dominancia do esporte.'
    : mode === 'speed'
      ? 'Neste recorte, desempenho e lido por velocidade. Volume e consistencia permanecem comparaveis.'
      : 'Neste recorte, desempenho e lido por pace. Volume e consistencia permanecem comparaveis.'

  if (!totalActivities && !activities.length) {
    return (
      <main className="shell">
        <section className="hero hero-empty">
          <div>
            <p className="eyebrow">CPT Performance Lab</p>
            <h1 className="display">Conecte seu historico para acender o painel.</h1>
            <p className="hero-copy">O dashboard ja esta pronto para leitura multiesporte com foco em corrida. Falta puxar seus treinos do Strava.</p>
          </div>
          <div className="hero-actions hero-actions-stacked">
            <button onClick={() => handleSync('incremental')} disabled={syncing} className="btn btn-primary" type="button">
              {syncing ? 'Sincronizando...' : 'Sincronizar Strava'}
            </button>
            {viewerAdmin && (
              <button onClick={() => handleSync('full')} disabled={syncing} className="btn btn-outline" type="button">
                Reconstruir historico
              </button>
            )}
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <p className="eyebrow">CPT Performance Lab</p>
            <h1 className="display">Leitura de treino por camadas: volume, desempenho, comparacao e consistencia.</h1>
            <p className="hero-copy">O painel agora assume uma hierarquia clara: primeiro resume o recorte ativo, depois separa o que e volume bruto, o que e desempenho, o que e comparativo de periodo e o que e saude da progressao.</p>
            <div className="hero-meta-row">
              <span className="pill pill-ghost">Atleta: {userName}</span>
              <span className="pill pill-ghost">Foco: {focusLabel}</span>
              <span className="pill pill-ghost">Ano: {yearLabel}</span>
              <span className="pill pill-ghost">Base ativa: {activities.length} atividades</span>
              <span className="pill pill-ghost">Base total: {totalActivities}</span>
              <span className="pill pill-ghost">Role: {viewerRole}</span>
              <span className="pill pill-ghost">Plan: {viewerPlan}</span>
              <span className="pill pill-ghost">Admin: {viewerAdmin ? 'sim' : 'nao'}</span>
              <span className="pill pill-ghost">Scope: {viewerScopeLabel}</span>
              {meta?.lastSync && <span className="pill pill-ghost">Ultimo sync: {new Date(meta.lastSync).toLocaleDateString('pt-BR')}{meta?.lastSyncMode ? ` | ${meta.lastSyncMode}` : ''}</span>}
            </div>
            <p className="hero-methodology">{methodologyCopy}</p>
            <div className="reading-grid">
              {readingLayers.map((layer) => (
                <article key={layer.title} className="reading-card">
                  <span className="metric-label">{layer.title}</span>
                  <strong>{layer.title}</strong>
                  <p>{layer.copy}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="control-panel">
            <div className="control-header">
              <div>
                <p className="control-label">Leitura principal</p>
                <strong>{sportFilter === 'All' ? 'Tudo no radar' : getSportLabel(sportFilter)}</strong>
              </div>
              <button onClick={handleThemeToggle} className="btn btn-ghost" type="button">
                {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
              </button>
            </div>

            <div className="filter-block">
              <span className="control-label">Esporte</span>
              <div className="filter-row">
                {availableSports.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className="sport-chip"
                    data-active={type === sportFilter}
                    onClick={() => setSportFilter(type)}
                    style={{ ['--chip-accent' as string]: type === 'All' ? 'var(--accent)' : getSportAccent(type) }}
                  >
                    {type === 'All' ? 'Tudo' : getSportLabel(type)}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-block">
              <span className="control-label">Ano</span>
              <div className="filter-row">
                {yearOptions.map((year) => (
                  <button
                    key={year}
                    type="button"
                    className="sport-chip year-chip"
                    data-active={year === yearFilter}
                    onClick={() => setYearFilter(year)}
                    style={{ ['--chip-accent' as string]: 'var(--accent-2)' }}
                  >
                    {year === 'all' ? 'Tudo' : year}
                  </button>
                ))}
              </div>
            </div>

            <div className="action-row">
              <button onClick={() => handleSync('incremental')} disabled={syncing || deleting || loadingActivities} className="btn btn-primary" type="button">
                {syncing ? 'Sincronizando...' : 'Atualizar dados'}
              </button>
              <button onClick={() => signOut({ callbackUrl: '/login' })} className="btn btn-outline" type="button">
                Sair
              </button>
            </div>

            {viewerAdmin && (
              <div className="admin-tools">
                <div>
                  <p className="control-label">Ferramentas de administrador</p>
                  <strong>Reconstrucao completa protegida por cooldown</strong>
                </div>
                <button onClick={() => handleSync('full')} disabled={syncing || deleting || loadingActivities} className="btn btn-outline" type="button">
                  Full sync
                </button>
              </div>
            )}

            {loadingActivities && <p className="sync-message">Carregando recorte de {yearLabel}...</p>}
            {syncMsg && <p className="sync-message">{syncMsg}</p>}
          </div>
        </div>
      </section>

      {!filteredActivities.length && !loadingActivities ? (
        <section className="panel">
          <div className="panel-header compact">
            <div>
              <p className="panel-eyebrow">Recorte vazio</p>
              <h3>Sem atividades para este filtro</h3>
            </div>
            <span className="panel-subtitle">Troque o esporte ou o ano para continuar a analise.</span>
          </div>
        </section>
      ) : (
        <>
          {stats && (
            <>
              <SectionLead
                eyebrow="Resumo executivo"
                title="Primeira leitura do recorte ativo"
                subtitle="Aqui entram os numeros de topo. Eles resumem a janela filtrada antes de abrir a analise detalhada."
              />
              <section className="kpi-grid">
                <MetricCard label="Sessoes ativas" value={String(stats.count)} sub={`${yearLabel} | ${sportFilter === 'All' ? 'todos os esportes' : getSportLabel(sportFilter)}`} accent={activeAccent} />
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
          )}

          <SectionLead
            eyebrow="Leitura analitica"
            title="Volume, desempenho, comparacao e consistencia"
            subtitle="Os paineis abaixo ja nao misturam tudo na mesma camada. Cada bloco responde uma pergunta diferente."
          />
          <section className="dashboard-grid">
            <Panel eyebrow="Volume" title="Volume mensal" subtitle="Quilometragem agrupada por mes dentro do ano filtrado">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthly} margin={{ top: 8, right: 4, bottom: 4, left: -16 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--grid)" />
                  <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={chartTooltip} formatter={(value: number) => [`${value} km`, 'Distancia']} />
                  <Bar dataKey="km" radius={[8, 8, 0, 0]}>
                    {monthly.map((entry, index) => (
                      <Cell key={`${entry.month}-${index}`} fill={activeAccent} fillOpacity={0.95 - index * 0.015} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel eyebrow="Desempenho" title={getMetricMode(sportFilter) === 'speed' ? 'Velocidade recente' : 'Evolucao recente'} subtitle="Janela curta para acompanhar tendencia do bloco atual">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={performanceTimeline} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--grid)" />
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    reversed={getMetricMode(sportFilter) !== 'speed'}
                    tickFormatter={(value) => getMetricMode(sportFilter) === 'speed' ? `${Number(value).toFixed(0)} km/h` : fmt.pace(Number(value))}
                  />
                  <Tooltip
                    contentStyle={chartTooltip}
                    formatter={(_value: number, _name: string, item: any) => [
                      getMetricMode(sportFilter) === 'speed' ? item.payload.speedLabel : item.payload.paceLabel,
                      getMetricMode(sportFilter) === 'speed' ? 'Velocidade' : 'Pace',
                    ]}
                  />
                  <Line type="monotone" dataKey="metricValue" stroke={activeAccent} strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>

            <Panel eyebrow="Comparativo" title="Comparativo 28 dias" subtitle="Janela atual versus as 4 semanas imediatamente anteriores">
              {periodComparison ? (
                <div className="comparison-grid">
                  <CompareTile label="Distancia" current={`${fmt.dist(periodComparison.current.distance)} km`} previous={`${fmt.dist(periodComparison.previous.distance)} km`} delta={fmt.pct(periodComparison.distanceChange)} positive={periodComparison.distanceChange >= 0} />
                  <CompareTile label="Sessoes" current={String(periodComparison.current.sessions)} previous={String(periodComparison.previous.sessions)} delta={fmt.pct(periodComparison.sessionChange)} positive={periodComparison.sessionChange >= 0} />
                  <CompareTile label="Tempo" current={fmt.dur(periodComparison.current.durationSec)} previous={fmt.dur(periodComparison.previous.durationSec)} delta={fmt.pct(periodComparison.durationChange)} positive={periodComparison.durationChange >= 0} />
                  <CompareTile label="Pace" current={fmt.pace(periodComparison.current.avgPace)} previous={fmt.pace(periodComparison.previous.avgPace)} delta={fmt.pct(periodComparison.paceChange)} positive={periodComparison.paceChange >= 0} />
                </div>
              ) : (
                <p className="empty-copy">Ainda nao ha dados suficientes para comparar os ultimos 28 dias.</p>
              )}
            </Panel>

            <Panel eyebrow="Consistencia" title="Carga semanal" subtitle="Heuristica de volume recente e manutencao de carga">
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
                  <Tooltip contentStyle={chartTooltip} formatter={(value: number) => [value, 'Carga']} />
                  <Area type="monotone" dataKey="load" stroke={activeAccent} fill="url(#loadFill)" strokeWidth={2.4} />
                </AreaChart>
              </ResponsiveContainer>
              {loadInsight && (
                <div className="callout" data-status={loadInsight.status}>
                  <strong>{loadInsight.stableWeeks} semanas sustentando a faixa de carga</strong>
                  <p>{loadInsight.recommendation}</p>
                  <span>Semana atual: {fmt.dist(loadInsight.currentWeek.km)} km | referencia recente: {loadInsight.avgLoad} de carga</span>
                </div>
              )}
            </Panel>
          </section>

          <SectionLead
            eyebrow="Leitura de apoio"
            title="Contexto de produto e leitura qualitativa"
            subtitle="Esses blocos ajudam a interpretar os numeros principais sem transformar o painel em uma planilha crua."
          />
          <section className="insight-grid">
            <Panel eyebrow="Produto" title="Leituras rapidas" subtitle="Como interpretar o recorte e a estrutura atual da home">
              <div className="insight-list">
                <InsightItem title="Volume nao e desempenho">Distancia, tempo e sessoes mostram carga externa. Pace e velocidade vivem em outra camada de leitura.</InsightItem>
                <InsightItem title="Ano e esporte definem o contexto">Os comparativos sempre respondem ao filtro ativo. O painel nao deve ser lido fora desse contexto.</InsightItem>
                <InsightItem title="Carga atual e heuristica">A leitura semanal serve para consistencia e deload, nao como equivalencia cientifica de TRIMP ou TSS.</InsightItem>
              </div>
            </Panel>

            <Panel eyebrow="Qualitativo" title="Ultimos treinos" subtitle="Amostra recente para leitura qualitativa">
              <div className="recent-grid">
                {effortHighlights.map((activity) => (
                  <article key={activity.stravaId} className="mini-card">
                    <div className="mini-topline">
                      <span className="sport-tag" style={{ background: sportMeta[activity.type]?.chip ?? 'var(--chip-neutral)' }}>{getSportLabel(activity.type)}</span>
                      <span>{fmt.date(activity.date)}</span>
                    </div>
                    <h4>{activity.name}</h4>
                    <div className="mini-metrics">
                      <span>{fmt.dist(activity.distanceKm)} km</span>
                      <span>{fmt.dur(activity.durationSec)}</span>
                      <span>{activity.type === 'Ride' ? fmt.speed(activity.distanceKm, activity.durationSec) : `${fmt.pace(activity.paceSec)}/km`}</span>
                    </div>
                  </article>
                ))}
              </div>
            </Panel>
          </section>

          <SectionLead
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
              <span className="pill pill-ghost">{filteredActivities.length} itens na lente ativa</span>
            </div>

            <div className="table-wrap">
              <table className="activity-table">
                <thead>
                  <tr>
                    {['Data', 'Tipo', 'Sessao', 'Distancia', 'Tempo', 'Ritmo/Vel.', 'FC media', 'Altimetria', 'Detalhe'].map((header) => <th key={header}>{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {visibleActivities.map((activity) => {
                    const speed = activity.durationSec > 0 ? activity.distanceKm / (activity.durationSec / 3600) : 0
                    return (
                      <tr key={activity.stravaId}>
                        <td>{fmt.date(activity.date)}</td>
                        <td><span className="sport-tag" style={{ background: sportMeta[activity.type]?.chip ?? 'var(--chip-neutral)' }}>{getSportLabel(activity.type)}</span></td>
                        <td className="truncate-cell">{activity.name}</td>
                        <td>{fmt.dist(activity.distanceKm)} km</td>
                        <td>{fmt.dur(activity.durationSec)}</td>
                        <td className="metric-emphasis">{activity.type === 'Ride' ? `${speed.toFixed(1)} km/h` : `${fmt.pace(activity.paceSec)}/km`}</td>
                        <td>{activity.hrAvg ? `${Math.round(activity.hrAvg)} bpm` : '-'}</td>
                        <td>{activity.elevationGain > 0 ? `${Math.round(activity.elevationGain)} m` : '-'}</td>
                        <td>
                          <button type="button" className="btn btn-ghost btn-inline" onClick={() => setSelectedActivity(activity)}>
                            Ver
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {visibleRows < filteredActivities.length && (
              <div className="table-actions">
                <button onClick={() => setVisibleRows((current) => current + ROWS_STEP)} className="btn btn-ghost" type="button">
                  Ver mais atividades
                </button>
              </div>
            )}
          </section>
        </>
      )}

      <section className="panel legal-panel">
        <div className="panel-header compact">
          <div>
            <p className="panel-eyebrow">Privacidade e dados</p>
            <h3>Controle da conta</h3>
          </div>
          <span className="panel-subtitle">Voce pode revisar a base legal e excluir seus dados a qualquer momento.</span>
        </div>

        <div className="legal-actions-grid">
          <a href="/privacy" className="btn btn-ghost">Politica de privacidade</a>
          <a href="/terms" className="btn btn-ghost">Termos de uso</a>
          <button onClick={handleDeleteAccount} disabled={deleting || syncing} className="btn btn-outline danger-button" type="button">
            {deleting ? 'Excluindo dados...' : 'Excluir meus dados'}
          </button>
        </div>

        <p className="legal-footnote">A exclusao remove seu historico salvo do Firestore. Se quiser encerrar o acesso de origem, revogue tambem o app nas configuracoes do Strava.</p>
      </section>

      {selectedActivity && (
        <div className="modal-scrim" onClick={() => setSelectedActivity(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header compact">
              <div>
                <p className="panel-eyebrow">Detalhe da atividade</p>
                <h3>{selectedActivity.name}</h3>
              </div>
              <button type="button" className="btn btn-ghost btn-inline" onClick={() => setSelectedActivity(null)}>Fechar</button>
            </div>
            <div className="detail-grid">
              <DetailItem label="Data" value={fmt.fullDate(selectedActivity.date)} />
              <DetailItem label="Tipo" value={getSportLabel(selectedActivity.type)} />
              <DetailItem label="Distancia" value={`${fmt.dist(selectedActivity.distanceKm)} km`} />
              <DetailItem label="Tempo" value={fmt.dur(selectedActivity.durationSec)} />
              <DetailItem label="Pace" value={selectedActivity.type === 'Ride' ? fmt.speed(selectedActivity.distanceKm, selectedActivity.durationSec) : `${fmt.pace(selectedActivity.paceSec)}/km`} />
              <DetailItem label="Elevacao" value={selectedActivity.elevationGain ? `${Math.round(selectedActivity.elevationGain)} m` : '-'} />
              <DetailItem label="FC media" value={selectedActivity.hrAvg ? `${Math.round(selectedActivity.hrAvg)} bpm` : '-'} />
              <DetailItem label="FC maxima" value={selectedActivity.hrMax ? `${Math.round(selectedActivity.hrMax)} bpm` : '-'} />
              <DetailItem label="Kudos" value={String(selectedActivity.kudos ?? 0)} />
              <DetailItem label="Strava ID" value={String(selectedActivity.stravaId)} />
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function MetricCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <article className="metric-card" style={{ ['--metric-accent' as string]: accent }}>
      <p className="metric-label">{label}</p>
      <strong className="metric-value">{value}</strong>
      <span className="metric-sub">{sub}</span>
    </article>
  )
}

function CompareTile({ label, current, previous, delta, positive }: { label: string; current: string; previous: string; delta: string; positive: boolean }) {
  return (
    <article className="compare-tile">
      <p className="metric-label">{label}</p>
      <strong>{current}</strong>
      <span className="compare-previous">antes: {previous}</span>
      <span className="compare-delta" data-positive={positive}>{delta}</span>
    </article>
  )
}

function Panel({ eyebrow = 'Analise', title, subtitle, children }: { eyebrow?: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-header compact">
        <div>
          <p className="panel-eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        <span className="panel-subtitle">{subtitle}</span>
      </div>
      {children}
    </section>
  )
}

function SectionLead({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <section className="section-lead">
      <div>
        <p className="panel-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <p>{subtitle}</p>
    </section>
  )
}

function InsightItem({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="insight-item">
      <strong>{title}</strong>
      <p>{children}</p>
    </article>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <article className="detail-item">
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
    </article>
  )
}


