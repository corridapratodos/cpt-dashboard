import { NextResponse } from 'next/server'
import {
  PRE_ACCESS_COOKIE_MAX_AGE,
  PRE_ACCESS_COOKIE_NAME,
  createPreAccessCookieValue,
  isAllowedPreAccessCode,
  isPreAccessEnabled,
} from '@/lib/pre-access'

function normalizeNext(value: unknown) {
  if (typeof value !== 'string') return '/login'
  if (!value.startsWith('/') || value.startsWith('//')) return '/login'
  return value
}

export async function POST(req: Request) {
  if (!isPreAccessEnabled()) {
    return NextResponse.json({ ok: true, next: '/login' })
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
