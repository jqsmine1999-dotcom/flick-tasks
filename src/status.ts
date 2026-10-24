import type { Status } from '../shared/types'

export const STATUS_META: Record<Status, { label: string; color: string }> = {
  todo: { label: '未着手', color: 'var(--todo)' },
  doing: { label: '進行中', color: 'var(--doing)' },
  done: { label: '完了', color: 'var(--done)' },
}

export type FlickAction = { kind: 'status'; to: Status } | { kind: 'delete' }
export type Dir = 'left' | 'right'

/** Right = forward, left = back. Past either end of the flow means delete. */
export const FLICK: Record<Status, Record<Dir, FlickAction>> = {
  todo: { right: { kind: 'status', to: 'doing' }, left: { kind: 'delete' } },
  doing: { right: { kind: 'status', to: 'done' }, left: { kind: 'status', to: 'todo' } },
  done: { right: { kind: 'delete' }, left: { kind: 'status', to: 'doing' } },
}

export const actionColor = (a: FlickAction) => (a.kind === 'delete' ? 'var(--danger)' : STATUS_META[a.to].color)
export const actionLabel = (a: FlickAction) => (a.kind === 'delete' ? '削除' : STATUS_META[a.to].label)
