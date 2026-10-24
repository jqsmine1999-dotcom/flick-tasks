import type { User } from '../shared/types'

export interface Env {
  DB: D1Database
  AI: Ai
  ASSETS: Fetcher
  AI_MODEL: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  /** Set only in .dev.vars. Enables /auth/dev on localhost for local testing. */
  DEV_AUTH?: string
}

export type AppEnv = { Bindings: Env; Variables: { user: User } }
