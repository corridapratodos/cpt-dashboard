import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { hasMasterAccess } from '@/lib/access'
import { generateDashboardAiReading, isDashboardAiEnabled } from '@/lib/dashboard-ai'
import { userRef } from '@/lib/firebase'

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

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Payload invalido.' }, { status: 400 })
  }

  try {
    const reading = await generateDashboardAiReading(body)
    return Response.json({ ok: true, reading })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Falha ao gerar leitura com IA.' },
      { status: 500 }
    )
  }
}
