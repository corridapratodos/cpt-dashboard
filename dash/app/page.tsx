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
  paceSec: number
  hrAvg: number | null
  hrMax: number | null
  elevationGain: number
}

export const revalidate = 0 // sem cache — dados sempre frescos

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const colRef = activitiesRef(session.stravaId)
  const [snap, metaSnap] = await Promise.all([
    colRef.orderBy('date', 'desc').limit(200).get(),
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
      paceSec: data.paceSec,
      hrAvg: data.hrAvg ?? null,
      hrMax: data.hrMax ?? null,
      elevationGain: data.elevationGain ?? 0,
    }
  })

  const meta = metaSnap.exists
    ? (() => {
        const data = metaSnap.data()
        return {
          ...data,
          lastSync: data?.lastSync?.toDate?.()?.toISOString() ?? data?.lastSync ?? null,
        }
      })()
    : null

  return (
    <DashboardClient
      activities={activities}
      meta={meta}
      userName={session.user?.name ?? 'Atleta'}
    />
  )
}
