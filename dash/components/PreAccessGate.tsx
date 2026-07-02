'use client'

import type { FormEvent } from 'react'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function PreAccessGate() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const next = searchParams.get('next') ?? '/login'
      const res = await fetch('/api/access/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, next }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Nao foi possivel liberar o acesso.')

      router.replace(data.next ?? '/login')
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nao foi possivel liberar o acesso.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="login-card">
      <p className="eyebrow">Pre acesso</p>
      <h2 style={{ fontSize: '1.8rem', marginTop: '10px' }}>Entrar com codigo de convite</h2>
      <p style={{ marginTop: '12px' }}>
        Antes de abrir o login Strava, valide um codigo de acesso. Isso impede uso aleatorio do painel enquanto o produto ainda esta em fase controlada.
      </p>

      <form className="access-form" onSubmit={handleSubmit}>
        <label className="control-label" htmlFor="pre-access-code">Codigo de acesso</label>
        <input
          id="pre-access-code"
          className="access-input"
          type="password"
          autoComplete="one-time-code"
          placeholder="Digite seu codigo"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        {error && <p className="access-error">{error}</p>}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting || !code.trim()}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {submitting ? 'Validando...' : 'Liberar acesso'}
        </button>
      </form>

      <ul className="login-list">
        <li>Bloqueia curiosos antes do OAuth com Strava.</li>
        <li>Permite distribuir convites sem expor o dashboard publicamente.</li>
        <li>Funciona por cookie assinado, sem depender de cadastro manual previo.</li>
      </ul>

      <p className="login-footnote">
        Ao continuar, voce ainda passara pela <a href="/privacy">politica de privacidade</a> e pelos <a href="/terms">termos de uso</a> antes de usar o painel.
      </p>
    </section>
  )
}
