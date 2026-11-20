import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastContext, type ToastInput } from '../../../components/ui/useToast'
import { pauseService, resumeService, servicesQueryKey, type Service } from '../../../lib/api/services'
import { makePaused, makeService, makeServiceList, problem } from '../../../test/fixtures'
import { usePauseService } from './usePauseService'

vi.mock('../../../lib/api/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/services')>()),
  pauseService: vi.fn(),
  resumeService: vi.fn(),
}))

const a = makeService({ name: 'a' })
const b = makeService({ name: 'b' })
const p = makePaused({ name: 'p' })
const SEEDED_AT = 1_700_000_000_000

function setup() {
  const client = new QueryClient()
  client.setQueryData(servicesQueryKey, makeServiceList(a, b, p), { updatedAt: SEEDED_AT })
  const show = vi.fn<(toast: ToastInput) => void>()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastContext.Provider value={{ show }}>{children}</ToastContext.Provider>
    </QueryClientProvider>
  )
  return { ...renderHook(() => usePauseService(), { wrapper }), client, show }
}

type Settle = { resolve: (service: Service) => void; reject: (error: unknown) => void }
function pending(fn: typeof pauseService | typeof resumeService): Settle {
  const settle: Settle = { resolve: () => {}, reject: () => {} }
  vi.mocked(fn).mockReturnValueOnce(
    new Promise<Service>((resolve, reject) => {
      settle.resolve = resolve
      settle.reject = reject
    }),
  )
  return settle
}

const cached = (client: QueryClient) => client.getQueryData<Service[]>(servicesQueryKey)

async function toggleWith(
  view: ReturnType<typeof setup>,
  service: Service,
  outcome: { resolve: Service } | { reject: unknown },
) {
  const settle = pending(service.paused ? resumeService : pauseService)
  act(() => view.result.current.toggle(service))
  await act(async () => {
    if ('resolve' in outcome) settle.resolve(outcome.resolve)
    else settle.reject(outcome.reject)
  })
  await waitFor(() => expect(view.result.current.isPending(service.id)).toBe(false))
}

beforeEach(() => {
  vi.resetAllMocks()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('toggle', () => {
  it('pauses an unpaused service by its id and resumes a paused one', async () => {
    const view = setup()
    await toggleWith(view, a, { resolve: { ...a, paused: true } })
    expect(pauseService).toHaveBeenCalledExactlyOnceWith('id-a')
    expect(resumeService).not.toHaveBeenCalled()
    await toggleWith(view, p, { resolve: { ...p, paused: false } })
    expect(resumeService).toHaveBeenCalledExactlyOnceWith('id-p')
    expect(pauseService).toHaveBeenCalledTimes(1)
  })

  it('while a request is in flight sends nothing for the same id, does not block another id, and unlocks after the answer', async () => {
    const view = setup()
    const first = pending(pauseService)
    act(() => view.result.current.toggle(a))
    expect(view.result.current.isPending('id-a')).toBe(true)
    expect(view.result.current.isPending('id-b')).toBe(false)
    act(() => view.result.current.toggle(a))
    await act(async () => {})
    expect(pauseService).toHaveBeenCalledTimes(1)

    const second = pending(pauseService)
    act(() => view.result.current.toggle(b))
    await waitFor(() => expect(pauseService).toHaveBeenCalledTimes(2))
    expect(view.result.current.isPending('id-a')).toBe(true)
    expect(view.result.current.isPending('id-b')).toBe(true)

    await act(async () => first.resolve({ ...a, paused: true }))
    await waitFor(() => expect(view.result.current.isPending('id-a')).toBe(false))
    expect(view.result.current.isPending('id-b')).toBe(true)
    await act(async () => second.resolve({ ...b, paused: true }))
    await waitFor(() => expect(view.result.current.isPending('id-b')).toBe(false))
    expect(cached(view.client)?.map((s) => s.paused)).toEqual([true, true, true])
  })
})

describe('a 200', () => {
  it('replaces the cached row with the answer and shows the pause toast with the name from the answer', async () => {
    const view = setup()
    const answer = { ...a, name: 'renamed', paused: true }
    await toggleWith(view, a, { resolve: answer })
    expect(cached(view.client)).toEqual([answer, b, p])
    expect(view.client.getQueryState(servicesQueryKey)?.dataUpdatedAt).toBe(SEEDED_AT)
    expect(view.show).toHaveBeenCalledExactlyOnceWith({
      kind: 'success',
      message: '“renamed” paused. Checks and alerts stopped.',
    })
  })

  it('shows the resume toast after a resume', async () => {
    const view = setup()
    const answer = { ...p, paused: false }
    await toggleWith(view, p, { resolve: answer })
    expect(cached(view.client)).toEqual([a, b, answer])
    expect(view.show).toHaveBeenCalledExactlyOnceWith({ kind: 'success', message: '“p” resumed. Checking now.' })
  })
})

describe('failures', () => {
  it('a 404 not_found removes the row and says the service was already deleted', async () => {
    const view = setup()
    await toggleWith(view, b, { reject: problem(404, 'not_found') })
    expect(cached(view.client)).toEqual([a, p])
    expect(view.show).toHaveBeenCalledExactlyOnceWith({ kind: 'error', message: 'That service was already deleted.' })
  })

  it('a 403 csrf_failed shows the toast with a Reload action that reloads once, and keeps the row', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const view = setup()
    await toggleWith(view, a, { reject: problem(403, 'csrf_failed') })
    expect(cached(view.client)).toEqual([a, b, p])
    const toast = view.show.mock.calls[0][0]
    expect(toast.message).toBe('The request wasn’t accepted. Reload and try again.')
    expect(toast.action?.label).toBe('Reload')
    expect(reload).not.toHaveBeenCalled()
    toast.action?.onClick()
    expect(reload).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('a 401 shows no toast and keeps the row', async () => {
    const view = setup()
    await toggleWith(view, a, { reject: problem(401, 'unauthenticated') })
    expect(view.show).not.toHaveBeenCalled()
    expect(cached(view.client)).toEqual([a, b, p])
  })

  it.each([
    ['a 500', problem(500, 'internal_error')],
    ['a network error', new TypeError('Failed to fetch')],
  ])('%s shows the failure toast of the pause and of the resume and keeps the row', async (_label, error) => {
    const view = setup()
    await toggleWith(view, a, { reject: error })
    expect(view.show).toHaveBeenLastCalledWith({ kind: 'error', message: 'Couldn’t pause the service. Try again.' })
    await toggleWith(view, p, { reject: error })
    expect(view.show).toHaveBeenLastCalledWith({ kind: 'error', message: 'Couldn’t resume the service. Try again.' })
    expect(view.show).toHaveBeenCalledTimes(2)
    expect(cached(view.client)).toEqual([a, b, p])
  })

  it('unlocks the id after a failure so the next toggle sends again', async () => {
    const view = setup()
    await toggleWith(view, a, { reject: problem(500, 'internal_error') })
    await toggleWith(view, a, { resolve: { ...a, paused: true } })
    expect(pauseService).toHaveBeenCalledTimes(2)
  })
})
