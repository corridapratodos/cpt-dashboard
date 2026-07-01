'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'

export default function LegalGate({ userName }: { userName: string }) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleAccept = async () => {
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/legal/accept', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Nao foi possivel registrar o aceite.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel registrar o aceite.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="shell">
      <section className="hero legal-hero">
        <div className="hero-grid legal-grid">
          <div>
            <p className="eyebrow">Base legal e transparencia</p>
            <h1 className="display">Antes de seguir, precisamos do seu aceite.</h1>
            <p className="hero-copy">
              {userName}, o dashboard importa e armazena seus dados de treino do Strava para gerar analises, comparativos e historico esportivo.
            </p>
            <div className="hero-meta-row">
              <span className="pill pill-ghost">Dados usados: atividades, datas, distancias, ritmos, tempo, FC e elevacao</span>
              <span className="pill pill-ghost">Armazenamento: Firestore server-side</span>
              <span className="pill pill-ghost">Controle do usuario: exclusao e revogacao disponiveis</span>
            </div>
          </div>

          <div className="control-panel">
            <div className="panel-header compact">
              <div>
                <p className="panel-eyebrow">Aceite obrigatorio</p>
                <h3>Privacidade e termos de uso</h3>
              </div>
              <span className="panel-subtitle">Sem aceite, o painel nao libera a leitura dos dados.</span>
            </div>

            <div className="insight-list legal-list">
              <article className="insight-item">
                <strong>O que vamos guardar</strong>
                <p>Resumo das atividades sincronizadas e metadados de conta suficientes para montar o painel e atualizar o historico.</p>
              </article>
              <article className="insight-item">
                <strong>O que nao fazemos</strong>
                <p>Nao publicamos nada no Strava e nao compartilhamos seus dados com outros atletas dentro do produto.</p>
              </article>
              <article className="insight-item">
                <strong>Seu controle</strong>
                <p>Depois do acesso, voce pode excluir seus dados diretamente do painel e tambem revogar o app no Strava.</p>
              </article>
            </div>

            <div className="legal-links">
              <a href="/privacy" className="btn btn-ghost">Politica de privacidade</a>
              <a href="/terms" className="btn btn-ghost">Termos de uso</a>
            </div>

            <div className="action-row legal-actions">
              <button onClick={handleAccept} disabled={submitting} className="btn btn-primary" type="button">
                {submitting ? 'Registrando aceite...' : 'Aceitar e entrar no painel'}
              </button>
              <button onClick={() => signOut({ callbackUrl: '/login' })} className="btn btn-outline" type="button">
                Sair
              </button>
            </div>

            {error && <p className="sync-message">{error}</p>}
          </div>
        </div>
      </section>
    </main>
  )
}
