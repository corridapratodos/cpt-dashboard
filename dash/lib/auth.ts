import type { AuthOptions } from 'next-auth'
import StravaProvider from 'next-auth/providers/strava'
import { getUserPlan, hasMasterAccess } from '@/lib/access'
import { isAdminBootstrapEnabled, isStravaLoginAllowed } from '@/lib/security'
import { getDb, userRef } from '@/lib/firebase'

export const authOptions: AuthOptions = {
  providers: [
    StravaProvider({
      clientId: process.env.STRAVA_CLIENT_ID!,
      clientSecret: process.env.STRAVA_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'read,profile:read_all,activity:read_all',
          approval_prompt: 'auto',
          response_type: 'code',
        },
      },
      profile(profile) {
        return {
          id: String(profile.id),
          name: [profile.firstname, profile.lastname].filter(Boolean).join(' ') || 'Atleta',
          email: `${profile.id}@strava.local`,
          image: profile.profile,
        }
      },
    }),
  ],

  callbacks: {
    async signIn({ profile }) {
      const stravaId = Number((profile as any)?.id)
      if (!Number.isFinite(stravaId) || !isStravaLoginAllowed(stravaId)) {
        return '/login?error=AccessDenied'
      }

      return true
    },
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token as string
        token.refreshToken = account.refresh_token as string
        token.expiresAt = account.expires_at as number
        token.stravaId = (profile as any)?.id as number

        if (token.stravaId && token.accessToken && token.refreshToken && token.expiresAt) {
          const ref = userRef(token.stravaId as number)
          const existingSnap = await ref.get()
          const existingData = existingSnap.exists ? existingSnap.data() : null
          let role = existingData?.role ?? null

          if (!role) {
            const masterAccess = hasMasterAccess(token.stravaId as number, existingData)

            if (masterAccess) {
              role = 'master'
            } else if (isAdminBootstrapEnabled()) {
              const totalUsers = (await getDb().collection('users').count().get()).data().count
              role = ((!existingData && totalUsers === 0) || (Boolean(existingData) && totalUsers === 1))
                ? 'admin'
                : 'user'
            } else {
              role = 'user'
            }
          }

          const plan = getUserPlan(token.stravaId as number, existingData ?? { role })

          await ref.set(
            {
              stravaId: token.stravaId,
              name:
                (profile as any)?.firstname && (profile as any)?.lastname
                  ? `${(profile as any).firstname} ${(profile as any).lastname}`
                  : token.name ?? null,
              profile: (profile as any)?.profile ?? token.picture ?? null,
              accessToken: token.accessToken,
              refreshToken: token.refreshToken,
              expiresAt: token.expiresAt,
              role,
              plan,
              createdAt: existingData?.createdAt ?? new Date(),
              updatedAt: new Date(),
            },
            { merge: true }
          )
        }
      }

      if (Date.now() < (token.expiresAt as number) * 1000) return token
      return refreshAccessToken(token)
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      session.stravaId = token.stravaId as number
      session.error = token.error as string | undefined
      return session
    },
  },
  pages: { signIn: '/login' },
}

async function refreshAccessToken(token: any) {
  try {
    const res = await fetch('https://www.strava.com/api/v3/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.STRAVA_CLIENT_ID ?? '',
        client_secret: process.env.STRAVA_CLIENT_SECRET ?? '',
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw data
    const refreshedToken = {
      ...token,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? token.refreshToken,
      expiresAt: data.expires_at,
    }

    if (refreshedToken.stravaId) {
      await userRef(refreshedToken.stravaId as number).set(
        {
          accessToken: refreshedToken.accessToken,
          refreshToken: refreshedToken.refreshToken,
          expiresAt: refreshedToken.expiresAt,
          updatedAt: new Date(),
        },
        { merge: true }
      )
    }

    return refreshedToken
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' }
  }
}

declare module 'next-auth' {
  interface Session {
    accessToken: string
    stravaId: number
    error?: string
  }
}
declare module 'next-auth/jwt' {
  interface JWT {
    accessToken: string
    refreshToken: string
    expiresAt: number
    stravaId: number
    error?: string
  }
}
