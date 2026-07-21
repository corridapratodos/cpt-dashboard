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

export default function TermsPage() {
  return (
    <main className="shell legal-doc-shell">
      <section className="hero legal-hero compact-hero">
        <p className="eyebrow">Corrida Pra Todos</p>
        <h1 className="display">Termos de uso</h1>
        <p className="hero-copy">Versao 2026-07-20. Este documento define as regras basicas de uso do CPT Dashboard.</p>
      </section>

      <LegalSection title="Objeto do servico">
        <p>O CPT Dashboard e um painel de analise esportiva que importa dados do Strava para gerar visualizacoes, comparativos e leituras de treinamento com foco principal em corrida.</p>
      </LegalSection>

      <LegalSection title="Responsabilidade do usuario">
        <p>O usuario e responsavel por autorizar apenas contas proprias, revisar os dados apresentados e usar as analises como apoio a decisao, nao como substituto de orientacao medica ou profissional individualizada.</p>
      </LegalSection>

      <LegalSection title="Limites do produto">
        <p>As metricas dependem da qualidade dos dados importados e das regras de processamento. Pace, VDOT, zonas, consistencia, minutos ativos e leituras com IA sao estimativas de apoio, nao diagnostico, prescricao medica ou substituto de acompanhamento profissional. O painel pode evoluir criterios, filtros e exibicoes.</p>
      </LegalSection>

      <LegalSection title="Encerramento e exclusao">
        <p>O usuario pode pedir o encerramento pratico do uso ao excluir os dados pelo proprio painel e revogar a integracao com o Strava. O CPT pode suspender acesso em caso de uso indevido ou tentativa de abuso da infraestrutura.</p>
      </LegalSection>
    </main>
  )
}
