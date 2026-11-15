import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ProblemBody } from './ApiError'
import { apiRequest, setCsrfToken, setUnauthenticatedHandler } from './request'

const fetchMock = vi.fn<typeof fetch>()

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function problem(body: ProblemBody, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: body.status,
    headers: { 'Content-Type': 'application/problem+json', ...headers },
  })
}

function sentHeaders(): Record<string, string> {
  return fetchMock.mock.calls[0][1]?.headers as Record<string, string>
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  setCsrfToken(null)
  setUnauthenticatedHandler(null)
})

describe('apiRequest', () => {
  it('returns the decoded body of a 2xx response', async () => {
    fetchMock.mockResolvedValue(json(200, { status: 'ok' }))
    await expect(apiRequest('GET', '/health')).resolves.toEqual({ status: 'ok' })
    expect(fetchMock).toHaveBeenCalledWith('/health', expect.objectContaining({ method: 'GET' }))
  })

  it('returns undefined for a 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(apiRequest('DELETE', '/api/session')).resolves.toBeUndefined()
  })

  it('sends the CSRF token on writes and not on reads', async () => {
    setCsrfToken('the-token')
    fetchMock.mockResolvedValue(json(200, {}))
    await apiRequest('PUT', '/api/settings/public-view', { enabled: true })
    expect(sentHeaders()['X-CSRF-Token']).toBe('the-token')
    expect(sentHeaders()['Content-Type']).toBe('application/json')

    fetchMock.mockClear()
    fetchMock.mockResolvedValue(json(200, {}))
    await apiRequest('GET', '/api/settings/public-view')
    expect(sentHeaders()['X-CSRF-Token']).toBeUndefined()
  })

  it('sends no CSRF header when there is no token', async () => {
    fetchMock.mockResolvedValue(json(200, {}))
    await apiRequest('POST', '/api/session', { username: 'a', password: 'b' })
    expect(sentHeaders()['X-CSRF-Token']).toBeUndefined()
  })

  it('throws an ApiError carrying the problem and its code', async () => {
    fetchMock.mockResolvedValue(
      problem({ title: 'Name already used', status: 409, code: 'service_name_taken' }),
    )
    const error = await apiRequest('POST', '/api/services', {}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
    expect((error as ApiError).code).toBe('service_name_taken')
  })

  it('throws an ApiError with no problem when the error body is not a problem', async () => {
    fetchMock.mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }))
    const error = await apiRequest('GET', '/api/services').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).problem).toBeNull()
    expect((error as ApiError).code).toBeNull()
  })

  it.each([
    ['30', 30],
    [' 7 ', 7],
    ['', null],
    ['1.5', null],
    ['-3', null],
    ['Wed, 21 Oct 2026 07:28:00 GMT', null],
  ])('reads Retry-After %j on a 429 as %j', async (header, expected) => {
    fetchMock.mockResolvedValue(
      problem({ title: 'Too many requests', status: 429, code: 'rate_limited' }, { 'Retry-After': header }),
    )
    const error = await apiRequest('GET', '/api/public/dashboard').catch((e: unknown) => e)
    expect((error as ApiError).retryAfter).toBe(expected)
  })

  it('on 401 unauthenticated, drops the token and tells the app shell', async () => {
    const handler = vi.fn()
    setUnauthenticatedHandler(handler)
    setCsrfToken('the-token')
    fetchMock.mockResolvedValue(problem({ title: 'Sign-in required', status: 401, code: 'unauthenticated' }))
    await expect(apiRequest('GET', '/api/services')).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledTimes(1)

    fetchMock.mockClear()
    fetchMock.mockResolvedValue(json(200, {}))
    await apiRequest('PUT', '/api/settings/public-view', { enabled: true })
    expect(sentHeaders()['X-CSRF-Token']).toBeUndefined()
  })

  it('does not treat wrong credentials (401 invalid_credentials) as a lost session', async () => {
    const handler = vi.fn()
    setUnauthenticatedHandler(handler)
    fetchMock.mockResolvedValue(
      problem({ title: 'Wrong credentials', status: 401, code: 'invalid_credentials' }),
    )
    await expect(apiRequest('POST', '/api/session', {})).rejects.toBeInstanceOf(ApiError)
    expect(handler).not.toHaveBeenCalled()
  })

  it('lets a network failure through as it is', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const error = await apiRequest('GET', '/api/services').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TypeError)
    expect(error).not.toBeInstanceOf(ApiError)
  })
})
