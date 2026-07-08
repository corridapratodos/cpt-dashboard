import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import DashboardClient from '@/components/DashboardClient'
import LegalGate from '@/components/LegalGate'
import { getUserPlan, getUserScope, hasAcceptedLegal, hasAdminAccess, parseStoredDate } from '@/lib/access'
import { applyScopeToYearAnalytics, loadYearAnalyticsFromCache } from '@/lib/activity-analytics'
import { authOptions } from '@/lib/auth'
import {
  buildActivitiesQuery,
  buildSyncSummary,
  getVisibleYears,
  mergeAvailableYears,
  serializeFirestoreValue,
  toDashboardActivity,
} from '@/lib/dashboard'
import {
  listYearCacheIndexes,
  loadYearActivitiesFromCache,
  summarizeYearCacheIndexes,
} from '@/lib/activity-cache'
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
  const cacheIndexes = await listYearCacheIndexes(session.stravaId)
  const cacheSummary = summarizeYearCacheIndexes(cacheIndexes)

  const mergedKnownYears = mergeAvailableYears(
    Array.isArray(meta?.availableYears) ? meta.availableYears.map(String) : [],
    cacheSummary.availableYears,
  )

  let availableYears = getVisibleYears(scope, mergedKnownYears)

  const lastRepairAttemptAt = parseStoredDate(meta?.metadataRepairAttemptedAt)
  const verifiedYearSpanCount = Number(meta?.metadataYearSpanVerifiedCount ?? 0)
  const shouldRepairYears =
    scope.fullAccess &&
    Number(meta?.totalActivities ?? 0) > 0 &&
    availableYears.length <= 1 &&
    (
      verifiedYearSpanCount !== availableYears.length ||
      !lastRepairAttemptAt ||
      Date.now() - lastRepairAttemptAt.getTime() >= METADATA_REPAIR_COOLDOWN_MS
    )

  if (shouldRepairYears) {
    if (cacheSummary.availableYears.length > 1) {
      availableYears = cacheSummary.availableYears
      meta = {
        ...meta,
        availableYears: cacheSummary.availableYears,
        totalActivities: cacheSummary.totalActivities,
        totalRuns: cacheSummary.totalRuns,
        totalsByType: cacheSummary.totalsByType,
        newestActivityAt: cacheSummary.newestActivityAt,
        metadataYearSpanVerifiedCount: cacheSummary.availableYears.length,
      }

      await metaRef(session.stravaId).set(
        {
          availableYears: cacheSummary.availableYears,
          totalActivities: cacheSummary.totalActivities,
          totalRuns: cacheSummary.totalRuns,
          totalsByType: cacheSummary.totalsByType,
          newestActivityAt: cacheSummary.newestActivityAt,
          metadataRepairedAt: new Date(),
          metadataRepairAttemptedAt: new Date(),
          metadataYearSpanVerifiedAt: new Date(),
          metadataYearSpanVerifiedCount: cacheSummary.availableYears.length,
        },
        { merge: true }
      )
    } else {
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
          metadataYearSpanVerifiedCount: repairSummary.availableYears.length,
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
            metadataYearSpanVerifiedAt: new Date(),
            metadataYearSpanVerifiedCount: repairSummary.availableYears.length,
          },
          { merge: true }
        )
      } else {
        await metaRef(session.stravaId).set(
          {
            metadataRepairAttemptedAt: new Date(),
            metadataYearSpanVerifiedAt: new Date(),
            metadataYearSpanVerifiedCount: 0,
          },
          { merge: true }
        )
      }
    }
  }

  const initialYear = availableYears[0]

  let initialActivities: Array<ReturnType<typeof toDashboardActivity>> = []
  if (initialYear !== 'all') {
    const cachedInitialYear = await loadYearActivitiesFromCache(session.stravaId, initialYear)
    if (cachedInitialYear) {
      initialActivities = cachedInitialYear.activities.slice(0, 160)
    }
  }

  if (!initialActivities.length) {
    const initialSnap = await buildActivitiesQuery(activitiesRef(session.stravaId), initialYear, scope)
      .limit(160)
      .get()

    initialActivities = initialSnap.docs.map((doc) => toDashboardActivity(doc.data()))
  }

  const rawInitialAnalytics = initialYear !== 'all'
    ? await loadYearAnalyticsFromCache(session.stravaId, initialYear)
    : null
  const initialAnalytics = rawInitialAnalytics ? applyScopeToYearAnalytics(rawInitialAnalytics, scope) : null

  return (
    <DashboardClient
      initialActivities={initialActivities}
      initialAnalytics={initialAnalytics}
      initialYear={initialYear}
      availableYears={availableYears}
      isAdmin={isAdmin}
      meta={{
        ...meta,
        viewerRole: scope.role,
        viewerPlan: getUserPlan(session.stravaId, userData),
        viewerAdmin: isAdmin,
        viewerStravaId: session.stravaId,
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
