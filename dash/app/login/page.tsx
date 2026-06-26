'use client'

import { signIn } from 'next-auth/react'

export default function LoginPage() {
  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '2rem',
      padding: '2rem',
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#fc4c02', marginBottom: '0.5rem' }}>
          Corrida Pra Todos
        </h1>
        <p style={{ color: '#888', fontSize: '1rem' }}>
          Seu painel de corrida pessoal
        </p>
      </div>

      <div style={{
        background: '#141414',
        border: '1px solid #2a2a2a',
        borderRadius: '12px',
        padding: '2rem',
        width: '100%',
        maxWidth: '360px',
        textAlign: 'center',
      }}>
        <p style={{ marginBottom: '1.5rem', color: '#aaa' }}>
          Conecte sua conta Strava para ver suas estatísticas de corrida
        </p>

        <button
          onClick={() => signIn('strava', { callbackUrl: '/' })}
          style={{
            width: '100%',
            padding: '0.875rem 1.5rem',
            background: '#fc4c02',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116z"/>
            <path d="M11.448 13.828l-2.089-4.116H6.29L11.448 19.8l.002-.004.002.004 5.15-10.088h-3.066l-2.089 4.116z" opacity=".6"/>
          </svg>
          Entrar com Strava
        </button>
      </div>

      <p style={{ color: '#555', fontSize: '0.75rem', textAlign: 'center' }}>
        Lemos apenas suas atividades de corrida. Nunca publicamos nada.
      </p>
    </main>
  )
}
