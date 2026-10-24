import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AppEnv } from './env'
import { createSession, destroySession, isHttps, randomToken, sha256, upsertUser } from './session'

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'

export const auth = new Hono<AppEnv>()

auth.get('/google', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID
  if (!clientId) return c.text('GOOGLE_CLIENT_ID is not configured', 500)

  const state = randomToken(16)
  const verifier = randomToken(32)
  const cookie = { httpOnly: true, secure: isHttps(c), sameSite: 'Lax' as const, path: '/auth', maxAge: 600 }
  setCookie(c, 'oauth_state', state, cookie)
  setCookie(c, 'oauth_verifier', verifier, cookie)

  const url = new URL(GOOGLE_AUTH)
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: new URL('/auth/callback', c.req.url).toString(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: await sha256(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString()
  return c.redirect(url.toString())
})

auth.get('/callback', async (c) => {
  const { code, state } = c.req.query()
  const savedState = getCookie(c, 'oauth_state')
  const verifier = getCookie(c, 'oauth_verifier')
  deleteCookie(c, 'oauth_state', { path: '/auth' })
  deleteCookie(c, 'oauth_verifier', { path: '/auth' })
  if (!code || !state || !savedState || state !== savedState || !verifier) return c.redirect('/?login=failed')

  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID!,
      client_secret: c.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: new URL('/auth/callback', c.req.url).toString(),
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  })
  if (!res.ok) return c.redirect('/?login=failed')

  // The ID token comes straight from Google's token endpoint over TLS, so per
  // Google's guidance its claims can be trusted without verifying the signature.
  const { id_token } = await res.json<{ id_token: string }>()
  const claims = decodeJwt(id_token)
  const validIss = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com'
  if (!validIss || claims.aud !== c.env.GOOGLE_CLIENT_ID || claims.exp * 1000 < Date.now() || !claims.email_verified) {
    return c.redirect('/?login=failed')
  }

  const userId = await upsertUser(c.env, {
    sub: claims.sub,
    email: claims.email,
    name: claims.name ?? '',
    picture: claims.picture ?? '',
  })
  await createSession(c, userId)
  return c.redirect('/')
})

// Local-only login used by the E2E tests. Requires DEV_AUTH=1 (set in .dev.vars,
// never deployed) and a localhost host, so it cannot be reached in production.
auth.get('/dev', async (c) => {
  const host = new URL(c.req.url).hostname
  if (c.env.DEV_AUTH !== '1' || !['localhost', '127.0.0.1'].includes(host)) return c.notFound()
  const name = c.req.query('name') || 'Dev User'
  const userId = await upsertUser(c.env, { sub: `dev:${name}`, email: 'dev@localhost', name, picture: '' })
  await createSession(c, userId)
  return c.redirect('/')
})

auth.post('/logout', async (c) => {
  await destroySession(c)
  return c.json({ ok: true })
})

interface GoogleClaims {
  iss: string
  aud: string
  sub: string
  exp: number
  email: string
  email_verified: boolean
  name?: string
  picture?: string
}

function decodeJwt(token: string): GoogleClaims {
  const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  const bytes = Uint8Array.from(atob(payload), (ch) => ch.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

