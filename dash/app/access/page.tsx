import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import PreAccessGate from '@/components/PreAccessGate'
import { PRE_ACCESS_COOKIE_NAME, isPreAccessEnabled, isValidPreAccessCookieValue } from '@/lib/pre-access'

export default async function AccessPage() {
  if (!isPreAccessEnabled()) {
    redirect('/login')
  }

  const cookieStore = await cookies()
  const granted = await isValidPreAccessCookieValue(cookieStore.get(PRE_ACCESS_COOKIE_NAME)?.value)

  if (granted) {
    redirect('/login')
  }

  return (
    <main className="login-shell">
      <section className="login-brand">
        <p className="eyebrow">Corrida Pra Todos</p>
        <h1 className="display">Convite obrigatorio antes da conexao com o Strava.</h1>
        <p className="hero-copy">
          Esta etapa segura o rollout do dashboard. So quem validar um codigo de convite unico libera a tela de conexao com o Strava.
        </p>
      </section>

      <PreAccessGate />
    </main>
  )
}
