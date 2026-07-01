import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { hasAdminAccess } from '@/lib/access'
import { sleepRef, userRef, weightRef } from '@/lib/firebase'
import { parseHealthCSV } from '@/lib/health-csv'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.stravaId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const userSnap = await userRef(session.stravaId).get()
  if (!hasAdminAccess(session.stravaId, userSnap.exists ? userSnap.data() : null)) {
    return Response.json({ error: 'Acesso restrito.' }, { status: 403 })
  }

  const formData = await req.formData()
  const files = formData.getAll('files') as File[]

  if (!files.length) return Response.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 })

  let sleepSaved = 0
  let weightSaved = 0
  let skipped = 0
  const errors: string[] = []

  for (const file of files) {
    const content = await file.text()
    const result = parseHealthCSV(content)

    if (result.type === 'unknown') {
      errors.push(`${file.name}: formato não reconhecido.`)
      continue
    }

    skipped += result.skipped

    if (result.type === 'sleep') {
      const col = sleepRef(session.stravaId)
      for (let i = 0; i < result.records.length; i += 500) {
        const batch = col.firestore.batch()
        result.records.slice(i, i + 500).forEach((r) => {
          batch.set(col.doc(r.date), r, { merge: true })
        })
        await batch.commit()
      }
      sleepSaved += result.records.length
    }

    if (result.type === 'weight') {
      const col = weightRef(session.stravaId)
      for (let i = 0; i < result.records.length; i += 500) {
        const batch = col.firestore.batch()
        result.records.slice(i, i + 500).forEach((r) => {
          batch.set(col.doc(r.date), r, { merge: true })
        })
        await batch.commit()
      }
      weightSaved += result.records.length
    }
  }

  return Response.json({ sleepSaved, weightSaved, skipped, errors })
}
