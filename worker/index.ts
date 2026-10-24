import { Hono } from 'hono'
import { MAX_AI_INPUT, MAX_TITLE, STATUSES, type Status, type Task } from '../shared/types'
import { splitIntoTasks } from './ai'
import { auth } from './auth'
import type { AppEnv } from './env'
import { getSessionUser } from './session'

const app = new Hono<AppEnv>()

// CSRF: state-changing requests must come from our own origin.
app.use('*', async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const origin = c.req.header('origin')
    if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: 'bad origin' }, 403)
  }
  await next()
})

app.route('/auth', auth)

app.get('/api/me', async (c) => c.json({ user: await getSessionUser(c) }))

const api = new Hono<AppEnv>()

api.use('*', async (c, next) => {
  const user = await getSessionUser(c)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  c.set('user', user)
  await next()
})

interface TaskRow {
  id: string
  title: string
  status: Status
  created_at: number
  updated_at: number
}

const toTask = (r: TaskRow): Task => ({
  id: r.id,
  title: r.title,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

api.get('/tasks', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, title, status, created_at, updated_at FROM tasks WHERE user_id = ? AND deleted = 0 ORDER BY updated_at DESC LIMIT 2000',
  )
    .bind(c.get('user').id)
    .all<TaskRow>()
  return c.json({ tasks: results.map(toTask) })
})

const ID_RE = /^[A-Za-z0-9-]{8,64}$/

// Idempotent upsert so the client's offline outbox can safely retry.
// Last write wins by updatedAt; rows owned by another user are never touched.
api.put('/tasks/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<Partial<Task>>().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, MAX_TITLE) : ''
  const status = body?.status
  const createdAt = Number(body?.createdAt)
  const updatedAt = Number(body?.updatedAt)
  if (!ID_RE.test(id) || !title || !STATUSES.includes(status as Status) || !createdAt || !updatedAt) {
    return c.json({ error: 'invalid task' }, 400)
  }
  await c.env.DB.prepare(
    `INSERT INTO tasks (id, user_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, status = excluded.status, updated_at = excluded.updated_at
     WHERE tasks.user_id = excluded.user_id AND tasks.deleted = 0 AND excluded.updated_at >= tasks.updated_at`,
  )
    .bind(id, c.get('user').id, title, status, createdAt, updatedAt)
    .run()
  return c.json({ ok: true })
})

api.delete('/tasks/:id', async (c) => {
  await c.env.DB.prepare('UPDATE tasks SET deleted = 1, updated_at = ? WHERE id = ? AND user_id = ?')
    .bind(Date.now(), c.req.param('id'), c.get('user').id)
    .run()
  return c.json({ ok: true })
})

api.post('/ai/split', async (c) => {
  const body = await c.req.json<{ text?: unknown }>().catch(() => null)
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) return c.json({ error: 'empty' }, 400)
  if (text.length > MAX_AI_INPUT) return c.json({ error: 'too long' }, 413)
  return c.json(await splitIntoTasks(c.env, text))
})

app.route('/api', api)

export default app
