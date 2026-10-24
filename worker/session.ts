import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { User } from '../shared/types'
import type { AppEnv, Env } from './env'

export const SESSION_COOKIE = 'sid'
const SESSION_TTL_SEC = 60 * 60 * 24 * 30

export function randomToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes))
  return base64url(buf)
}

export function base64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function sha256(input: string): Promise<string> {
  return base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)))
}

export function isHttps(c: Context): boolean {
  return new URL(c.req.url).protocol === 'https:'
}

export async function createSession(c: Context<AppEnv>, userId: string) {
  const token = randomToken()
  const expiresAt = Date.now() + SESSION_TTL_SEC * 1000
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), userId, expiresAt)
    .run()
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isHttps(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SEC,
  })
}

export async function getSessionUser(c: Context<AppEnv>): Promise<User | null> {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return null
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.picture, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
  )
    .bind(await sha256(token))
    .first<User & { expires_at: number }>()
  if (!row || row.expires_at < Date.now()) return null
  return { id: row.id, email: row.email, name: row.name, picture: row.picture }
}

export async function destroySession(c: Context<AppEnv>) {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

export async function upsertUser(
  env: Env,
  p: { sub: string; email: string; name: string; picture: string },
): Promise<string> {
  const row = await env.DB.prepare(
    `INSERT INTO users (id, google_sub, email, name, picture, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture
     RETURNING id`,
  )
    .bind(crypto.randomUUID(), p.sub, p.email, p.name, p.picture, Date.now())
    .first<{ id: string }>()
  return row!.id
}
