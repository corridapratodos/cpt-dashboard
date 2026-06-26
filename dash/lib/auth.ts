import type { AuthOptions } from 'next-auth'
import { userRef } from '@/lib/firebase'

export const authOptions: AuthOptions = {
  providers: [
    {
      id: 'strava',
      name: 'Strava',
      type: 'oauth',
      authorization: {
        url: 'https://www.strava.com/oauth/authorize',
        params: { scope: 'activity:read_all,read', response_type: 'code' },
      },
      token: 'https://www.strava.com/oauth/token',
      userinfo: 'https://www.strava.com/api/v3/athlete',
      clientId: process.env.STRAVA_CLIENT_ID!,
      clientSecret: process.env.STRAVA_CLIENT_SECRET!,
      profile(profile) {
        return {
          id: String(profile.id),
          name: `${profile.firstname} ${profile.lastname}`,
          email: profile.email ?? `${profile.id}@strava.local`,
          image: profile.profile,
        }
      },
    },
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token as string
        token.refreshToken = account.refresh_token as string
        token.expiresAt = account.expires_at as number
        token.stravaId = (profile as any)?.id as number

        if (token.stravaId && token.accessToken && token.refreshToken && token.expiresAt) {
          await userRef(token.stravaId as number).set(
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
              updatedAt: new Date(),
            },
            { merge: true }
          )
        }
      }
      // Token ainda válido
      if (Date.now() < (token.expiresAt as number) * 1000) return token
      // Renovar
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
    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
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

// Extensão de tipos
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
