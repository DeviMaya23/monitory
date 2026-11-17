import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastContext, type ToastInput } from '../../../components/ui/useToast'
import { ApiError } from '../../../lib/api/ApiError'
import { deleteService, listServices, servicesQueryKey } from '../../../lib/api/services'
import { makeService, makeServiceList, problem } from '../../../test/fixtures'
import { useDeleteService } from './useDeleteService'

vi.mock('../../../lib/api/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/services')>()),
  listServices: vi.fn(),
  deleteService: vi.fn(),
}))

const a = makeService({ name: 'a' })
const b = makeService({ name: 'b' })
const c = makeService({ name: 'c' })
const SEEDED_AT = 1_700_000_000_000

function setup(seed: ReturnType<typeof makeServiceList> | null = makeServiceList(a, b, c)) {
  const client = new QueryClient()
  if (seed) client.setQueryData(servicesQueryKey, seed, { updatedAt: SEEDED_AT })
  const show = vi.fn<(toast: ToastInput) => void>()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastContext.Provider value={{ show }}>{children}</ToastContext.Provider>
    </QueryClientProvider>
  )
  const view = renderHook(() => useDeleteService(), { wrapper })
  return { ...view, client, show }
}

type Settle = { resolve: () => void; reject: (error: unknown) => void }
function pending(): Settle {
  const settle: Settle = { resolve: () => {}, reject: () => {} }
  vi.mocked(deleteService).mockReturnValueOnce(
    new Promise<void>((resolve, reject) => {
      settle.resolve = resolve
      settle.reject = reject
    }),
  )
  return settle
}

const cached = (client: QueryClient) => client.getQueryData<ReturnType<typeof makeServiceList>>(servicesQueryKey)

/** Asks about `service`, confirms, and answers the request. */
async function deleteWith(
  view: ReturnType<typeof setup>,
  outcome: { resolve: true } | { reject: unknown },
  service = b,
) {
  const settle = pending()
  act(() => view.result.current.ask(service))
  act(() => view.result.current.confirm())
  await act(async () => {
    if ('resolve' in outcome) settle.resolve()
    else settle.reject(outcome.reject)
  })
  await waitFor(() => expect(view.result.current.deleting).toBe(false))
}

beforeEach(() => {
  vi.resetAllMocks()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('asking and sending', () => {
  it('ask sets the service and cancel clears it without a request', () => {
    const { result } = setup()
    expect(result.current.asked).toBeNull()
    expect(result.current.closedAs).toBeNull()
    act(() => result.current.ask(b))
    expect(result.current.asked).toBe(b)
    act(() => result.current.cancel())
    expect(result.current.asked).toBeNull()
    expect(result.current.closedAs).toBe('kept')
    expect(deleteService).not.toHaveBeenCalled()
  })

  it('confirm with nothing asked does nothing', () => {
    const { result } = setup()
    act(() => result.current.confirm())
    expect(deleteService).not.toHaveBeenCalled()
  })

  it('confirm sends one request with the id, is in flight until it settles, and a second confirm sends nothing (FR-72)', async () => {
    const settle = pending()
    const { result } = setup()
    act(() => result.current.ask(b))
    act(() => {
      result.current.confirm()
      result.current.confirm()
    })
    await waitFor(() => expect(result.current.deleting).toBe(true))
    expect(deleteService).toHaveBeenCalledTimes(1)
    expect(deleteService).toHaveBeenCalledWith(b.id)
    act(() => result.current.confirm())
    act(() => result.current.cancel())
    expect(deleteService).toHaveBeenCalledTimes(1)
    expect(result.current.asked).toBe(b)
    await act(async () => settle.resolve())
    await waitFor(() => expect(result.current.deleting).toBe(false))
    expect(result.current.asked).toBeNull()
  })
})

describe('a 204', () => {
  it('drops exactly that service, keeps the others and the load time, and shows the toast (FR-8)', async () => {
    const view = setup()
    await deleteWith(view, { resolve: true })
    const list = cached(view.client)
    // Same services in the same order (the query client may copy an object that moved up).
    expect(list).toStrictEqual([a, c])
    expect(view.client.getQueryState(servicesQueryKey)?.dataUpdatedAt).toBe(SEEDED_AT)
    expect(listServices).not.toHaveBeenCalled()
    expect(view.show).toHaveBeenCalledTimes(1)
    expect(view.show).toHaveBeenCalledWith({ kind: 'success', message: 'Service deleted.' })
    expect(view.result.current.asked).toBeNull()
    expect(view.result.current.closedAs).toBe('removed')
  })

  it('leaves an empty list after the last one', async () => {
    const view = setup(makeServiceList(a))
    await deleteWith(view, { resolve: true }, a)
    expect(cached(view.client)).toEqual([])
  })

  it('cancels a list request that started before the delete, so the row stays gone', async () => {
    const view = setup()
    let answer: (list: ReturnType<typeof makeServiceList>) => void = () => {}
    vi.mocked(listServices).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    void view.client.fetchQuery({ queryKey: servicesQueryKey, queryFn: listServices, staleTime: 0 }).catch(() => {})
    await deleteWith(view, { resolve: true })
    await act(async () => answer(makeServiceList(a, b, c)))
    expect(cached(view.client)).toEqual([a, c])
  })

  it('creates no cache entry when there is none', async () => {
    const view = setup(null)
    await deleteWith(view, { resolve: true })
    expect(view.client.getQueryState(servicesQueryKey)).toBeUndefined()
    expect(view.show).toHaveBeenCalledWith({ kind: 'success', message: 'Service deleted.' })
  })

  it('still removes the service and shows the toast when the component is gone before the answer', async () => {
    const view = setup()
    const settle = pending()
    act(() => view.result.current.ask(b))
    act(() => view.result.current.confirm())
    view.unmount()
    await act(async () => settle.resolve())
    await waitFor(() => expect(cached(view.client)).toEqual([a, c]))
    expect(view.show).toHaveBeenCalledWith({ kind: 'success', message: 'Service deleted.' })
  })
})

describe('a 404 not_found', () => {
  it('removes the service as for a 204 and shows the already-deleted toast', async () => {
    const view = setup()
    await deleteWith(view, { reject: problem(404, 'not_found') })
    expect(cached(view.client)).toEqual([a, c])
    expect(view.client.getQueryState(servicesQueryKey)?.dataUpdatedAt).toBe(SEEDED_AT)
    expect(view.show).toHaveBeenCalledTimes(1)
    expect(view.show).toHaveBeenCalledWith({ kind: 'error', message: 'That service was already deleted.' })
    expect(view.result.current.closedAs).toBe('removed')
    expect(view.result.current.asked).toBeNull()
  })
})

describe('a 403 csrf_failed', () => {
  it('keeps the list and offers Reload, which reloads once (NFR-8)', async () => {
    const original = window.location
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { reload } })
    try {
      const view = setup()
      await deleteWith(view, { reject: problem(403, 'csrf_failed') })
      expect(cached(view.client)).toEqual([a, b, c])
      expect(view.show).toHaveBeenCalledTimes(1)
      const toast = view.show.mock.calls[0][0]
      expect(toast).toMatchObject({ kind: 'error', message: 'The request wasn’t accepted. Reload and try again.' })
      expect(toast.action?.label).toBe('Reload')
      expect(reload).not.toHaveBeenCalled()
      toast.action?.onClick()
      expect(reload).toHaveBeenCalledTimes(1)
      expect(view.result.current.closedAs).toBe('kept')
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
    }
  })
})

describe('any other failure', () => {
  it.each<[string, unknown]>([
    ['a 500', problem(500, 'internal_error')],
    ['a network error', new TypeError('Failed to fetch')],
    ['a 403 with another code', problem(403, 'forbidden')],
    ['a 404 with no problem body', new ApiError(404, null, null)],
    ['a 404 with another code', problem(404, 'internal_error')],
  ])('%s gives the generic toast, keeps the list and clears the question', async (_name, error) => {
    const view = setup()
    await deleteWith(view, { reject: error })
    expect(cached(view.client)).toEqual([a, b, c])
    expect(view.show).toHaveBeenCalledTimes(1)
    expect(view.show).toHaveBeenCalledWith({ kind: 'error', message: 'Couldn’t delete the service. Try again.' })
    expect(view.result.current.asked).toBeNull()
    expect(view.result.current.closedAs).toBe('kept')
  })
})

describe('a 401 unauthenticated', () => {
  it('shows no toast and clears the question', async () => {
    const view = setup()
    await deleteWith(view, { reject: problem(401, 'unauthenticated') })
    expect(view.show).not.toHaveBeenCalled()
    expect(view.result.current.asked).toBeNull()
    expect(cached(view.client)).toEqual([a, b, c])
  })
})
