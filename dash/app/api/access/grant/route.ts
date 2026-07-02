import { NextRequest, NextResponse } from 'next/server'
import {
  PRE_ACCESS_COOKIE_MAX_AGE,
  PRE_ACCESS_COOKIE_NAME,
  createPreAccessCookieValue,
  isAllowedPreAccessCode,
  isPreAccessEnabled,
} from '@/lib/pre-access'
import { consumeRateLimit } from '@/lib/rate-limit'

function normalizeNext(value: unknown) {
  if (typeof value !== 'string') return '/login'
  if (!value.startsWith('/') || value.startsWith('//')) return '/login'
  return value
}

function getClientIp(req: NextRequest) {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown'
  return req.headers.get('x-real-ip')?.trim() ?? 'unknown'
}

export async function POST(req: NextRequest) {
  if (!isPreAccessEnabled()) {
    return NextResponse.json({ ok: true, next: '/login' })
  }

  const ip = getClientIp(req).replace(/[^a-zA-Z0-9:._-]/g, '_')
  const limit = await consumeRateLimit({
    key: `pre-access:${ip}`,
    maxAttempts: 8,
    windowMs: 15 * 60 * 1000,
  })

  if (!limit.allowed) {
    return NextResponse.json({ error: `Muitas tentativas. Tente novamente em ${limit.retryAfterSec}s.` }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const code = typeof body?.code === 'string' ? body.code : ''

  if (!isAllowedPreAccessCode(code)) {
    return NextResponse.json({ error: 'Codigo invalido.' }, { status: 401 })
  }

  const response = NextResponse.json({
    ok: true,
    next: normalizeNext(body?.next),
  })

  response.cookies.set({
    name: PRE_ACCESS_COOKIE_NAME,
    value: await createPreAccessCookieValue(),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: PRE_ACCESS_COOKIE_MAX_AGE,
  })

  return response
}
