import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { hasAdminAccess } from '@/lib/access'
import { sleepRef, userRef, vo2MaxRef, weightRef } from '@/lib/firebase'
import { parseHealthCSV } from '@/lib/health-csv'

const MAX_HEALTH_FILE_BYTES = 5 * 1024 * 1024
const MAX_HEALTH_TOTAL_BYTES = 12 * 1024 * 1024

async function batchSaveRecords<T extends { date: string }>(col: FirebaseFirestore.CollectionReference, records: T[]) {
  for (let i = 0; i < records.length; i += 500) {
    const batch = col.firestore.batch()
    records.slice(i, i + 500).forEach((record) => {
      batch.set(col.doc(record.date), record, { merge: true })
    })
    await batch.commit()
  }
}

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

  const totalBytes = files.reduce((sum, file) => sum + Number(file?.size ?? 0), 0)
  if (totalBytes > MAX_HEALTH_TOTAL_BYTES) {
    return Response.json({ error: 'Arquivos muito grandes para processamento.' }, { status: 413 })
  }

  let sleepSaved = 0
  let weightSaved = 0
  let vo2MaxSaved = 0
  let skipped = 0
  const errors: string[] = []

  for (const file of files) {
    if (Number(file.size ?? 0) > MAX_HEALTH_FILE_BYTES) {
      errors.push(`${file.name}: excede o limite de 5 MB.`)
      continue
    }

    const content = await file.text()
    const result = parseHealthCSV(content)

    if (result.type === 'unknown') {
      errors.push(`${file.name}: formato nao reconhecido.`)
      continue
    }

    skipped += result.skipped

    if (result.type === 'sleep') {
      await batchSaveRecords(sleepRef(session.stravaId), result.records)
      sleepSaved += result.records.length
    }

    if (result.type === 'weight') {
      await batchSaveRecords(weightRef(session.stravaId), result.records)
      weightSaved += result.records.length
    }

    if (result.type === 'vo2Max') {
      await batchSaveRecords(vo2MaxRef(session.stravaId), result.records)
      vo2MaxSaved += result.records.length
    }
  }

  return Response.json({ sleepSaved, weightSaved, vo2MaxSaved, skipped, errors })
}