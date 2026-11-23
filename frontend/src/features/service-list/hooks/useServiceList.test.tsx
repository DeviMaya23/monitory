import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listServices, servicesQueryKey } from '../../../lib/api/services'
import { makeService, makeServiceList, problem } from '../../../test/fixtures'
import { useServiceList } from './useServiceList'

// The real query key is kept (an automock would empty it); only the request is mocked.
vi.mock('../../../lib/api/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/services')>()),
  listServices: vi.fn(),
}))
vi.mock('../../../lib/config', () => ({ REFRESH_INTERVAL_MS: 5 * 60 * 1000 }))

function setup() {
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useServiceList(), { wrapper })
}

beforeEach(() => {
  vi.resetAllMocks()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('the list key', () => {
  it('caches the list under the shared servicesQueryKey', async () => {
    vi.mocked(listServices).mockResolvedValue(makeServiceList(makeService()))
    const client = new QueryClient()
    renderHook(() => useServiceList(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    })
    await waitFor(() => expect(client.getQueryData(servicesQueryKey)).toHaveLength(1))
    expect(servicesQueryKey).toEqual(['services'])
  })
})

describe('state', () => {
  it('is loading before the first answer, then list for services (FR-9)', async () => {
    let answer: (list: ReturnType<typeof makeServiceList>) => void = () => {}
    vi.mocked(listServices).mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const { result } = setup()
    expect(result.current.state).toBe('loading')
    expect(result.current.fetching).toBe(true)
    await act(async () => answer(makeServiceList(makeService())))
    await waitFor(() => expect(result.current.state).toBe('list'))
    expect(result.current.services).toHaveLength(1)
    expect(result.current.fetching).toBe(false)
  })

  it('is empty for an empty list (FR-9)', async () => {
    vi.mocked(listServices).mockResolvedValue([])
    const { result } = setup()
    await waitFor(() => expect(result.current.state).toBe('empty'))
  })

  it.each([
    ['a network error', new TypeError('Failed to fetch')],
    ['a 500', problem(500, 'internal_error')],
  ])('is could-not-load when the first load fails with %s, and refresh() recovers', async (_n, error) => {
    vi.mocked(listServices).mockRejectedValueOnce(error)
    const { result } = setup()
    await waitFor(() => expect(result.current.state).toBe('could-not-load'))
    expect(result.current.refreshFailed).toBe(false)

    let answer: (list: ReturnType<typeof makeServiceList>) => void = () => {}
    vi.mocked(listServices).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.fetching).toBe(true))
    expect(listServices).toHaveBeenCalledTimes(2)
    expect(result.current.state).toBe('could-not-load')

    await act(async () => answer(makeServiceList(makeService())))
    await waitFor(() => expect(result.current.state).toBe('list'))
  })

  it('keeps the rows in the order the server sent them', async () => {
    const sent = makeServiceList(makeService({ name: 'b' }), makeService({ name: 'C' }), makeService({ name: 'a' }))
    vi.mocked(listServices).mockResolvedValue(sent)
    const { result } = setup()
    await waitFor(() => expect(result.current.state).toBe('list'))
    expect(result.current.services.map((s) => s.name)).toEqual(['b', 'C', 'a'])
  })
})

describe('a failed refresh (FR-95)', () => {
  it('keeps the data, sets the flag, and the next success clears it and moves the time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-11-15T14:00:00Z'))
    vi.mocked(listServices).mockResolvedValueOnce(makeServiceList(makeService()))
    const { result } = setup()
    await waitFor(() => expect(result.current.state).toBe('list'))
    const first = result.current.lastSuccessAt
    expect(first).toBe(new Date('2026-11-15T14:00:00Z').getTime())

    vi.setSystemTime(new Date('2026-11-15T14:01:00Z'))
    vi.mocked(listServices).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.refreshFailed).toBe(true))
    expect(result.current.state).toBe('list')
    expect(result.current.services).toHaveLength(1)
    expect(result.current.lastSuccessAt).toBe(first)

    vi.setSystemTime(new Date('2026-11-15T14:02:00Z'))
    vi.mocked(listServices).mockResolvedValueOnce(makeServiceList(makeService(), makeService({ name: 'Two' })))
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.refreshFailed).toBe(false))
    expect(result.current.services).toHaveLength(2)
    expect(result.current.lastSuccessAt).toBe(new Date('2026-11-15T14:02:00Z').getTime())
  })
})

describe('the automatic refresh (FR-95)', () => {
  async function runInterval(ms: number) {
    vi.useFakeTimers()
    vi.mocked(listServices).mockResolvedValue(makeServiceList(makeService()))
    const { result } = setup()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(listServices).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms - 1)
    })
    expect(listServices).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(listServices).toHaveBeenCalledTimes(2)
    return result
  }

  it('refetches exactly after the interval, and again after another, also after a failure', async () => {
    const result = await runInterval(5 * 60 * 1000)
    vi.mocked(listServices).mockRejectedValue(new TypeError('Failed to fetch'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    })
    expect(listServices).toHaveBeenCalledTimes(3)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(result.current.refreshFailed).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    })
    expect(listServices).toHaveBeenCalledTimes(4)
  })

  it('moves with the constant', async () => {
    vi.resetModules()
    vi.doMock('../../../lib/config', () => ({ REFRESH_INTERVAL_MS: 2 * 60 * 1000 }))
    vi.doMock('../../../lib/api/services', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../../../lib/api/services')>()),
      listServices,
    }))
    const { useServiceList: hook } = await import('./useServiceList')
    vi.useFakeTimers()
    vi.mocked(listServices).mockResolvedValue(makeServiceList(makeService()))
    const client = new QueryClient()
    renderHook(() => hook(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(listServices).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000 - 1)
    })
    expect(listServices).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(listServices).toHaveBeenCalledTimes(2)
    vi.doUnmock('../../../lib/config')
    vi.doUnmock('../../../lib/api/services')
  })
})

describe('refetch triggers other than the interval (FR-95)', () => {
  afterEach(() => {
    focusManager.setFocused(undefined)
  })

  it('does not refetch when the window regains focus', async () => {
    vi.mocked(listServices).mockResolvedValue(makeServiceList(makeService()))
    const { result } = setup()
    await waitFor(() => expect(result.current.state).toBe('list'))
    expect(listServices).toHaveBeenCalledTimes(1)
    await act(async () => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    expect(listServices).toHaveBeenCalledTimes(1)
  })

  it('keeps refreshing on the interval while the page is in the background', async () => {
    vi.useFakeTimers()
    vi.mocked(listServices).mockResolvedValue(makeServiceList(makeService()))
    setup()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    focusManager.setFocused(false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    })
    expect(listServices).toHaveBeenCalledTimes(2)
  })
})
