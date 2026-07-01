import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { hasAdminAccess } from '@/lib/access'
import { sleepRef, userRef, weightRef } from '@/lib/firebase'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.stravaId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const userSnap = await userRef(session.stravaId).get()
  if (!hasAdminAccess(session.stravaId, userSnap.exists ? userSnap.data() : null)) {
    return Response.json({ error: 'Acesso restrito.' }, { status: 403 })
  }

  const url = new URL(req.url)
  const from = url.searchParams.get('from') ?? ''
  const to = url.searchParams.get('to') ?? ''

  async function queryRange(col: FirebaseFirestore.CollectionReference, field = 'date') {
    let q: FirebaseFirestore.Query = col.orderBy(field, 'asc')
    if (from) q = q.where(field, '>=', from)
    if (to) q = q.where(field, '<=', to)
    const snap = await q.get()
    return snap.docs.map((d) => d.data())
  }

  const [sleep, weight] = await Promise.all([
    queryRange(sleepRef(session.stravaId)),
    queryRange(weightRef(session.stravaId)),
  ])

  return Response.json(
    { sleep, weight },
    { headers: { 'Cache-Control': 'private, max-age=300' } }
  )
}
