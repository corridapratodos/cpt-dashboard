'use client'

import type { FormEvent } from 'react'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const ACCESS_ERRORS: Record<string, string> = {
  invite_required: 'Valide um codigo de convite antes de abrir a conexao com o Strava.',
  invite_claim_missing: 'Esse convite nao ficou valido para concluir o login. Tente novamente com um novo codigo.',
  invite_claim_bound: 'Esse convite ja foi associado a outro primeiro acesso e nao pode ser reutilizado.',
}

export default function PreAccessGate() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const queryError = ACCESS_ERRORS[searchParams.get('error') ?? ''] ?? ''
  const visibleError = error || queryError

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
      <p className="eyebrow">Convite</p>
      <h2 style={{ fontSize: '1.8rem', marginTop: '10px' }}>Entrar com codigo de convite</h2>
      <p style={{ marginTop: '12px' }}>
        Antes de abrir o login Strava, valide um codigo de convite. Cada codigo libera apenas o primeiro acesso que usar ele.
      </p>

      <form className="access-form" onSubmit={handleSubmit}>
        <label className="control-label" htmlFor="pre-access-code">Codigo de convite</label>
        <input
          id="pre-access-code"
          className="access-input"
          type="password"
          autoComplete="one-time-code"
          placeholder="Digite seu codigo"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        {visibleError && <p className="access-error">{visibleError}</p>}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting || !code.trim()}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {submitting ? 'Validando...' : 'Liberar conexao'}
        </button>
      </form>

      <ul className="login-list">
        <li>Bloqueia acesso direto ao login Strava sem convite valido.</li>
        <li>Cada codigo e consumido pelo primeiro uso bem-sucedido.</li>
        <li>Depois do convite, o restante do fluxo continua protegido por cookie assinado.</li>
      </ul>

      <p className="login-footnote">
        Ao continuar, voce ainda passara pela <a href="/privacy">politica de privacidade</a> e pelos <a href="/terms">termos de uso</a> antes de usar o painel.
      </p>
    </section>
  )
}
