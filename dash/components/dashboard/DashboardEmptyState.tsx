'use client'

type DashboardEmptyStateProps = {
  syncing: boolean
  viewerAdmin: boolean
  onIncrementalSync: () => void
  onFullSync: () => void
}

export function DashboardEmptyState({ syncing, viewerAdmin, onIncrementalSync, onFullSync }: DashboardEmptyStateProps) {
  return (
    <main className="shell">
      <section className="hero hero-empty">
        <div>
          <p className="eyebrow">CPT Performance Lab</p>
          <h1 className="display">Conecte seu historico para acender o painel.</h1>
          <p className="hero-copy">O dashboard ja esta pronto para leitura multiesporte com foco em corrida. Falta puxar seus treinos do Strava.</p>
        </div>
        <div className="hero-actions hero-actions-stacked">
          <button onClick={onIncrementalSync} disabled={syncing} className="btn btn-primary" type="button">
            {syncing ? 'Sincronizando...' : 'Sincronizar Strava'}
          </button>
          {viewerAdmin && (
            <button onClick={onFullSync} disabled={syncing} className="btn btn-outline" type="button">
              Reconstruir historico
            </button>
          )}
        </div>
      </section>
    </main>
  )
}
