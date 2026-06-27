import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import DashboardClient from '@/components/DashboardClient'
import LegalGate from '@/components/LegalGate'
import { getUserPlan, getUserScope, hasAcceptedLegal, hasAdminAccess } from '@/lib/access'
import { authOptions } from '@/lib/auth'
import { buildActivitiesQuery, getVisibleYears, serializeFirestoreValue, toDashboardActivity } from '@/lib/dashboard'
import { activitiesRef, metaRef, userRef } from '@/lib/firebase'

export const revalidate = 0

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  if (!session?.stravaId) redirect('/login')

  const userSnap = await userRef(session.stravaId).get()
  const userData = userSnap.exists ? userSnap.data() : null

  if (!hasAcceptedLegal(userData)) {
    return <LegalGate userName={session.user?.name ?? 'Atleta'} />
  }

  const scope = getUserScope(session.stravaId, userData)
  const isAdmin = hasAdminAccess(session.stravaId, userData)
  const metaSnap = await metaRef(session.stravaId).get()
  const meta = metaSnap.exists ? serializeFirestoreValue(metaSnap.data()) : null
  const availableYears = getVisibleYears(scope, meta?.availableYears)
  const initialYear = availableYears[0]

  const initialSnap = await buildActivitiesQuery(activitiesRef(session.stravaId), initialYear, scope)
    .limit(160)
    .get()

  const initialActivities = initialSnap.docs.map((doc) => toDashboardActivity(doc.data()))

  return (
    <DashboardClient
      initialActivities={initialActivities}
      initialYear={initialYear}
      availableYears={availableYears}
      isAdmin={isAdmin}
      meta={{
        ...meta,
        viewerRole: scope.role,
        viewerPlan: getUserPlan(session.stravaId, userData),
        viewerAdmin: isAdmin,
        viewerScope: {
          years: scope.allowedYears,
          types: scope.allowedTypes,
          fullAccess: scope.fullAccess,
        },
      }}
      userName={session.user?.name ?? 'Atleta'}
    />
  )
}
