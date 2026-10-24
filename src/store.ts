import { useSyncExternalStore } from 'react'
import type { Status, Task, User } from '../shared/types'

type Op = { kind: 'put'; task: Task } | { kind: 'del'; id: string }

export interface State {
  tasks: Task[]
  user: User | null
  /** True until we know who the user is (first visit with no cache). */
  booting: boolean
  online: boolean
  aiBusy: boolean
}

const K = { tasks: 'ft.tasks', outbox: 'ft.outbox', user: 'ft.user' }

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or blocked: keep running in memory */
  }
}

const cachedUser = load<User | null>(K.user, null)
let outbox: Op[] = load<Op[]>(K.outbox, [])
let state: State = {
  tasks: load<Task[]>(K.tasks, []),
  user: cachedUser,
  booting: cachedUser === null && load<Task[]>(K.tasks, []).length === 0,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  aiBusy: false,
}

const listeners = new Set<() => void>()

function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  if ('tasks' in patch) save(K.tasks, state.tasks)
  if ('user' in patch) save(K.user, state.user)
  listeners.forEach((l) => l())
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => selector(state),
  )
}

export const getState = () => state

// ---------- mutations (local first, then queued for the server) ----------

function enqueue(op: Op) {
  const id = op.kind === 'put' ? op.task.id : op.id
  outbox = outbox.filter((o) => (o.kind === 'put' ? o.task.id : o.id) !== id)
  outbox.push(op)
  save(K.outbox, outbox)
  scheduleFlush()
}

function upsertLocal(task: Task) {
  set({ tasks: [task, ...state.tasks.filter((t) => t.id !== task.id)] })
  enqueue({ kind: 'put', task })
}

export function addTask(title: string, status: Status = 'todo'): Task {
  const now = Date.now()
  const task: Task = { id: crypto.randomUUID(), title: title.trim(), status, createdAt: now, updatedAt: now }
  upsertLocal(task)
  return task
}

export function addTasks(titles: string[]) {
  // Keep the given order on screen: the first title ends up on top.
  const base = Date.now()
  titles
    .slice()
    .reverse()
    .forEach((title, i) => {
      const t = base + i
      upsertLocal({ id: crypto.randomUUID(), title, status: 'todo', createdAt: t, updatedAt: t })
    })
}

export function updateTask(id: string, patch: Partial<Pick<Task, 'title' | 'status'>>) {
  const cur = state.tasks.find((t) => t.id === id)
  if (!cur) return
  upsertLocal({ ...cur, ...patch, updatedAt: Math.max(Date.now(), cur.updatedAt + 1) })
}

export function removeTask(id: string): Task | undefined {
  const cur = state.tasks.find((t) => t.id === id)
  set({ tasks: state.tasks.filter((t) => t.id !== id) })
  enqueue({ kind: 'del', id })
  return cur
}

/** Undo for a delete: re-create the task with a fresh id (the old row is tombstoned). */
export function restoreTask(task: Task) {
  upsertLocal({ ...task, id: crypto.randomUUID(), updatedAt: Date.now() })
}

// ---------- sync ----------

let flushing = false
let flushTimer: ReturnType<typeof setTimeout> | undefined

function scheduleFlush(delay = 0) {
  clearTimeout(flushTimer)
  flushTimer = setTimeout(() => void flush(), delay)
}

async function flush() {
  if (flushing || !state.user || outbox.length === 0) return
  flushing = true
  try {
    while (outbox.length > 0) {
      const op = outbox[0]
      const res =
        op.kind === 'put'
          ? await fetch(`/api/tasks/${op.task.id}`, {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(op.task),
            })
          : await fetch(`/api/tasks/${op.id}`, { method: 'DELETE' })
      if (res.status === 401) {
        set({ user: null })
        return
      }
      // 4xx other than 401 means the op itself is bad: drop it instead of retrying forever.
      if (!res.ok && res.status < 500) console.warn('dropping op', op, res.status)
      else if (!res.ok) throw new Error(`sync ${res.status}`)
      if (outbox[0] === op) outbox.shift()
      else outbox = outbox.filter((o) => o !== op)
      save(K.outbox, outbox)
    }
    set({ online: true })
  } catch {
    set({ online: navigator.onLine })
    scheduleFlush(5000)
  } finally {
    flushing = false
  }
}

async function pull() {
  if (!state.user) return
  const res = await fetch('/api/tasks')
  if (res.status === 401) return set({ user: null })
  if (!res.ok) return
  const { tasks } = (await res.json()) as { tasks: Task[] }
  // Server is the source of truth, except for tasks with changes still in the outbox.
  const pending = new Map<string, Op>()
  for (const op of outbox) pending.set(op.kind === 'put' ? op.task.id : op.id, op)
  const merged = tasks.filter((t) => !pending.has(t.id))
  for (const op of pending.values()) if (op.kind === 'put') merged.push(op.task)
  set({ tasks: merged })
}

export async function sync() {
  try {
    await flush()
    await pull()
    await flush()
  } catch {
    set({ online: false })
  }
}

export async function boot() {
  try {
    const res = await fetch('/api/me')
    const { user } = (await res.json()) as { user: User | null }
    if (user && cachedUser && user.id !== cachedUser.id) {
      // Different account on this device: drop the previous account's cache.
      outbox = []
      save(K.outbox, outbox)
      set({ tasks: [] })
    }
    set({ user })
    await sync()
  } catch {
    set({ online: false })
  } finally {
    set({ booting: false })
  }
}

export async function logout() {
  await fetch('/auth/logout', { method: 'POST' }).catch(() => undefined)
  clearLocal()
}

export async function deleteAccount(): Promise<boolean> {
  const res = await fetch('/api/me', { method: 'DELETE' }).catch(() => null)
  if (!res?.ok) return false
  clearLocal()
  return true
}

function clearLocal() {
  outbox = []
  save(K.outbox, outbox)
  set({ user: null, tasks: [] })
}

export async function aiSplit(text: string): Promise<string[]> {
  set({ aiBusy: true })
  try {
    const res = await fetch('/api/ai/split', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (res.status === 401) {
      set({ user: null })
      throw new Error('unauthorized')
    }
    if (!res.ok) throw new Error(`ai ${res.status}`)
    const { tasks } = (await res.json()) as { tasks: string[] }
    return tasks
  } finally {
    set({ aiBusy: false })
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    set({ online: true })
    void sync()
  })
  window.addEventListener('offline', () => set({ online: false }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sync()
  })
}
