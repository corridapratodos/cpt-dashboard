'use client'

import { useState, useMemo } from 'react'
import { signOut } from 'next-auth/react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

interface Activity {
  stravaId: number
  name: string
  date: string
  distanceKm: number
  durationSec: number
  paceSec: number
  hrAvg: number | null
  hrMax: number | null
  elevationGain: number
}

interface Props {
  activities: Activity[]
  meta: any
  userName: string
}

const fmt = {
  pace: (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`,
  dist: (km: number) => km.toFixed(1),
  dur: (sec: number) => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}min`
  },
  date: (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
  month: (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
}

const KPI = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div style={{
    background: '#141414', border: '1px solid #2a2a2a', borderRadius: 8,
    padding: '1rem 1.25rem', flex: 1, minWidth: 140,
  }}>
    <div style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
    <div style={{ fontSize: 28, fontWeight: 700, color: '#fc4c02', lineHeight: 1.2, marginTop: 4 }}>{value}</div>
    {sub && <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>{sub}</div>}
  </div>
)

export default function DashboardClient({ activities, meta, userName }: Props) {
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await fetch('/api/strava/sync', { method: 'POST' })
      const data = await res.json()
      setSyncMsg(`✓ ${data.synced} corridas sincronizadas`)
      setTimeout(() => window.location.reload(), 1500)
    } catch {
      setSyncMsg('Erro ao sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  // ── Agregações ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!activities.length) return null
    const totalDist = activities.reduce((s, a) => s + a.distanceKm, 0)
    const totalDur = activities.reduce((s, a) => s + a.durationSec, 0)
    const avgPace = Math.round(activities.reduce((s, a) => s + a.paceSec, 0) / activities.length)
    const longest = activities.reduce((m, a) => a.distanceKm > m.distanceKm ? a : m, activities[0])
    const fastest = activities.reduce((m, a) => a.paceSec < m.paceSec ? a : m, activities[0])
    return { totalDist, totalDur, avgPace, longest, fastest, count: activities.length }
  }, [activities])

  // Volume mensal
  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; km: number; runs: number; durSec: number }>()
    activities.forEach((a) => {
      const key = a.date.slice(0, 7)
      const label = fmt.month(a.date)
      const existing = map.get(key) ?? { month: label, km: 0, runs: 0, durSec: 0 }
      map.set(key, {
        month: label,
        km: existing.km + a.distanceKm,
        runs: existing.runs + 1,
        durSec: existing.durSec + a.durationSec,
      })
    })
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({ ...v, km: parseFloat(v.km.toFixed(1)) }))
  }, [activities])

  // Pace ao longo do tempo (últimas 30 corridas)
  const paceTimeline = useMemo(() =>
    [...activities].reverse().slice(-30).map((a) => ({
      date: fmt.date(a.date),
      pace: a.paceSec,
      paceLabel: fmt.pace(a.paceSec),
    }))
  , [activities])

  if (!activities.length) {
    return (
      <main style={{ padding: '2rem', maxWidth: 800, margin: '0 auto' }}>
        <h2 style={{ marginBottom: '1rem' }}>Nenhuma corrida encontrada</h2>
        <p style={{ color: '#888', marginBottom: '1.5rem' }}>
          Sincronize seu histórico do Strava para começar.
        </p>
        <button onClick={handleSync} disabled={syncing} style={btnStyle}>
          {syncing ? 'Sincronizando...' : 'Sincronizar Strava'}
        </button>
        {syncMsg && <p style={{ marginTop: '1rem', color: '#22c55e' }}>{syncMsg}</p>}
      </main>
    )
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fc4c02' }}>
            Corrida Pra Todos
          </h1>
          <p style={{ color: '#666', fontSize: 12 }}>Olá, {userName}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {syncMsg && <span style={{ fontSize: 12, color: '#22c55e' }}>{syncMsg}</span>}
          {meta?.lastSync && (
            <span style={{ fontSize: 11, color: '#555' }}>
              Sync: {new Date(meta.lastSync?.toDate?.() ?? meta.lastSync).toLocaleDateString('pt-BR')}
            </span>
          )}
          <button onClick={handleSync} disabled={syncing} style={btnStyle}>
            {syncing ? '...' : 'Sincronizar'}
          </button>
          <button onClick={() => signOut({ callbackUrl: '/login' })} style={btnOutlineStyle}>
            Sair
          </button>
        </div>
      </div>

      {/* KPIs */}
      {stats && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <KPI label="Corridas" value={String(stats.count)} sub="total filtradas" />
          <KPI label="Distância" value={`${fmt.dist(stats.totalDist)} km`} sub="acumulado" />
          <KPI label="Tempo total" value={fmt.dur(stats.totalDur)} sub="em movimento" />
          <KPI label="Pace médio" value={fmt.pace(stats.avgPace)} sub="min/km" />
          <KPI label="Maior corrida" value={`${fmt.dist(stats.longest.distanceKm)} km`} sub={fmt.date(stats.longest.date)} />
          <KPI label="Melhor pace" value={fmt.pace(stats.fastest.paceSec)} sub={fmt.date(stats.fastest.date)} />
        </div>
      )}

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        {/* Volume mensal */}
        <div style={cardStyle}>
          <h3 style={cardTitle}>Volume mensal (km)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" />
              <XAxis dataKey="month" tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 6 }}
                formatter={(val: number) => [`${val} km`, 'Distância']}
              />
              <Bar dataKey="km" fill="#fc4c02" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pace ao longo do tempo */}
        <div style={cardStyle}>
          <h3 style={cardTitle}>Evolução do pace (últimas 30)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={paceTimeline} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" />
              <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis
                tick={{ fill: '#888', fontSize: 11 }}
                tickFormatter={(v) => fmt.pace(v)}
                reversed
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 6 }}
                formatter={(_: any, __: any, props: any) => [props.payload.paceLabel, 'Pace']}
              />
              <Line type="monotone" dataKey="pace" stroke="#fc4c02" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Corridas por mês */}
        <div style={cardStyle}>
          <h3 style={cardTitle}>Frequência mensal (corridas)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthly} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" />
              <XAxis dataKey="month" tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 6 }}
                formatter={(val: number) => [val, 'Corridas']}
              />
              <Area type="monotone" dataKey="runs" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabela de corridas recentes */}
      <div style={cardStyle}>
        <h3 style={{ ...cardTitle, marginBottom: '1rem' }}>Corridas recentes</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Data', 'Nome', 'Dist.', 'Tempo', 'Pace', 'FC média', 'Ganho alt.'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: '#666', fontWeight: 500, borderBottom: '1px solid #222' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activities.slice(0, 20).map((a) => (
                <tr key={a.stravaId} style={{ borderBottom: '1px solid #1a1a1a' }}>
                  <td style={tdStyle}>{fmt.date(a.date)}</td>
                  <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</td>
                  <td style={tdStyle}>{fmt.dist(a.distanceKm)} km</td>
                  <td style={tdStyle}>{fmt.dur(a.durationSec)}</td>
                  <td style={{ ...tdStyle, color: '#fc4c02', fontWeight: 600 }}>{fmt.pace(a.paceSec)}</td>
                  <td style={tdStyle}>{a.hrAvg ? `${Math.round(a.hrAvg)} bpm` : '–'}</td>
                  <td style={tdStyle}>{a.elevationGain > 0 ? `${Math.round(a.elevationGain)}m` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}

// Estilos inline reutilizáveis
const btnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: '#fc4c02',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const btnOutlineStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: 'transparent',
  color: '#888',
  border: '1px solid #333',
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
}

const cardStyle: React.CSSProperties = {
  background: '#141414',
  border: '1px solid #2a2a2a',
  borderRadius: 8,
  padding: '1.25rem',
}

const cardTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: '0.75rem',
}

const tdStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem',
  color: '#ccc',
}
