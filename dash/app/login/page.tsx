'use client'

import { signIn } from 'next-auth/react'

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-brand">
        <p className="eyebrow">Corrida Pra Todos</p>
        <h1 className="display">Painel de treino com estetica de performance.</h1>
        <p className="hero-copy">
          Um cockpit para corrida com leitura multiesporte. Corrida fica no centro, mas o historico inteiro do Strava passa a alimentar a analise.
        </p>
      </section>

      <section className="login-card">
        <p className="eyebrow">Conectar conta</p>
        <h2 style={{ fontSize: '1.8rem', marginTop: '10px' }}>Entrar com Strava</h2>
        <p style={{ marginTop: '12px' }}>
          Autorize a leitura das suas atividades para montar um painel com volume, consistencia, mix esportivo e evolucao recente.
        </p>

        <ul className="login-list">
          <li>Sincronizacao completa do historico salvo.</li>
          <li>Filtro por corrida, bike, caminhada, trilha e outros esportes.</li>
          <li>Leitura server-side com dados protegidos no Firestore.</li>
        </ul>

        <button
          onClick={() => signIn('strava', { callbackUrl: '/' })}
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', display: 'inline-flex', gap: '10px' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116z"/>
            <path d="M11.448 13.828l-2.089-4.116H6.29L11.448 19.8l.002-.004.002.004 5.15-10.088h-3.066l-2.089 4.116z" opacity=".6"/>
          </svg>
          Entrar com Strava
        </button>

        <p className="login-footnote">
          Lemos apenas os dados necessarios para analise. O app nao publica nada na sua conta.
        </p>
      </section>
    </main>
  )
}

