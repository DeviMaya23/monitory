import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastContext, type ToastInput } from '../../../components/ui/useToast'
import { ApiError } from '../../../lib/api/ApiError'
import {
  createTarget,
  listTargets,
  targetsQueryKey,
  updateTarget,
  type Target,
  type TargetInput,
  type TargetList,
} from '../../../lib/api/targets'
import {
  fieldError,
  makeEmailTarget,
  makeTargetList,
  makeWebhookTarget,
  problem,
  validationProblem,
} from '../../../test/fixtures'
import { useSaveTarget, type SaveFailure } from './useSaveTarget'

vi.mock('../../../lib/api/targets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/targets')>()),
  listTargets: vi.fn(),
  createTarget: vi.fn(),
  updateTarget: vi.fn(),
}))

const a = makeEmailTarget({ address: 'a@example.com' })
const b = makeWebhookTarget({ url: 'https://b.example.com' })
const SEEDED_AT = 1_700_000_000_000
const key = targetsQueryKey('s1')
const input: TargetInput = { type: 'email', name: 'N', address: 'n@example.com' }

function setup(seed: TargetList | null = makeTargetList(a, b)) {
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
  const view = renderHook(() => useSaveTarget('s1'), { wrapper })
  return { ...view, client, show }
}

const cached = (client: QueryClient) => client.getQueryData<TargetList>(key)

beforeEach(() => {
  vi.resetAllMocks()
})

describe('a success', () => {
  it('201 appends the returned target last, keeps the others and the load time, and does not refetch (FR-14)', async () => {
    const created = makeEmailTarget({ address: 'new@example.com' })
    vi.mocked(createTarget).mockResolvedValue(created)
    const { result, client, show } = setup()
    const before = cached(client)
    let returned: Target | null = null
    await act(async () => {
      returned = await result.current.submit(input, null)
    })
    expect(returned).toBe(created)
    expect(createTarget).toHaveBeenCalledOnce()
    expect(createTarget).toHaveBeenCalledWith('s1', input)
    const list = cached(client)
    expect(list).toHaveLength(3)
    expect(list?.[0]).toBe(before?.[0])
    expect(list?.[1]).toBe(before?.[1])
    expect(list?.[2]).toBe(created)
    expect(client.getQueryState(key)?.dataUpdatedAt).toBe(SEEDED_AT)
    expect(listTargets).not.toHaveBeenCalled()
    expect(show).toHaveBeenCalledWith({ kind: 'success', message: 'Target added.' })
  })

  it('200 replaces the target in place with both ids passed (FR-15)', async () => {
    const saved = { ...b, name: 'Renamed' } as Target
    vi.mocked(updateTarget).mockResolvedValue(saved)
    const { result, client, show } = setup()
    const before = cached(client)
    await act(async () => {
      await result.current.submit(input, b.id)
    })
    expect(updateTarget).toHaveBeenCalledWith('s1', b.id, input)
    const list = cached(client)
    expect(list?.[0]).toBe(before?.[0])
    expect(list?.[1]).toEqual(saved)
    expect(list).toHaveLength(2)
    expect(show).toHaveBeenCalledWith({ kind: 'success', message: 'Target saved.' })
  })

  it('creates no list when none is cached', async () => {
    vi.mocked(createTarget).mockResolvedValue(a)
    const { result, client, show } = setup(null)
    await act(async () => {
      await result.current.submit(input, null)
    })
    expect(cached(client)).toBeUndefined()
    expect(show).toHaveBeenCalledOnce()
  })

  it('cancels a list request in flight, so an older reload does not remove the new target', async () => {
    const created = makeEmailTarget({ address: 'new@example.com' })
    let resolveReload: (list: TargetList) => void = () => {}
    vi.mocked(listTargets).mockReturnValue(new Promise((resolve) => (resolveReload = resolve)))
    vi.mocked(createTarget).mockResolvedValue(created)
    const { result, client } = setup()
    void client.refetchQueries({ queryKey: key })
    await waitFor(() => expect(listTargets).toHaveBeenCalled())
    await act(async () => {
      await result.current.submit(input, null)
    })
    await act(async () => resolveReload(makeTargetList(a, b)))
    expect(cached(client)?.map((t) => t.id)).toEqual([a.id, b.id, created.id])
  })

  it('still writes the cache and shows the toast after the page has unmounted', async () => {
    let resolveCreate: (target: Target) => void = () => {}
    vi.mocked(createTarget).mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)))
    const created = makeEmailTarget({ address: 'late@example.com' })
    const { result, client, show, unmount } = setup()
    void act(() => void result.current.submit(input, null))
    unmount()
    await act(async () => resolveCreate(created))
    await waitFor(() => expect(show).toHaveBeenCalledWith({ kind: 'success', message: 'Target added.' }))
    expect(cached(client)?.at(-1)).toBe(created)
  })
})

describe('a failure is a value', () => {
  async function fail(error: unknown, targetId: string | null = null, expected: unknown = true) {
    if (targetId === null) vi.mocked(createTarget).mockRejectedValueOnce(error)
    else vi.mocked(updateTarget).mockRejectedValueOnce(error)
    const view = setup()
    const before = cached(view.client)
    let returned: Target | null = a
    await act(async () => {
      returned = await view.result.current.submit(input, targetId)
    })
    expect(returned).toBeNull()
    expect(view.show).not.toHaveBeenCalled()
    expect(cached(view.client)).toBe(before)
    // The observer tells the hook on its own schedule.
    await waitFor(() => expect(view.result.current.saving).toBe(false))
    if (expected !== null) await waitFor(() => expect(view.result.current.failure).not.toBeNull())
    return view.result.current.failure
  }

  it('422 gives field-errors with the server’s errors in order', async () => {
    const e1 = fieldError('address', 'bad')
    const e2 = fieldError('headers[0].name', 'empty')
    const failure = await fail(validationProblem(e1, e2))
    expect(failure).toEqual({ kind: 'field-errors', errors: [e1, e2] })
  })

  it.each<[string, unknown, string | null, SaveFailure | null]>([
    ['409 target_duplicate', problem(409, 'target_duplicate'), null, { kind: 'duplicate', type: 'email' }],
    ['409 target_duplicate on edit', problem(409, 'target_duplicate'), 't1', { kind: 'duplicate', type: 'email' }],
    ['409 alert_list_full', problem(409, 'alert_list_full'), null, { kind: 'full' }],
    ['404', problem(404, 'not_found'), null, { kind: 'not-found' }],
    ['403 csrf_failed', problem(403, 'csrf_failed'), null, { kind: 'csrf' }],
    ['500', problem(500, 'internal_error'), null, { kind: 'unexpected' }],
    ['a network TypeError', new TypeError('Failed to fetch'), null, { kind: 'unexpected' }],
    ['413', problem(413, 'payload_too_large'), null, { kind: 'unexpected' }],
    ['a 403 with another code', problem(403, 'forbidden' as never), null, { kind: 'unexpected' }],
    ['a 404 with no problem body', new ApiError(404, null, null), null, { kind: 'unexpected' }],
    ['a 422 with no errors', problem(422, 'validation_failed'), null, { kind: 'unexpected' }],
    ['alert_list_full on an edit', problem(409, 'alert_list_full'), 't1', { kind: 'unexpected' }],
    ['401', problem(401, 'unauthenticated'), null, null],
  ])('%s', async (_name, error, targetId, expected) => {
    expect(await fail(error, targetId, expected)).toEqual(expected)
  })

  it('gives a new object for every failure, even of the same kind', async () => {
    const error = problem(500, 'internal_error')
    vi.mocked(createTarget).mockRejectedValue(error)
    const { result } = setup()
    await act(async () => void (await result.current.submit(input, null)))
    await waitFor(() => expect(result.current.failure).not.toBeNull())
    const first = result.current.failure
    await act(async () => void (await result.current.submit(input, null)))
    await waitFor(() => {
      expect(result.current.failure).not.toBeNull()
      expect(result.current.failure).not.toBe(first)
    })
    expect(result.current.failure).toEqual(first)
  })

  it('starts a new request with no failure', async () => {
    vi.mocked(createTarget).mockRejectedValueOnce(problem(500, 'internal_error')).mockResolvedValueOnce(a)
    const { result } = setup()
    await act(async () => void (await result.current.submit(input, null)))
    await waitFor(() => expect(result.current.failure).not.toBeNull())
    await act(async () => void (await result.current.submit(input, null)))
    await waitFor(() => expect(result.current.failure).toBeNull())
  })
})

describe('in flight', () => {
  it('sends nothing for a second submit and reports saving', async () => {
    let resolveCreate: (target: Target) => void = () => {}
    vi.mocked(createTarget).mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)))
    const { result } = setup()
    let first: Promise<Target | null> = Promise.resolve(null)
    act(() => {
      first = result.current.submit(input, null)
    })
    await waitFor(() => expect(result.current.saving).toBe(true))
    let second: Target | null = a
    await act(async () => {
      second = await result.current.submit(input, null)
    })
    expect(second).toBeNull()
    expect(createTarget).toHaveBeenCalledOnce()
    await act(async () => {
      resolveCreate(a)
      await first
    })
    await waitFor(() => expect(result.current.saving).toBe(false))
  })
})
