import type { ReactNode } from 'react'

export function MetricCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <article className="metric-card" style={{ ['--metric-accent' as string]: accent }}>
      <p className="metric-label">{label}</p>
      <strong className="metric-value">{value}</strong>
      <span className="metric-sub">{sub}</span>
    </article>
  )
}

export function CompareTile({ label, current, previous, delta, positive }: { label: string; current: string; previous: string; delta: string; positive: boolean }) {
  return (
    <article className="compare-tile">
      <p className="metric-label">{label}</p>
      <strong>{current}</strong>
      <span className="compare-previous">antes: {previous}</span>
      <span className="compare-delta" data-positive={positive}>{delta}</span>
    </article>
  )
}

export function Panel({ eyebrow = 'Analise', title, subtitle, children }: { eyebrow?: string; title: string; subtitle: string; children: ReactNode }) {
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

export function SectionLead({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
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

export function InsightItem({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="insight-item">
      <strong>{title}</strong>
      <p>{children}</p>
    </article>
  )
}

export function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <article className="detail-item">
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
    </article>
  )
}
