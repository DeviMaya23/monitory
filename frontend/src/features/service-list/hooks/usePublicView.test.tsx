import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastContext, type ToastInput } from '../../../components/ui/useToast'
import {
  getPublicViewSettings,
  publicViewQueryKey,
  updatePublicViewSettings,
  type PublicViewSettings,
} from '../../../lib/api/publicView'
import { problem } from '../../../test/fixtures'
import { usePublicView } from './usePublicView'

// The real query key is kept (an automock would empty it); only the requests are mocked.
vi.mock('../../../lib/api/publicView', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/publicView')>()),
  getPublicViewSettings: vi.fn(),
  updatePublicViewSettings: vi.fn(),
}))
vi.mock('../../../lib/config', () => ({ REFRESH_INTERVAL_MS: 5 * 60 * 1000 }))

function setup() {
  const client = new QueryClient()
  const show = vi.fn<(toast: ToastInput) => void>()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastContext.Provider value={{ show }}>{children}</ToastContext.Provider>
    </QueryClientProvider>
  )
  return { ...renderHook(() => usePublicView(), { wrapper }), client, show }
}

type Settle<T> = { resolve: (value: T) => void; reject: (error: unknown) => void }
function pendingUpdate(): Settle<PublicViewSettings> {
  const settle: Settle<PublicViewSettings> = { resolve: () => {}, reject: () => {} }
  vi.mocked(updatePublicViewSettings).mockReturnValueOnce(
    new Promise((resolve, reject) => {
      settle.resolve = resolve
      settle.reject = reject
    }),
  )
  return settle
}
function pendingGet(): Settle<PublicViewSettings> {
  const settle: Settle<PublicViewSettings> = { resolve: () => {}, reject: () => {} }
  vi.mocked(getPublicViewSettings).mockReturnValueOnce(
    new Promise((resolve, reject) => {
      settle.resolve = resolve
      settle.reject = reject
    }),
  )
  return settle
}

beforeEach(() => {
  vi.resetAllMocks()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('state (FR-26)', () => {
  it('is loading before an answer, then on or off by the answer', async () => {
    const first = pendingGet()
    const view = setup()
    expect(view.result.current.state).toBe('loading')
    await act(async () => first.resolve({ enabled: true }))
    await waitFor(() => expect(view.result.current.state).toBe('on'))

    const second = pendingGet()
    act(() => view.result.current.refresh())
    await act(async () => second.resolve({ enabled: false }))
    await waitFor(() => expect(view.result.current.state).toBe('off'))
  })

  it.each([
    ['a 500', problem(500, 'internal_error')],
    ['a network error', new TypeError('Failed to fetch')],
  ])('is not-loaded after %s with no value, and refresh() ends on', async (_n, error) => {
    vi.mocked(getPublicViewSettings).mockRejectedValueOnce(error)
    const view = setup()
    await waitFor(() => expect(view.result.current.state).toBe('not-loaded'))
    expect(getPublicViewSettings).toHaveBeenCalledTimes(1)

    vi.mocked(getPublicViewSettings).mockResolvedValueOnce({ enabled: true })
    act(() => view.result.current.refresh())
    await waitFor(() => expect(view.result.current.state).toBe('on'))
    expect(getPublicViewSettings).toHaveBeenCalledTimes(2)
  })

  it('keeps the held value when a refetch fails', async () => {
    vi.mocked(getPublicViewSettings).mockResolvedValueOnce({ enabled: true })
    const view = setup()
    await waitFor(() => expect(view.result.current.state).toBe('on'))
    vi.mocked(getPublicViewSettings).mockRejectedValueOnce(problem(500, 'internal_error'))
    act(() => view.result.current.refresh())
    await waitFor(() => expect(getPublicViewSettings).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(view.client.getQueryState(publicViewQueryKey)?.status).toBe('error'))
    expect(view.result.current.state).toBe('on')
  })

  it('refetches after the interval, with the list (FR-95)', async () => {
    vi.useFakeTimers()
    vi.mocked(getPublicViewSettings).mockResolvedValue({ enabled: false })
    setup()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(getPublicViewSettings).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 - 1)
    })
    expect(getPublicViewSettings).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(getPublicViewSettings).toHaveBeenCalledTimes(2)
  })
})

describe('toggle', () => {
  async function loadedOff() {
    vi.mocked(getPublicViewSettings).mockResolvedValue({ enabled: false })
    const view = setup()
    await waitFor(() => expect(view.result.current.state).toBe('off'))
    return view
  }
  const cached = (client: QueryClient) => client.getQueryData<PublicViewSettings>(publicViewQueryKey)

  it('sends exactly { enabled: true } once, and two calls in one tick send one request', async () => {
    const view = await loadedOff()
    const settle = pendingUpdate()
    act(() => {
      view.result.current.toggle(true)
      view.result.current.toggle(true)
    })
    await waitFor(() => expect(updatePublicViewSettings).toHaveBeenCalledTimes(1))
    expect(updatePublicViewSettings).toHaveBeenCalledWith({ enabled: true })
    // No optimistic change.
    expect(view.result.current.state).toBe('off')
    await act(async () => settle.resolve({ enabled: true }))
    await waitFor(() => expect(view.result.current.state).toBe('on'))
  })

  it('shows the answer, not the asked value, with the toast by the answer, and does not refetch', async () => {
    const view = await loadedOff()
    const settle = pendingUpdate()
    act(() => view.result.current.toggle(true))
    // The server answers the opposite of what was asked.
    await act(async () => settle.resolve({ enabled: false }))
    await waitFor(() => expect(view.show).toHaveBeenCalledTimes(1))
    expect(cached(view.client)).toEqual({ enabled: false })
    expect(view.result.current.state).toBe('off')
    expect(view.show).toHaveBeenCalledWith({ kind: 'success', message: 'Public page turned off.' })
    expect(getPublicViewSettings).toHaveBeenCalledTimes(1)

    const next = pendingUpdate()
    act(() => view.result.current.toggle(false))
    await act(async () => next.resolve({ enabled: true }))
    await waitFor(() => expect(view.result.current.state).toBe('on'))
    expect(view.show).toHaveBeenLastCalledWith({ kind: 'success', message: 'Public page turned on.' })
  })

  it('a refetch still pending cannot overwrite the answer', async () => {
    const view = await loadedOff()
    const refetch = pendingGet()
    act(() => view.result.current.refresh())
    const settle = pendingUpdate()
    act(() => view.result.current.toggle(true))
    await act(async () => settle.resolve({ enabled: true }))
    await waitFor(() => expect(view.result.current.state).toBe('on'))
    await act(async () => refetch.resolve({ enabled: false }))
    expect(view.result.current.state).toBe('on')
  })

  it('a 403 csrf_failed shows the shared toast with a Reload action and keeps the value', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const view = await loadedOff()
    vi.mocked(updatePublicViewSettings).mockRejectedValueOnce(problem(403, 'csrf_failed'))
    act(() => view.result.current.toggle(true))
    await waitFor(() => expect(view.show).toHaveBeenCalledTimes(1))
    const toast = view.show.mock.calls[0][0]
    expect(toast.kind).toBe('error')
    expect(toast.message).toBe('The request wasn’t accepted. Reload and try again.')
    toast.action?.onClick()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(view.result.current.state).toBe('off')
  })

  it.each([
    ['a 400', problem(400, 'malformed_request')],
    ['a 404 (not the already-deleted case)', problem(404, 'not_found')],
    ['a 422', problem(422, 'validation_failed')],
    ['a 500', problem(500, 'internal_error')],
    ['a network error', new TypeError('Failed to fetch')],
  ])('%s shows the failure toast by the value being set, keeps the value, and the next toggle sends again', async (_n, error) => {
    const view = await loadedOff()
    vi.mocked(updatePublicViewSettings).mockRejectedValueOnce(error)
    act(() => view.result.current.toggle(true))
    await waitFor(() =>
      expect(view.show).toHaveBeenLastCalledWith({
        kind: 'error',
        message: 'Couldn’t turn the public page on. Try again.',
      }),
    )
    expect(view.result.current.state).toBe('off')

    vi.mocked(updatePublicViewSettings).mockRejectedValueOnce(error)
    act(() => view.result.current.toggle(false))
    await waitFor(() =>
      expect(view.show).toHaveBeenLastCalledWith({
        kind: 'error',
        message: 'Couldn’t turn the public page off. Try again.',
      }),
    )
    expect(updatePublicViewSettings).toHaveBeenCalledTimes(2)
    expect(view.show).toHaveBeenCalledTimes(2)
  })

  it('a 401 shows no toast', async () => {
    const view = await loadedOff()
    vi.mocked(updatePublicViewSettings).mockRejectedValueOnce(problem(401, 'unauthenticated'))
    act(() => view.result.current.toggle(true))
    await waitFor(() => expect(updatePublicViewSettings).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(view.show).not.toHaveBeenCalled()
    expect(view.result.current.state).toBe('off')
  })
})
