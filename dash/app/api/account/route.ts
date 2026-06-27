import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb, userRef } from '@/lib/firebase'

export async function DELETE() {
  const session = await getServerSession(authOptions)

  if (!session?.stravaId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await getDb().recursiveDelete(userRef(session.stravaId))

  return Response.json({ ok: true, deleted: true })
}
