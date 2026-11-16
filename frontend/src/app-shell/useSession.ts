import { useContext } from 'react'
import { SessionContext, type SessionValue } from './sessionContext'

/** The session state and its mutators. Must be used inside `SessionProvider`. */
export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (value === null) throw new Error('useSession must be used inside SessionProvider')
  return value
}
