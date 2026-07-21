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
        <p className="hero-copy">Versao 2026-07-20. Este documento resume como o CPT Dashboard coleta, usa, compartilha e exclui dados esportivos e de saude.</p>
      </section>

      <LegalSection title="Dados coletados">
        <p>Coletamos identificacao da conta no Strava, nome, foto, atividades, esporte, distancia, tempo, ritmo, frequencia cardiaca, elevacao, parciais, best efforts e metadados de sincronizacao. Quando a funcao e usada por conta autorizada, tambem podem ser importados arquivos Garmin com sono, peso e composicao corporal.</p>
      </LegalSection>

      <LegalSection title="Finalidade do uso">
        <p>Os dados sao utilizados para gerar metricas, filtros, comparativos, recordes, consistencia, minutos ativos, zonas estimadas e historico. Dados de saude sao usados apenas nos paineis correspondentes e nao alteram automaticamente uma prescricao de treino.</p>
      </LegalSection>

      <LegalSection title="Armazenamento e seguranca">
        <p>Os dados ficam armazenados no Firestore e sao acessados server-side. Tokens OAuth do Strava sao criptografados em producao. O produto nao publica no Strava em nome do atleta e aplica escopo de plano e perfil antes de devolver atividades, saude ou detalhes.</p>
      </LegalSection>

      <LegalSection title="IA e operadores de dados">
        <p>Para usuarios autorizados, um resumo estruturado do dashboard pode ser enviado ao Google Gemini para gerar uma leitura textual. O Gemini nao recebe acesso direto a conta Strava. Firestore, Strava, Garmin e Google atuam conforme suas proprias politicas e apenas nas funcoes descritas nesta pagina.</p>
      </LegalSection>

      <LegalSection title="Retencao e controle">
        <p>Atividades, saude, caches e tokens permanecem enquanto a conta estiver ativa ou ate a exclusao solicitada no painel. Registros tecnicos minimos de seguranca e limitacao de abuso podem ser mantidos pelo prazo necessario para proteger o servico. Duvidas de privacidade podem ser encaminhadas pelo canal de suporte informado no proprio servico.</p>
      </LegalSection>

      <LegalSection title="Exclusao e revogacao">
        <p>O atleta pode excluir seus dados diretamente no painel. A exclusao remove os dados salvos no Firestore. Para interromper a origem da integracao, o atleta tambem deve revogar o aplicativo nas configuracoes do Strava.</p>
      </LegalSection>
    </main>
  )
}
