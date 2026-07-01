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

export function AnalysisTile({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <article className="analysis-tile">
      <p className="metric-label">{label}</p>
      <strong>{value}</strong>
      <span className="analysis-meta">{meta}</span>
    </article>
  )
}

export function Panel({ eyebrow = 'Analise', title, subtitle, right, children }: { eyebrow?: string; title: string; subtitle?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-header compact">
        <div>
          <p className="panel-eyebrow">// {eyebrow}</p>
          <h3>{title}</h3>
          {subtitle && <p className="panel-sub">{subtitle}</p>}
        </div>
        {right && <div className="panel-right">{right}</div>}
      </div>
      {children}
    </section>
  )
}

export function SectionLead({ id, eyebrow, title, subtitle }: { id?: string; eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div id={id} className="section-lead">
      <div className="section-lead-left">
        <span className="section-lead-code">// {eyebrow}</span>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
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
