import { parseStoredDate } from '@/lib/access'
import { getDb } from '@/lib/firebase'

export type RateLimitOptions = {
  key: string
  maxAttempts: number
  windowMs: number
}

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSec: number
}

export async function consumeRateLimit({ key, maxAttempts, windowMs }: RateLimitOptions): Promise<RateLimitResult> {
  const ref = getDb().collection('_rate_limits').doc(key)
  const snap = await ref.get()
  const now = Date.now()

  const currentCount = snap.exists ? Number(snap.data()?.count ?? 0) : 0
  const resetAtDate = snap.exists ? parseStoredDate(snap.data()?.resetAt) : null
  const resetAtMs = resetAtDate?.getTime() ?? 0
  const windowActive = resetAtMs > now

  if (windowActive && currentCount >= maxAttempts) {
    const retryAfterSec = Math.max(1, Math.ceil((resetAtMs - now) / 1000))
    return { allowed: false, remaining: 0, retryAfterSec }
  }

  const nextCount = windowActive ? currentCount + 1 : 1
  const nextResetAt = windowActive ? resetAtMs : now + windowMs

  await ref.set(
    {
      count: nextCount,
      resetAt: new Date(nextResetAt),
      updatedAt: new Date(now),
    },
    { merge: true }
  )

  return {
    allowed: true,
    remaining: Math.max(0, maxAttempts - nextCount),
    retryAfterSec: Math.max(1, Math.ceil((nextResetAt - now) / 1000)),
  }
}
