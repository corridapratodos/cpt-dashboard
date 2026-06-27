import type { ReactNode } from 'react'

function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel legal-doc-panel">
      <div className="panel-header compact">
        <div>
          <p className="panel-eyebrow">Documento legal</p>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="legal-doc-copy">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <main className="shell legal-doc-shell">
      <section className="hero legal-hero compact-hero">
        <p className="eyebrow">Corrida Pra Todos</p>
        <h1 className="display">Politica de privacidade</h1>
        <p className="hero-copy">Versao 2026-06-27. Este documento resume como o CPT Dashboard coleta, usa e exclui dados sincronizados do Strava.</p>
      </section>

      <LegalSection title="Dados coletados">
        <p>Coletamos os dados necessarios para montar o painel: identificacao da conta no Strava, nome, foto, data das atividades, esporte, distancia, tempo, ritmo, frequencia cardiaca media e maxima, ganho de elevacao e metadados de sincronizacao.</p>
      </LegalSection>

      <LegalSection title="Finalidade do uso">
        <p>Os dados sao utilizados para gerar metricas, filtros, comparativos por periodo, leitura de carga de treino e atualizacao automatica do historico do atleta dentro do CPT Dashboard.</p>
      </LegalSection>

      <LegalSection title="Armazenamento e seguranca">
        <p>Os dados ficam armazenados no Firestore e sao acessados server-side. O produto nao publica nada no Strava em nome do atleta e nao exibe a base de um usuario para outro usuario comum.</p>
      </LegalSection>

      <LegalSection title="Exclusao e revogacao">
        <p>O atleta pode excluir seus dados diretamente no painel. A exclusao remove os dados salvos no Firestore. Para interromper a origem da integracao, o atleta tambem deve revogar o aplicativo nas configuracoes do Strava.</p>
      </LegalSection>
    </main>
  )
}
