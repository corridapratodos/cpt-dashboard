import { normalizeTextValue } from '@/lib/text'
import { isRunLikeType, type StoredBestEffort } from '@/lib/activity-types'
import type { ActivitySplit } from '@/components/dashboard/types'

const TRACKED_BEST_EFFORTS_KM = [3, 5, 10, 15, 21.1, 30]
export const BEST_EFFORT_FETCH_LIMIT = {
  incremental: 24,
  full: 80,
} as const
const BEST_EFFORT_CONCURRENCY = 4

// Busca atividades do atleta com suporte a sync incremental por data
export async function fetchActivities(accessToken: string, after?: number) {
  const activities: any[] = []
  let page = 1

  while (true) {
    const params = new URLSearchParams({
      per_page: '200',
      page: String(page),
    })

    if (after) params.set('after', String(after))

    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!res.ok) throw new Error(`Strava API error: ${res.status}`)

    const batch = await res.json()
    if (!batch.length) break

    activities.push(...batch)
    page++
  }

  return activities
}

export async function fetchAllActivities(accessToken: string) {
  return fetchActivities(accessToken)
}

// Busca atividade individual (para best efforts/splits)
export async function fetchActivity(accessToken: string, id: number) {
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${id}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!res.ok) throw new Error(`Strava API error: ${res.status}`)

  return res.json()
}


export function extractActivitySplits(activity: any): ActivitySplit[] {
  if (!Array.isArray(activity?.splits_metric)) return []

  return activity.splits_metric
    .map((split: any, index: number) => {
      const distanceMeters = Number(split?.distance ?? 0)
      const elapsedSec = Number(split?.elapsed_time ?? 0)
      const movingSec = split?.moving_time == null ? null : Number(split.moving_time)
      const distanceKm = distanceMeters / 1000
      const basisSec = movingSec != null && Number.isFinite(movingSec) && movingSec > 0 ? movingSec : elapsedSec
      const paceSec = distanceKm > 0 && Number.isFinite(basisSec) && basisSec > 0 ? Math.round(basisSec / distanceKm) : null
      const elevationGain = split?.elevation_difference == null ? null : Number(split.elevation_difference)
      const hrAvg = split?.average_heartrate == null ? null : Number(split.average_heartrate)

      if (!Number.isFinite(distanceKm) || distanceKm <= 0) return null
      if (!Number.isFinite(elapsedSec) || elapsedSec <= 0) return null

      return {
        index: index + 1,
        distanceKm: Number(distanceKm.toFixed(2)),
        elapsedSec,
        movingSec: movingSec != null && Number.isFinite(movingSec) && movingSec > 0 ? movingSec : null,
        paceSec,
        elevationGain: elevationGain != null && Number.isFinite(elevationGain) ? elevationGain : null,
        hrAvg: hrAvg != null && Number.isFinite(hrAvg) ? hrAvg : null,
      }
    })
    .filter((split: ActivitySplit | null): split is ActivitySplit => split != null)
}

function getBestEffortTolerance(targetKm: number) {
  if (targetKm <= 5) return 0.2
  if (targetKm <= 10) return 0.35
  if (targetKm <= 21.1) return 0.5
  return 0.75
}

function isTrackedBestEffort(distanceKm: number) {
  return TRACKED_BEST_EFFORTS_KM.some((targetKm) => Math.abs(distanceKm - targetKm) <= getBestEffortTolerance(targetKm))
}

export function extractBestEfforts(activity: any): StoredBestEffort[] {
  if (!Array.isArray(activity?.best_efforts)) return []

  return activity.best_efforts
    .map((effort: any) => {
      const distanceKm = Number(effort?.distance ?? 0) / 1000
      const elapsedSec = Number(effort?.elapsed_time ?? 0)
      const movingSec = effort?.moving_time == null ? null : Number(effort.moving_time)

      if (!Number.isFinite(distanceKm) || distanceKm <= 0) return null
      if (!Number.isFinite(elapsedSec) || elapsedSec <= 0) return null
      if (!isTrackedBestEffort(distanceKm)) return null

      return {
        name: String(normalizeTextValue(effort?.name) ?? `${distanceKm.toFixed(1)} km`),
        distanceKm: Number(distanceKm.toFixed(2)),
        elapsedSec,
        movingSec: movingSec != null && Number.isFinite(movingSec) && movingSec > 0 ? movingSec : null,
      }
    })
    .filter((effort: StoredBestEffort | null): effort is StoredBestEffort => effort != null)
}

function shouldFetchBestEfforts(activity: any) {
  const type = String(activity?.type ?? '')
  const distanceKm = Number(activity?.distance ?? 0) / 1000
  const movingTime = Number(activity?.moving_time ?? 0)

  return isRunLikeType(type) && distanceKm >= 3 && movingTime >= 20 * 60
}

export async function fetchBestEffortsForActivities(
  accessToken: string,
  activities: any[],
  mode: 'incremental' | 'full',
  withoutEfforts?: Set<number>
) {
  const eligible = activities.filter(shouldFetchBestEfforts)

  // Prioriza atividades sem best efforts salvos, depois as demais por data desc
  const prioritized = withoutEfforts && withoutEfforts.size > 0
    ? [
        ...eligible.filter((a) => withoutEfforts.has(Number(a.id))),
        ...eligible.filter((a) => !withoutEfforts.has(Number(a.id))),
      ]
    : eligible

  const limited = prioritized.slice(0, BEST_EFFORT_FETCH_LIMIT[mode])
  const byActivityId = new Map<number, StoredBestEffort[]>()
  const workerCount = Math.min(BEST_EFFORT_CONCURRENCY, limited.length)
  const workerBatches = Array.from({ length: workerCount }, () => [] as typeof limited)

  limited.forEach((activity, index) => {
    workerBatches[index % workerCount]?.push(activity)
  })

  await Promise.all(
    workerBatches.map(async (batch) => {
      for (const current of batch) {
        try {
          const detail = await fetchActivity(accessToken, Number(current.id))
          const bestEfforts = extractBestEfforts(detail)
          if (bestEfforts.length) {
            byActivityId.set(Number(current.id), bestEfforts)
          }
        } catch {
          // Best effort backfill e oportunistico; falhas nao bloqueiam o sync principal.
        }
      }
    })
  )

  return {
    byActivityId,
    eligibleCount: eligible.length,
    fetchedCount: limited.length,
    enrichedCount: byActivityId.size,
    remainingCount: Math.max(eligible.length - limited.length, 0),
  }
}

// Filtro de corrida valida para a lente principal do produto
export function isRealRun(a: any): boolean {
  if (a.type !== 'Run') return false

  const distKm = a.distance / 1000
  const durationMin = a.moving_time / 60

  if (distKm < 2 || durationMin < 20) return false

  const paceSec = a.moving_time / distKm
  return paceSec >= 270 && paceSec <= 600
}

// Normaliza atividade para o schema do Firestore
export function mapActivity(a: any, options?: { bestEfforts?: StoredBestEffort[] }) {
  const distKm = a.distance / 1000
  const paceSec = distKm > 0 ? Math.round(a.moving_time / distKm) : null

  return {
    stravaId: a.id,
    name: String(normalizeTextValue(a.name) ?? 'Atividade'),
    date: new Date(a.start_date),
    distanceKm: parseFloat(distKm.toFixed(2)),
    durationSec: a.moving_time,
    paceSec,
    hrAvg: a.average_heartrate ?? null,
    hrMax: a.max_heartrate ?? null,
    elevationGain: a.total_elevation_gain ?? 0,
    kudos: a.kudos_count ?? 0,
    type: a.type,
    syncedAt: new Date(),
    ...(options?.bestEfforts ? { bestEfforts: options.bestEfforts } : {}),
  }
}
