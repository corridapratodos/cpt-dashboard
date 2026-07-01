'use client'

import { useState } from 'react'
import { Activity, BarChart3, Calendar, Database, Heart, Menu, Shield, Zap } from 'lucide-react'

interface SidebarProps {
  meta?: {
    lastSync?: string
    viewerRole?: string
    viewerPlan?: string
  } | null
  isAdmin?: boolean
}

const groups = [
  {
    label: 'DASHBOARD',
    items: [
      { icon: BarChart3, label: 'Visão Geral', href: '#resumo', active: true },
      { icon: Activity, label: 'Volume & Pace', href: '#volume' },
      { icon: Calendar, label: 'Comparativo', href: '#comparativo' },
    ],
  },
  {
    label: 'DADOS',
    items: [
      { icon: Zap, label: 'Strava Sync', href: '#' },
      { icon: Heart, label: 'Saúde', href: '#saude' },
      { icon: Database, label: 'Histórico', href: '#historico' },
    ],
  },
]

export function Sidebar({ meta, isAdmin }: SidebarProps) {
  const [open, setOpen] = useState(false)

  const syncDate = meta?.lastSync
    ? new Date(meta.lastSync).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
      ' ' +
      new Date(meta.lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '—'

  const adminGroups = isAdmin
    ? [
        ...groups,
        {
          label: 'SISTEMA',
          items: [{ icon: Shield, label: 'Admin', href: '#admin' }],
        },
      ]
    : groups

  return (
    <>
      <button
        className="sidebar-hamburger"
        aria-label="Menu"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <Menu size={18} />
      </button>

      {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}

      <aside className={`sidebar${open ? ' sidebar-open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">C</div>
          <div className="sidebar-logo-text">
            <p className="sidebar-brand">CPT<span>/</span>LAB</p>
            <p className="sidebar-brand-sub">perf.analytics</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {adminGroups.map((g) => (
            <div key={g.label} className="sidebar-section">
              <p className="sidebar-section-label">{g.label}</p>
              <ul>
                {g.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <li key={item.label}>
                      <a
                        href={item.href}
                        className={`sidebar-link${item.active ? ' sidebar-link-active' : ''}`}
                        onClick={() => setOpen(false)}
                      >
                        <Icon size={14} strokeWidth={1.5} />
                        <span>{item.label}</span>
                      </a>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Status */}
        <div className="sidebar-status">
          <div className="sidebar-status-row">
            <span>STATUS</span>
            <span className="sidebar-status-live">
              <span className="sidebar-status-dot" />
              LIVE
            </span>
          </div>
          <div className="sidebar-status-row">
            <span>SYNC</span>
            <span>{syncDate}</span>
          </div>
          {meta?.viewerRole && (
            <div className="sidebar-status-row">
              <span>PLANO</span>
              <span>{meta.viewerRole?.toUpperCase()} · {meta.viewerPlan?.toUpperCase()}</span>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
