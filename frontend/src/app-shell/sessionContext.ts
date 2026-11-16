import { createContext } from 'react'
import type { SessionInfo } from '../lib/api/session'

export type SessionState = 'checking' | 'signed-in' | 'signed-out' | 'unreachable'

export interface SessionValue {
  state: SessionState
  /** True while `recheck()` is in flight from "unreachable". */
  rechecking: boolean
  /** True after a session ended while the page was open, until the next sign-in. */
  notice: boolean
  /** True while a sign-out request is in flight. */
  signingOut: boolean
  /** Records a successful sign-in. */
  signedIn: (info: SessionInfo) => void
  signOut: () => void
  recheck: () => void
}

export const SessionContext = createContext<SessionValue | null>(null)
