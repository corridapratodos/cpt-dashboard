import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { PRE_ACCESS_COOKIE_NAME, isPreAccessEnabled, isValidPreAccessCookieValue } from '@/lib/pre-access'

const PUBLIC_PATHS = ['/access', '/privacy', '/terms']
const PUBLIC_API_PREFIXES = ['/api/access/grant', '/api/strava/webhook']
const STATIC_PREFIXES = ['/_next', '/favicon.ico', '/robots.txt', '/sitemap.xml']

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.includes(pathname)
}

function isPublicApi(pathname: string) {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function isStaticAsset(pathname: string) {
  return STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export async function middleware(req: NextRequest) {
  if (!isPreAccessEnabled()) {
    return NextResponse.next()
  }

  const { pathname, search } = req.nextUrl

  if (isStaticAsset(pathname) || isPublicPath(pathname) || isPublicApi(pathname)) {
    return NextResponse.next()
  }

  const granted = await isValidPreAccessCookieValue(req.cookies.get(PRE_ACCESS_COOKIE_NAME)?.value)
  if (granted) {
    return NextResponse.next()
  }

  const nextUrl = req.nextUrl.clone()
  nextUrl.pathname = '/access'
  nextUrl.searchParams.set('next', `${pathname}${search}`)
  return NextResponse.redirect(nextUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
