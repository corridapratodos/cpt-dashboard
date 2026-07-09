type Props = {
  deleting: boolean
  syncing: boolean
  onDeleteAccount: () => void
}

export function DashboardLegalSection({ deleting, syncing, onDeleteAccount }: Props) {
  return (
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
        <button onClick={onDeleteAccount} disabled={deleting || syncing} className="btn btn-outline danger-button" type="button">
          {deleting ? 'Excluindo dados...' : 'Excluir meus dados'}
        </button>
      </div>

      <p className="legal-footnote">A exclusao remove seu historico salvo do Firestore. Se quiser encerrar o acesso de origem, revogue tambem o app nas configuracoes do Strava.</p>
    </section>
  )
}
