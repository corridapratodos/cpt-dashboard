'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'

interface SidebarProps {
  meta?: {
    lastSync?: string
    viewerRole?: string
    viewerPlan?: string
  } | null
  isAdmin?: boolean
  onSync: () => void
  syncing: boolean
}

const NAV = [
  {
    group: 'Dashboard',
    items: [
      { label: 'Visão Geral', href: '#resumo', active: true },
      { label: 'Volume & Pace', href: '#volume' },
      { label: 'Comparativo', href: '#comparativo' },
    ],
  },
  {
    group: 'Dados',
    items: [
      { label: 'Recordes', href: '#recordes' },
      { label: 'Saúde', href: '#saude' },
      { label: 'Histórico', href: '#historico' },
    ],
  },
]

export function Sidebar({ meta, isAdmin, onSync, syncing }: SidebarProps) {
  const [open, setOpen] = useState(false)

  const syncDate = meta?.lastSync
    ? new Date(meta.lastSync).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
      ' ' +
      new Date(meta.lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="sidebar-hamburger"
        aria-label="Menu"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span /><span /><span />
      </button>

      {/* Overlay mobile */}
      {open && (
        <div className="sidebar-overlay" onClick={() => setOpen(false)} />
      )}

      <aside className={`sidebar${open ? ' sidebar-open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">C</div>
          <div>
            <p className="sidebar-brand">CPT<span>/</span>LAB</p>
            <p className="sidebar-brand-sub">perf.analytics</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {NAV.map((section) => (
            <div key={section.group} className="sidebar-section">
              <p className="sidebar-section-label">{section.group}</p>
              <ul>
                {section.items.map((item) => (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      className={`sidebar-link${item.active ? ' sidebar-link-active' : ''}`}
                      onClick={() => setOpen(false)}
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {isAdmin && (
            <div className="sidebar-section">
              <p className="sidebar-section-label">Sistema</p>
              <ul>
                <li>
                  <a href="#admin" className="sidebar-link" onClick={() => setOpen(false)}>
                    Admin
                  </a>
                </li>
              </ul>
            </div>
          )}
        </nav>

        {/* Status bar */}
        <div className="sidebar-status">
          <div className="sidebar-status-row">
            <span>Status</span>
            <span className="sidebar-status-live">
              <span className="sidebar-status-dot" />
              Live
            </span>
          </div>
          <div className="sidebar-status-row">
            <span>Sync</span>
            <span>{syncDate}</span>
          </div>
          {meta?.viewerRole && (
            <div className="sidebar-status-row">
              <span>Plano</span>
              <span>{meta.viewerRole} · {meta.viewerPlan}</span>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
