import type { Activity } from './types'
import { ActivityDetailModal } from './ActivityDetailModal'
import { useActivityDetail } from './useActivityDetail'

type ActivityDetailDialogProps = {
  activity: Activity | null
  canViewActivitySplits: boolean
  setSyncMsg: (msg: string) => void
  onActivityUpdated: (updated: Activity) => void
  onClose: () => void
}

export function ActivityDetailDialog({
  activity,
  canViewActivitySplits,
  setSyncMsg,
  onActivityUpdated,
  onClose,
}: ActivityDetailDialogProps) {
  const detail = useActivityDetail({
    activity,
    canViewSplits: canViewActivitySplits,
    onActivityUpdated,
    setSyncMsg,
  })

  if (!detail.selectedActivity) return null

  return (
    <ActivityDetailModal
      activity={detail.selectedActivity}
      splits={detail.splits}
      interpretation={detail.interpretation}
      splitsLoading={detail.loading}
      splitsError={detail.error}
      canViewSplits={canViewActivitySplits}
      reviewing={detail.reviewing}
      onClose={onClose}
      onToggleExclusion={detail.toggleExclusion}
    />
  )
}
