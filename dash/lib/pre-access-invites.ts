import { getDb } from '@/lib/firebase'
import { getPreAccessCodes, isAllowedPreAccessCode, isPreAccessEnabled, normalizePreAccessCode } from '@/lib/pre-access'

type ClaimInput = {
  code: string
  ip?: string | null
  userAgent?: string | null
}

type ClaimResult =
  | { ok: true; claimId: string; normalizedCode: string }
  | { ok: false; reason: 'invalid' | 'already-used' }

type BindResult =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'claimed-by-other-user' }

function inviteCodeRef(code: string) {
  return getDb().collection('_pre_access_codes').doc(code)
}

function inviteClaimRef(claimId: string) {
  return getDb().collection('_pre_access_claims').doc(claimId)
}

export async function claimPreAccessCode({ code, ip, userAgent }: ClaimInput): Promise<ClaimResult> {
  if (!isPreAccessEnabled()) {
    return { ok: true, claimId: 'open-access', normalizedCode: 'open-access' }
  }

  if (!isAllowedPreAccessCode(code)) {
    return { ok: false, reason: 'invalid' }
  }

  const normalizedCode = normalizePreAccessCode(code)
  const claimId = crypto.randomUUID()
  const claimedAt = new Date()
  const safeUserAgent = (userAgent ?? '').trim().slice(0, 240) || null
  const safeIp = (ip ?? '').trim().slice(0, 80) || null

  return getDb().runTransaction(async (transaction) => {
    const codeDocRef = inviteCodeRef(normalizedCode)
    const codeSnap = await transaction.get(codeDocRef)

    if (codeSnap.exists && codeSnap.data()?.claimId) {
      return { ok: false, reason: 'already-used' } as const
    }

    transaction.set(
      codeDocRef,
      {
        code: normalizedCode,
        claimId,
        claimedAt,
        claimedByIp: safeIp,
        claimedByUserAgent: safeUserAgent,
        availableInEnv: getPreAccessCodes().includes(normalizedCode),
        updatedAt: claimedAt,
      },
      { merge: true }
    )

    transaction.set(inviteClaimRef(claimId), {
      code: normalizedCode,
      claimId,
      claimedAt,
      claimedByIp: safeIp,
      claimedByUserAgent: safeUserAgent,
      updatedAt: claimedAt,
      usedByStravaId: null,
      oauthCompletedAt: null,
    })

    return { ok: true, claimId, normalizedCode } as const
  })
}

export async function bindPreAccessClaimToStravaUser(claimId: string, stravaId: number): Promise<BindResult> {
  if (!claimId || claimId === 'open-access') {
    return { ok: true }
  }

  return getDb().runTransaction(async (transaction) => {
    const claimDocRef = inviteClaimRef(claimId)
    const claimSnap = await transaction.get(claimDocRef)

    if (!claimSnap.exists) {
      return { ok: false, reason: 'missing' } as const
    }

    const data = claimSnap.data() ?? {}
    const currentOwner = Number(data.usedByStravaId ?? 0)
    if (currentOwner && currentOwner !== stravaId) {
      return { ok: false, reason: 'claimed-by-other-user' } as const
    }

    const now = new Date()
    const code = typeof data.code === 'string' ? data.code : ''

    transaction.set(
      claimDocRef,
      {
        usedByStravaId: stravaId,
        oauthCompletedAt: data.oauthCompletedAt ?? now,
        updatedAt: now,
      },
      { merge: true }
    )

    if (code) {
      transaction.set(
        inviteCodeRef(code),
        {
          usedByStravaId: stravaId,
          oauthCompletedAt: data.oauthCompletedAt ?? now,
          updatedAt: now,
        },
        { merge: true }
      )
    }

    return { ok: true } as const
  })
}
