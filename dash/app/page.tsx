import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import DashboardClient from '@/components/DashboardClient'
import LegalGate from '@/components/LegalGate'
import { getUserPlan, getUserScope, hasAcceptedLegal, hasAdminAccess, parseStoredDate } from '@/lib/access'
import { authOptions } from '@/lib/auth'
import {
  buildActivitiesQuery,
  buildSyncSummary,
  getVisibleYears,
  serializeFirestoreValue,
  toDashboardActivity,
} from '@/lib/dashboard'
import { activitiesRef, metaRef, userRef } from '@/lib/firebase'

export const revalidate = 0

const METADATA_REPAIR_COOLDOWN_MS = 24 * 60 * 60 * 1000

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
  let meta = metaSnap.exists ? serializeFirestoreValue(metaSnap.data()) : null
  let availableYears = getVisibleYears(scope, meta?.availableYears)
  const lastRepairAttemptAt = parseStoredDate(meta?.metadataRepairAttemptedAt)
  const shouldRepairYears =
    scope.fullAccess &&
    Number(meta?.totalActivities ?? 0) > 0 &&
    availableYears.length <= 1 &&
    (!lastRepairAttemptAt || Date.now() - lastRepairAttemptAt.getTime() >= METADATA_REPAIR_COOLDOWN_MS)

  if (shouldRepairYears) {
    const repairSnap = await activitiesRef(session.stravaId).orderBy('date', 'desc').get()
    const repairActivities = repairSnap.docs.map((doc) => toDashboardActivity(doc.data()))
    const repairSummary = buildSyncSummary(repairActivities)

    if (repairSummary.availableYears.length) {
      availableYears = repairSummary.availableYears
      meta = {
        ...meta,
        availableYears: repairSummary.availableYears,
        totalActivities: repairSummary.totalActivities,
        totalRuns: repairSummary.totalRuns,
        totalsByType: repairSummary.totalsByType,
        newestActivityAt: repairSummary.newestActivityAt,
      }

      await metaRef(session.stravaId).set(
        {
          availableYears: repairSummary.availableYears,
          totalActivities: repairSummary.totalActivities,
          totalRuns: repairSummary.totalRuns,
          totalsByType: repairSummary.totalsByType,
          newestActivityAt: repairSummary.newestActivityAt,
          metadataRepairedAt: new Date(),
          metadataRepairAttemptedAt: new Date(),
        },
        { merge: true }
      )
    } else {
      await metaRef(session.stravaId).set(
        {
          metadataRepairAttemptedAt: new Date(),
        },
        { merge: true }
      )
    }
  }

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

