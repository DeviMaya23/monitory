import { ApiError, type ProblemBody } from './ApiError'

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

const WRITE_METHODS: ReadonlySet<Method> = new Set(['POST', 'PUT', 'DELETE'])

// The session's CSRF token, from `signIn` or `getSession`. Held in memory only.
let csrfToken: string | null = null

/** Sets the token sent as `X-CSRF-Token` on writes; null after sign-out or a 401. */
export function setCsrfToken(token: string | null): void {
  csrfToken = token
}

// Called on any 401, so the app shell can send the admin to sign-in.
let onUnauthenticated: (() => void) | null = null

/** Registers what happens when a request is answered 401. */
export function setUnauthenticatedHandler(handler: (() => void) | null): void {
  onUnauthenticated = handler
}

/** Whole seconds from a Retry-After header; an empty value, an HTTP date or a fraction is null. */
function parseRetryAfter(header: string | null): number | null {
  if (header === null || !/^\s*\d+\s*$/.test(header)) return null
  return Number.parseInt(header, 10)
}

async function readProblem(res: Response): Promise<ProblemBody | null> {
  if (!res.headers.get('Content-Type')?.includes('application/problem+json')) return null
  try {
    return (await res.json()) as ProblemBody
  } catch {
    return null
  }
}

/**
 * Makes a JSON request to `path` (for example `/api/services`). A write carries
 * `X-CSRF-Token`. A non-2xx response throws `ApiError`; a network failure rejects
 * with the fetch error itself, which is not an `ApiError`.
 */
export async function apiRequest<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (WRITE_METHODS.has(method) && csrfToken !== null) headers['X-CSRF-Token'] = csrfToken

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!res.ok) {
    const problem = await readProblem(res)
    if (res.status === 401 && problem?.code === 'unauthenticated') {
      csrfToken = null
      onUnauthenticated?.()
    }
    const retryAfter = res.status === 429 ? parseRetryAfter(res.headers.get('Retry-After')) : null
    throw new ApiError(res.status, problem, retryAfter)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
