import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import { getPublicDashboard } from '../../../lib/api/publicDashboard'
import { makePublicDashboard, makePublicService, problem } from '../../../test/fixtures'
import { usePublicDashboard } from './usePublicDashboard'

vi.mock('../../../lib/api/publicDashboard')
vi.mock('../../../lib/config', () => ({ REFRESH_INTERVAL_MS: 5 * 60 * 1000 }))

const INTERVAL = 5 * 60 * 1000
const dashboard = () => makePublicDashboard(makePublicService())

/** A 429 as `apiRequest` throws it. */
function rateLimited(retryAfter: number | null, code: 'rate_limited' | 'internal_error' | null = 'rate_limited'): ApiError {
  const body = code === null ? null : { title: 'Problem', status: 429, code }
  return new ApiError(429, body, retryAfter)
}

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function setup() {
  return renderHook(() => usePublicDashboard(), { wrapper: wrapperFor(new QueryClient()) })
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const calls = () => vi.mocked(getPublicDashboard).mock.calls.length

beforeEach(() => {
  vi.resetAllMocks()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('state', () => {
  it('is loading before the first answer, then list for services, empty for none (FR-28)', async () => {
    let answer: (d: ReturnType<typeof dashboard>) => void = () => {}
    vi.mocked(getPublicDashboard).mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const { result } = setup()
    expect(result.current.state).toBe('loading')
    expect(result.current.fetching).toBe(true)
    await act(async () => answer(dashboard()))
    await waitFor(() => expect(result.current.state).toBe('list'))
    expect(result.current.services).toHaveLength(1)

    vi.mocked(getPublicDashboard).mockResolvedValue(makePublicDashboard())
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.state).toBe('empty'))
    expect(result.current.services).toEqual([])
  })

  it.each([
    ['a network error', new TypeError('Failed to fetch')],
    ['a 500', problem(500, 'internal_error')],
    ['a 404 with another code', problem(404, 'not_found')],
    ['a 404 without a problem body', new ApiError(404, null, null)],
  ])('is could-not-load when the first load fails with %s, and refresh() recovers', async (_n, error) => {
    vi.mocked(getPublicDashboard).mockRejectedValueOnce(error)
    const { result } = setup()
    await waitFor(() => expect(result.current.state).toBe('could-not-load'))
    expect(result.current.rateLimit).toBeNull()

    let answer: (d: ReturnType<typeof dashboard>) => void = () => {}
    vi.mocked(getPublicDashboard).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.fetching).toBe(true))
    expect(calls()).toBe(2)
    expect(result.current.state).toBe('could-not-load')

    await act(async () => answer(dashboard()))
    await waitFor(() => expect(result.current.state).toBe('list'))
  })

  it('keeps the rows in the order the server sent them', async () => {
    vi.mocked(getPublicDashboard).mockResolvedValue(
      makePublicDashboard(makePublicService({ name: 'b' }), makePublicService({ name: 'C' }), makePublicService({ name: 'a' })),
    )
    const { result } = setup()
    await waitFor(() => expect(result.current.state).toBe('list'))
    expect(result.current.services.map((s) => s.name)).toEqual(['b', 'C', 'a'])
  })
})

describe('a failed refresh (FR-30)', () => {
  it('keeps the data, sets the flag, and the next success clears it and moves the time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-11-15T14:00:00Z'))
    vi.mocked(getPublicDashboard).mockResolvedValueOnce(dashboard())
    const { result } = setup()
    await waitFor(() => expect(result.current.state).toBe('list'))
    const first = result.current.lastSuccessAt
    expect(first).toBe(new Date('2026-11-15T14:00:00Z').getTime())

    vi.setSystemTime(new Date('2026-11-15T14:01:00Z'))
    vi.mocked(getPublicDashboard).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.refreshFailed).toBe(true))
    expect(result.current.state).toBe('list')
    expect(result.current.services).toHaveLength(1)
    expect(result.current.lastSuccessAt).toBe(first)

    vi.setSystemTime(new Date('2026-11-15T14:02:00Z'))
    vi.mocked(getPublicDashboard).mockResolvedValueOnce(dashboard())
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.refreshFailed).toBe(false))
    expect(result.current.lastSuccessAt).toBe(new Date('2026-11-15T14:02:00Z').getTime())
  })
})

describe('the automatic refresh (FR-31)', () => {
  it('refetches exactly after the interval, and again after another, also after a failure', async () => {
    vi.useFakeTimers()
    vi.mocked(getPublicDashboard).mockResolvedValue(dashboard())
    const { result } = setup()
    await advance(0)
    expect(calls()).toBe(1)
    await advance(INTERVAL - 1)
    expect(calls()).toBe(1)
    await advance(1)
    expect(calls()).toBe(2)

    vi.mocked(getPublicDashboard).mockRejectedValue(new TypeError('Failed to fetch'))
    await advance(INTERVAL)
    expect(calls()).toBe(3)
    await advance(10)
    expect(result.current.refreshFailed).toBe(true)
    await advance(INTERVAL)
    expect(calls()).toBe(4)
  })

  it('moves with the constant', async () => {
    vi.resetModules()
    vi.doMock('../../../lib/config', () => ({ REFRESH_INTERVAL_MS: 2 * 60 * 1000 }))
    vi.doMock('../../../lib/api/publicDashboard', () => ({ getPublicDashboard }))
    const { usePublicDashboard: hook } = await import('./usePublicDashboard')
    vi.useFakeTimers()
    vi.mocked(getPublicDashboard).mockResolvedValue(dashboard())
    renderHook(() => hook(), { wrapper: wrapperFor(new QueryClient()) })
    await advance(0)
    expect(calls()).toBe(1)
    await advance(2 * 60 * 1000 - 1)
    expect(calls()).toBe(1)
    await advance(1)
    expect(calls()).toBe(2)
    vi.doUnmock('../../../lib/config')
    vi.doUnmock('../../../lib/api/publicDashboard')
  })
})

describe('unavailable (FR-29)', () => {
  it('on the first load is unavailable and never refetches', async () => {
    vi.useFakeTimers()
    vi.mocked(getPublicDashboard).mockRejectedValue(problem(404, 'public_view_unavailable'))
    const { result } = setup()
    await advance(0)
    expect(result.current.state).toBe('unavailable')
    await advance(INTERVAL * 2)
    expect(calls()).toBe(1)
  })

  it('on a refresh after data replaces the rows and never refetches', async () => {
    vi.useFakeTimers()
    vi.mocked(getPublicDashboard).mockResolvedValueOnce(dashboard())
    const { result } = setup()
    await advance(0)
    expect(result.current.state).toBe('list')
    vi.mocked(getPublicDashboard).mockRejectedValue(problem(404, 'public_view_unavailable'))
    act(() => result.current.refresh())
    await advance(0)
    expect(result.current.state).toBe('unavailable')
    expect(result.current.services).toEqual([])
    expect(calls()).toBe(2)
    await advance(INTERVAL * 2)
    expect(calls()).toBe(2)
  })
})

describe('too many requests (FR-32)', () => {
  it('counts down from Retry-After and refreshes once at zero; a new refusal starts a new countdown', async () => {
    vi.useFakeTimers()
    vi.mocked(getPublicDashboard).mockRejectedValueOnce(rateLimited(23))
    const { result } = setup()
    await advance(0)
    expect(result.current.rateLimit).toEqual({ secondsLeft: 23 })
    await advance(1000)
    expect(result.current.rateLimit).toEqual({ secondsLeft: 22 })
    await advance(21_000)
    expect(result.current.rateLimit).toEqual({ secondsLeft: 1 })
    expect(calls()).toBe(1)

    vi.mocked(getPublicDashboard).mockRejectedValueOnce(rateLimited(5))
    await advance(1000)
    expect(calls()).toBe(2)
    expect(result.current.rateLimit).toEqual({ secondsLeft: 5 })
    await advance(3000)
    expect(result.current.rateLimit).toEqual({ secondsLeft: 2 })
    expect(calls()).toBe(2)

    vi.mocked(getPublicDashboard).mockResolvedValueOnce(dashboard())
    await advance(2000)
    expect(calls()).toBe(3)
    expect(result.current.rateLimit).toBeNull()
    expect(result.current.state).toBe('list')
    await advance(60_000)
    expect(calls()).toBe(3)
  })

  it('keeps data under a 429 and is could-not-load with rateLimit on a refused first load', async () => {
    vi.useFakeTimers()
    vi.mocked(getPublicDashboard).mockResolvedValueOnce(dashboard())
    const first = setup()
    await advance(0)
    vi.mocked(getPublicDashboard).mockRejectedValueOnce(rateLimited(30))
    act(() => first.result.current.refresh())
    await advance(0)
    expect(first.result.current).toMatchObject({ state: 'list', refreshFailed: false, rateLimit: { secondsLeft: 30 } })
    expect(first.result.current.services).toHaveLength(1)
    first.unmount()

    vi.mocked(getPublicDashboard).mockRejectedValueOnce(rateLimited(30))
    const second = setup()
    await advance(0)
    expect(second.result.current).toMatchObject({ state: 'could-not-load', rateLimit: { secondsLeft: 30 } })
  })

  it.each([
    ['no header', null],
    ['a Retry-After of 0', 0],
  ])('with %s has no countdown, no automatic call before the interval, and a click recovers', async (_n, retryAfter) => {
    vi.useFakeTimers()
    vi.mocked(getPublicDashboard).mockRejectedValueOnce(rateLimited(retryAfter))
    const { result } = setup()
    await advance(0)
    expect(result.current.rateLimit).toEqual({ secondsLeft: null })
    await advance(INTERVAL - 1)
    expect(calls()).toBe(1)

    vi.mocked(getPublicDashboard).mockResolvedValueOnce(dashboard())
    act(() => result.current.refresh())
    await advance(0)
    expect(result.current.rateLimit).toBeNull()
    expect(result.current.state).toBe('list')
  })

  it('makes no call from an old countdown after a manual success, or after unmounting', async () => {
    vi.useFakeTimers()
    vi.mocked(getPublicDashboard).mockRejectedValueOnce(rateLimited(null))
    const first = setup()
    await advance(0)
    vi.mocked(getPublicDashboard).mockResolvedValue(dashboard())
    act(() => first.result.current.refresh())
    await advance(0)
    expect(first.result.current.rateLimit).toBeNull()
    first.unmount()

    vi.resetAllMocks()
    vi.mocked(getPublicDashboard).mockRejectedValueOnce(rateLimited(23))
    const second = setup()
    await advance(5000)
    expect(calls()).toBe(1)
    second.unmount()
    await advance(INTERVAL * 2)
    expect(calls()).toBe(1)
  })

  it('does not call after a manual success cleared a countdown', async () => {
    vi.useFakeTimers()
    vi.mocked(getPublicDashboard).mockRejectedValueOnce(rateLimited(23))
    const { result } = setup()
    await advance(5000)
    vi.mocked(getPublicDashboard).mockResolvedValue(dashboard())
    act(() => result.current.refresh())
    await advance(0)
    expect(result.current.rateLimit).toBeNull()
    expect(calls()).toBe(2)
    await advance(25_000)
    expect(calls()).toBe(2)
  })

  it('holds the automatic update back during the countdown and resumes a full interval after zero', async () => {
    vi.useFakeTimers()
    vi.mocked(getPublicDashboard).mockRejectedValueOnce(rateLimited(3600))
    setup()
    await advance(0)
    await advance(INTERVAL * 2)
    expect(calls()).toBe(1)

    vi.resetAllMocks()
    vi.mocked(getPublicDashboard).mockRejectedValueOnce(rateLimited(23)).mockResolvedValue(dashboard())
    setup()
    await advance(22_999)
    expect(calls()).toBe(1)
    await advance(1)
    expect(calls()).toBe(2)
    await advance(INTERVAL - 1)
    expect(calls()).toBe(2)
    await advance(1)
    expect(calls()).toBe(3)
  })

  it.each([
    ['a rate_limited problem', rateLimited(23)],
    ['a body-less 429', rateLimited(23, null)],
    ['another code', rateLimited(23, 'internal_error')],
  ])('remembers %s while the refetch at zero is in flight', async (_n, error) => {
    vi.useFakeTimers()
    vi.mocked(getPublicDashboard).mockRejectedValueOnce(error)
    const { result } = setup()
    await advance(0)
    let answer: (d: ReturnType<typeof dashboard>) => void = () => {}
    vi.mocked(getPublicDashboard).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    await advance(23_000)
    expect(calls()).toBe(2)
    expect(result.current.fetching).toBe(true)
    expect(result.current.rateLimit).toEqual({ secondsLeft: 0 })
    expect(result.current.state).toBe('could-not-load')
    await act(async () => answer(dashboard()))
    await advance(0)
    expect(result.current.rateLimit).toBeNull()
    expect(result.current.state).toBe('list')
  })

  it('fires the refetch at zero once per answer, even while it is still in flight', async () => {
    vi.useFakeTimers()
    // With rows on screen a repeated refetch cancels and restarts the request, so a second call would show.
    vi.mocked(getPublicDashboard).mockResolvedValueOnce(dashboard())
    const { result } = setup()
    await advance(0)
    vi.mocked(getPublicDashboard).mockRejectedValueOnce(rateLimited(3))
    act(() => result.current.refresh())
    await advance(0)
    vi.mocked(getPublicDashboard).mockReturnValue(new Promise(() => {}))
    await advance(3000)
    expect(calls()).toBe(3)
    await advance(10_000)
    expect(calls()).toBe(3)
  })

  it('a refresh failing twice and then succeeding keeps the rows, then clears the flag', async () => {
    vi.useFakeTimers()
    vi.mocked(getPublicDashboard).mockResolvedValueOnce(dashboard())
    const { result } = setup()
    await advance(0)
    vi.mocked(getPublicDashboard).mockRejectedValue(problem(500, 'internal_error'))
    act(() => result.current.refresh())
    await advance(0)
    act(() => result.current.refresh())
    await advance(0)
    expect(result.current).toMatchObject({ state: 'list', refreshFailed: true, rateLimit: null })
    vi.mocked(getPublicDashboard).mockResolvedValue(dashboard())
    act(() => result.current.refresh())
    await advance(0)
    expect(result.current.refreshFailed).toBe(false)
  })

  it('remembers a 429 with no usable header while a manual retry is in flight', async () => {
    vi.useFakeTimers()
    vi.mocked(getPublicDashboard).mockRejectedValueOnce(rateLimited(null))
    const { result } = setup()
    await advance(0)
    vi.mocked(getPublicDashboard).mockReturnValueOnce(new Promise(() => {}))
    act(() => result.current.refresh())
    await advance(0)
    expect(result.current.fetching).toBe(true)
    expect(result.current.rateLimit).toEqual({ secondsLeft: null })
    expect(result.current.state).toBe('could-not-load')
  })
})
