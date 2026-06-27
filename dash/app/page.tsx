import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { activitiesRef, metaRef } from '@/lib/firebase'
import DashboardClient from '@/components/DashboardClient'

type DashboardActivity = {
  stravaId: number
  name: string
  date: string
  distanceKm: number
  durationSec: number
  paceSec: number | null
  hrAvg: number | null
  hrMax: number | null
  elevationGain: number
  kudos: number
  type: string
}

export const revalidate = 0

function serializeFirestoreValue(value: any): any {
  if (value == null) return value
  if (typeof value?.toDate === 'function') return value.toDate().toISOString()
  if (Array.isArray(value)) return value.map(serializeFirestoreValue)
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, serializeFirestoreValue(nested)])
    )
  }
  return value
}

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const colRef = activitiesRef(session.stravaId)
  const [snap, metaSnap] = await Promise.all([
    colRef.orderBy('date', 'desc').get(),
    metaRef(session.stravaId).get(),
  ])

  const activities: DashboardActivity[] = snap.docs.map((d) => {
    const data = d.data()
    return {
      stravaId: data.stravaId,
      name: data.name,
      date: data.date?.toDate?.()?.toISOString() ?? data.date,
      distanceKm: data.distanceKm,
      durationSec: data.durationSec,
      paceSec: data.paceSec ?? null,
      hrAvg: data.hrAvg ?? null,
      hrMax: data.hrMax ?? null,
      elevationGain: data.elevationGain ?? 0,
      kudos: data.kudos ?? 0,
      type: data.type ?? 'Workout',
    }
  })

  const meta = metaSnap.exists ? serializeFirestoreValue(metaSnap.data()) : null

  return (
    <DashboardClient
      activities={activities}
      meta={meta}
      userName={session.user?.name ?? 'Atleta'}
    />
  )
}
