import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './ApiError'
import { getPublicDashboard } from './publicDashboard'

const fetchMock = vi.fn<typeof fetch>()

function problem(status: number, code: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ title: 'Problem', status, code }), {
    status,
    headers: { 'Content-Type': 'application/problem+json', ...headers },
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

describe('getPublicDashboard', () => {
  it('sends GET /api/public/dashboard with no body and returns the parsed response (FR-28)', async () => {
    const body = { services: [{ name: 'API', status: 'healthy', last_checked_at: '2026-11-15T14:31:52Z' }] }
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    await expect(getPublicDashboard()).resolves.toEqual(body)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [path, init] = fetchMock.mock.calls[0]
    expect(path).toBe('/api/public/dashboard')
    expect(init?.method).toBe('GET')
    expect(init?.body).toBeUndefined()
  })

  it('rejects a 404 public_view_unavailable as an ApiError without retryAfter (FR-29)', async () => {
    fetchMock.mockResolvedValue(problem(404, 'public_view_unavailable'))
    const error = await getPublicDashboard().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, code: 'public_view_unavailable', retryAfter: null })
  })

  it('rejects a 429 rate_limited with the Retry-After seconds (FR-32)', async () => {
    fetchMock.mockResolvedValue(problem(429, 'rate_limited', { 'Retry-After': '23' }))
    const error = await getPublicDashboard().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 429, code: 'rate_limited', retryAfter: 23 })
  })
})
