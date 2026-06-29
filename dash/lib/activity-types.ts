export type BestEffort = {
  name: string
  distanceKm: number
  elapsedSec: number
  movingSec: number | null
}

export type StoredBestEffort = BestEffort

export const RUN_LIKE_ACTIVITY_TYPES = ['Run', 'TrailRun', 'VirtualRun'] as const

export function isRunLikeType(type: string) {
  return RUN_LIKE_ACTIVITY_TYPES.includes(type as (typeof RUN_LIKE_ACTIVITY_TYPES)[number])
}
