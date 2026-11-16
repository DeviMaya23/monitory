import { apiRequest } from './request'
import type { components } from './schema'

export type SessionInfo = components['schemas']['SessionInfo']
export type SignInRequest = components['schemas']['SignInRequest']

/** `signIn`: opens the admin session. */
export function signIn(body: SignInRequest): Promise<SessionInfo> {
  return apiRequest<SessionInfo>('POST', '/api/session', body)
}

/** `getSession`: the current session, or `401 unauthenticated`. */
export function getSession(): Promise<SessionInfo> {
  return apiRequest<SessionInfo>('GET', '/api/session')
}

/** `signOut`: ends the session. The CSRF header is added by `apiRequest`. */
export function signOut(): Promise<void> {
  return apiRequest<void>('DELETE', '/api/session')
}
