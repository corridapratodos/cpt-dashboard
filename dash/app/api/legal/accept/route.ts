import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { LEGAL_VERSION } from '@/lib/access'
import { userRef } from '@/lib/firebase'

export async function POST() {
  const session = await getServerSession(authOptions)

  if (!session?.stravaId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await userRef(session.stravaId).set(
    {
      legal: {
        version: LEGAL_VERSION,
        termsAcceptedAt: new Date(),
        privacyAcceptedAt: new Date(),
      },
      updatedAt: new Date(),
    },
    { merge: true }
  )

  return Response.json({ ok: true, version: LEGAL_VERSION })
}
