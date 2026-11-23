import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastContext, type ToastInput } from '../../../components/ui/useToast'
import { ApiError } from '../../../lib/api/ApiError'
import { deleteTarget, listTargets, targetsQueryKey, type TargetList } from '../../../lib/api/targets'
import { makeEmailTarget, makeTargetList, makeWebhookTarget, problem } from '../../../test/fixtures'
import { useRemoveTarget } from './useRemoveTarget'
import { RELOAD_LABEL, REQUEST_NOT_ACCEPTED_TOAST } from '../../../lib/requestNotAccepted'

vi.mock('../../../lib/api/targets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/targets')>()),
  listTargets: vi.fn(),
  deleteTarget: vi.fn(),
}))

const a = makeEmailTarget({ address: 'a@example.com' })
const b = makeWebhookTarget({ url: 'https://b.example.com' })
const c = makeEmailTarget({ address: 'c@example.com' })
const SEEDED_AT = 1_700_000_000_000
const key = targetsQueryKey('s1')

function setup(seed: TargetList | null = makeTargetList(a, b, c)) {
  // No page observes the list here, so the client carries the query function a refetch needs.
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: ({ queryKey }) => listTargets(String(queryKey[1])), retry: false } },
  })
  if (seed) client.setQueryData(key, seed, { updatedAt: SEEDED_AT })
  const show = vi.fn<(toast: ToastInput) => void>()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastContext.Provider value={{ show }}>{children}</ToastContext.Provider>
    </QueryClientProvider>
  )
  const view = renderHook(() => useRemoveTarget('s1'), { wrapper })
  return { ...view, client, show }
}

type Settle = { resolve: () => void; reject: (error: unknown) => void }
function pending(): Settle {
  const settle: Settle = { resolve: () => {}, reject: () => {} }
  vi.mocked(deleteTarget).mockReturnValueOnce(
    new Promise<void>((resolve, reject) => {
      settle.resolve = resolve
      settle.reject = reject
    }),
  )
  return settle
}

const cached = (client: QueryClient) => client.getQueryData<TargetList>(key)

async function removeWith(view: ReturnType<typeof setup>, outcome: { resolve: true } | { reject: unknown }, id = b.id) {
  const settle = pending()
  act(() => view.result.current.ask(id))
  act(() => view.result.current.confirm())
  await act(async () => {
    if ('resolve' in outcome) settle.resolve()
    else settle.reject(outcome.reject)
  })
  await waitFor(() => expect(view.result.current.removing).toBe(false))
}

beforeEach(() => {
  vi.resetAllMocks()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('asking and sending', () => {
  it('ask sets the id and cancel clears it with no request', () => {
    const { result } = setup()
    expect(result.current.askedId).toBeNull()
    act(() => result.current.ask(b.id))
    expect(result.current.askedId).toBe(b.id)
    act(() => result.current.cancel())
    expect(result.current.askedId).toBeNull()
    expect(result.current.closed).toEqual({ id: b.id, as: 'kept' })
    expect(deleteTarget).not.toHaveBeenCalled()
  })

  it('ask for another target replaces the first', () => {
    const { result } = setup()
    act(() => result.current.ask(a.id))
    act(() => result.current.ask(c.id))
    expect(result.current.askedId).toBe(c.id)
  })

  it('confirm sends once, stays in flight until it settles, and a second confirm sends nothing; ask changes nothing meanwhile', async () => {
    const settle = pending()
    const { result } = setup()
    act(() => result.current.ask(b.id))
    act(() => {
      result.current.confirm()
      result.current.confirm()
    })
    await waitFor(() => expect(result.current.removing).toBe(true))
    expect(deleteTarget).toHaveBeenCalledOnce()
    expect(deleteTarget).toHaveBeenCalledWith('s1', b.id)
    act(() => result.current.ask(a.id))
    act(() => result.current.cancel())
    expect(result.current.askedId).toBe(b.id)
    act(() => result.current.confirm())
    expect(deleteTarget).toHaveBeenCalledOnce()
    await act(async () => settle.resolve())
    await waitFor(() => expect(result.current.removing).toBe(false))
  })

  it('confirm without a question sends nothing', () => {
    const { result } = setup()
    act(() => result.current.confirm())
    expect(deleteTarget).not.toHaveBeenCalled()
  })
})

describe('a 204', () => {
  it('removes exactly that target, keeps the rest and the load time, and toasts', async () => {
    const view = setup()
    await removeWith(view, { resolve: true })
    const list = cached(view.client)
    expect(list).toHaveLength(2)
    // TanStack's structural sharing may clone an element that moved, so compare by content and order.
    expect(list).toStrictEqual([a, c])
    expect(view.client.getQueryState(key)?.dataUpdatedAt).toBe(SEEDED_AT)
    expect(listTargets).not.toHaveBeenCalled()
    expect(view.show).toHaveBeenCalledWith({ kind: 'success', message: 'Target removed.' })
    expect(view.result.current.askedId).toBeNull()
    expect(view.result.current.closed).toEqual({ id: b.id, as: 'removed' })
  })

  it('cancels a reload that started before, so the target does not come back', async () => {
    const view = setup()
    let finishReload: (list: TargetList) => void = () => {}
    vi.mocked(listTargets).mockReturnValueOnce(new Promise((resolve) => (finishReload = resolve)))
    void view.client.fetchQuery({ queryKey: key, queryFn: () => listTargets('s1'), staleTime: 0 }).catch(() => {})
    await removeWith(view, { resolve: true })
    await act(async () => finishReload(makeTargetList(a, b, c)))
    expect(cached(view.client)?.map((t) => t.id)).toEqual([a.id, c.id])
  })

  it('creates no list when none is cached', async () => {
    const view = setup(null)
    await removeWith(view, { resolve: true })
    expect(cached(view.client)).toBeUndefined()
  })

  it('still removes and toasts when the page unmounted before the answer', async () => {
    const view = setup()
    const settle = pending()
    act(() => view.result.current.ask(b.id))
    act(() => view.result.current.confirm())
    view.unmount()
    await act(async () => settle.resolve())
    await waitFor(() => expect(cached(view.client)).toHaveLength(2))
    expect(view.show).toHaveBeenCalledWith({ kind: 'success', message: 'Target removed.' })
  })
})

describe('a 404 not_found', () => {
  it('removes the target, fetches the list once more and toasts', async () => {
    vi.mocked(listTargets).mockResolvedValue(makeTargetList(a, c))
    const view = setup()
    await removeWith(view, { reject: problem(404, 'not_found') })
    await waitFor(() => expect(listTargets).toHaveBeenCalledTimes(1))
    expect(listTargets).toHaveBeenCalledWith('s1')
    expect(view.show).toHaveBeenCalledWith({ kind: 'error', message: 'That target was already removed.' })
    expect(view.result.current.closed).toEqual({ id: b.id, as: 'removed' })
  })
})

describe('a 403 csrf_failed', () => {
  it('keeps the cache and offers Reload', async () => {
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } })
    try {
      const view = setup()
      await removeWith(view, { reject: problem(403, 'csrf_failed') })
      expect(cached(view.client)).toHaveLength(3)
      const toast = view.show.mock.calls[0][0]
      expect(toast.kind).toBe('error')
      expect(toast.message).toBe('The request wasn’t accepted. Reload and try again.')
      expect(toast.action?.label).toBe('Reload')
      toast.action?.onClick()
      expect(reload).toHaveBeenCalledOnce()
      expect(view.result.current.closed).toEqual({ id: b.id, as: 'kept' })
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
    }
  })

  it('shows the shared csrfToast: its message and Reload action, reloading once', async () => {
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    })
    try {
      const view = setup()
      await removeWith(view, { reject: problem(403, 'csrf_failed') })
      const toast = view.show.mock.calls[0][0]
      expect(toast).toEqual({
        kind: 'error',
        message: REQUEST_NOT_ACCEPTED_TOAST,
        action: { label: RELOAD_LABEL, onClick: expect.any(Function) },
      })
      toast.action?.onClick()
      expect(reload).toHaveBeenCalledOnce()
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: original,
      })
    }
  })
})

describe('other failures', () => {
  it.each([
    ['a 500', problem(500, 'internal_error')],
    ['a network error', new TypeError('Failed to fetch')],
    ['a 403 with another code', problem(403, 'forbidden' as never)],
    ['a 404 with no problem body', new ApiError(404, null, null)],
    ['a 404 with another code', problem(404, 'internal_error')],
  ])('%s gives the generic toast and keeps the cache', async (_name, error) => {
    const view = setup()
    await removeWith(view, { reject: error })
    expect(view.show).toHaveBeenCalledOnce()
    expect(view.show).toHaveBeenCalledWith({ kind: 'error', message: 'Couldn’t remove the target. Try again.' })
    expect(cached(view.client)).toHaveLength(3)
    expect(view.result.current.askedId).toBeNull()
    expect(listTargets).not.toHaveBeenCalled()
  })
})

describe('a 401 unauthenticated', () => {
  it('shows no toast and clears the question', async () => {
    const view = setup()
    await removeWith(view, { reject: problem(401, 'unauthenticated') })
    expect(view.show).not.toHaveBeenCalled()
    expect(view.result.current.askedId).toBeNull()
  })
})
