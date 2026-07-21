import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { hasMasterAccess } from '@/lib/access'
import { DashboardAiTemporaryError, generateDashboardAiReading, isDashboardAiEnabled } from '@/lib/dashboard-ai'
import { DASHBOARD_AI_MAX_BODY_BYTES, validateDashboardAiPayload } from '@/lib/dashboard-ai-validation'
import { userRef } from '@/lib/firebase'
import { consumeRateLimit } from '@/lib/rate-limit'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.stravaId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userSnap = await userRef(session.stravaId).get()
  const userData = userSnap.data()
  if (!hasMasterAccess(session.stravaId, userData)) {
    return Response.json({ error: 'Leitura com IA restrita ao master.' }, { status: 403 })
  }

  if (!isDashboardAiEnabled()) {
    return Response.json({ error: 'Leitura com IA indisponivel no momento.' }, { status: 503 })
  }

  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > DASHBOARD_AI_MAX_BODY_BYTES) {
    return Response.json({ error: 'Payload muito grande.' }, { status: 413 })
  }

  const rateLimit = await consumeRateLimit({
    key: `dashboard-ai:${session.stravaId}`,
    maxAttempts: 10,
    windowMs: 60 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return Response.json(
      { error: 'Limite temporario de leituras atingido.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
    )
  }

  const body = await req.json().catch(() => null)
  if (!validateDashboardAiPayload(body)) {
    return Response.json({ error: 'Payload invalido.' }, { status: 400 })
  }

  try {
    const reading = await generateDashboardAiReading(body)
    return Response.json({ ok: true, reading })
  } catch (error) {
    console.error('dashboard_ai_reading_failed', {
      stravaId: session.stravaId,
      reason: error instanceof Error ? error.message : 'unknown',
    })
    if (error instanceof DashboardAiTemporaryError) {
      return Response.json(
        { error: 'A IA esta temporariamente sobrecarregada. Tente novamente em alguns instantes.' },
        { status: 503, headers: { 'Retry-After': '15' } },
      )
    }
    return Response.json({ error: 'Falha ao gerar leitura com IA.' }, { status: 502 })
  }
}
