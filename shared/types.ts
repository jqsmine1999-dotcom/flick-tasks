export const STATUSES = ['todo', 'doing', 'done'] as const
export type Status = (typeof STATUSES)[number]

export interface Task {
  id: string
  title: string
  status: Status
  createdAt: number
  updatedAt: number
}

export interface User {
  id: string
  email: string
  name: string
  picture: string
}

export const MAX_TITLE = 500
export const MAX_AI_INPUT = 2000
