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
  testTarget,
  updateTarget,
  type TargetInput,
  type TargetList,
  type TargetTestResult,
} from '../../../lib/api/targets'
import { fieldError, makeEmailTarget, makeTargetList, problem, validationProblem } from '../../../test/fixtures'
import { EMPTY_VALUES } from '../lib/targetForm'
import { useTestTarget, type TestFailure } from './useTestTarget'

vi.mock('../../../lib/api/targets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/targets')>()),
  listTargets: vi.fn(),
  createTarget: vi.fn(),
  updateTarget: vi.fn(),
  testTarget: vi.fn(),
}))

const key = targetsQueryKey('s1')
const SEEDED_AT = 1_700_000_000_000
const seed = makeTargetList(makeEmailTarget({ address: 'a@example.com' }))
const input: TargetInput = {
  type: 'email',
  name: 'N',
  address: 'n@example.com',
}
const sent = { ...EMPTY_VALUES, name: 'N', address: 'n@example.com' }

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(key, seed, { updatedAt: SEEDED_AT })
  const show = vi.fn<(toast: ToastInput) => void>()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastContext.Provider value={{ show }}>{children}</ToastContext.Provider>
    </QueryClientProvider>
  )
  return {
    ...renderHook(() => useTestTarget('s1'), { wrapper }),
    client,
    show,
  }
}

type View = ReturnType<typeof setup>['result']
const run = (result: View) =>
  act(async () => {
    await result.current.run(input, sent)
    // Query's observers are notified on the next macrotask.
    await new Promise((resolve) => setTimeout(resolve))
  })
const failureOf = (result: View): TestFailure | null => result.current.failure

beforeEach(() => {
  vi.resetAllMocks()
})

describe('an answer', () => {
  it.each<[string, TargetTestResult]>([
    ['delivered', { delivered: true }],
    ['failed with a reason', { delivered: false, failure_reason: 'no SMTP account configured' }],
  ])('is a result, not a failure, and touches nothing the screen holds: %s (FR-108)', async (_name, answer) => {
    vi.mocked(testTarget).mockResolvedValue(answer)
    const { result, client, show } = setup()
    await run(result)
    expect(testTarget).toHaveBeenCalledWith('s1', input)
    expect(result.current.result).toEqual(answer)
    expect(result.current.failure).toBeNull()
    expect(result.current.input).toEqual(input)
    expect(result.current.sent).toEqual(sent)
    expect(client.getQueryData<TargetList>(key)).toBe(seed)
    expect(client.getQueryState(key)?.dataUpdatedAt).toBe(SEEDED_AT)
    expect(client.isFetching()).toBe(0)
    expect(listTargets).not.toHaveBeenCalled()
    expect(show).not.toHaveBeenCalled()
    expect(createTarget).not.toHaveBeenCalled()
    expect(updateTarget).not.toHaveBeenCalled()
  })

  it('is in flight until it is answered, then gone after clear()', async () => {
    let answer: (value: TargetTestResult) => void = () => {}
    vi.mocked(testTarget).mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const { result } = setup()
    act(() => void result.current.run(input, sent))
    await waitFor(() => expect(result.current.testing).toBe(true))
    act(() => result.current.clear())
    expect(result.current.testing).toBe(true)
    await act(async () => answer({ delivered: true }))
    await waitFor(() => expect(result.current.testing).toBe(false))
    expect(result.current.result).toEqual({ delivered: true })
    act(() => result.current.clear())
    await waitFor(() => expect(result.current.result).toBeNull())
    expect(result.current.input).toBeNull()
  })

  it('sends nothing for a second run while one is in flight', async () => {
    vi.mocked(testTarget).mockReturnValue(new Promise(() => {}))
    const { result } = setup()
    act(() => void result.current.run(input, sent))
    act(() => void result.current.run(input, sent))
    await waitFor(() => expect(testTarget).toHaveBeenCalled())
    expect(testTarget).toHaveBeenCalledOnce()
  })
})

describe('a failure, by status and code', () => {
  const errors = [fieldError('address', 'Enter a valid email address.'), fieldError('name', 'Too long.')]

  it('gives field-errors with the errors in order for a 422', async () => {
    vi.mocked(testTarget).mockRejectedValue(validationProblem(...errors))
    const { result } = setup()
    await run(result)
    expect(result.current.failure).toEqual({ kind: 'field-errors', errors })
    expect(result.current.result).toBeNull()
  })

  it.each<[string, unknown, TestFailure['kind'] | null]>([
    ['a 404', problem(404, 'not_found'), 'not-found'],
    ['a 403 csrf_failed', problem(403, 'csrf_failed'), 'csrf'],
    ['a 500', problem(500, 'internal_error'), 'unexpected'],
    ['a network TypeError', new TypeError('Failed to fetch'), 'unexpected'],
    ['a 413', problem(413, 'payload_too_large'), 'unexpected'],
    ['a 403 with another code', problem(403, 'https_required'), 'unexpected'],
    ['a 404 with no problem body', new ApiError(404, null, null), 'unexpected'],
    ['a 422 with no errors', problem(422, 'validation_failed'), 'unexpected'],
    ['a 401', problem(401, 'unauthenticated'), null],
  ])('maps %s', async (_name, error, kind) => {
    vi.mocked(testTarget).mockRejectedValue(error)
    const { result } = setup()
    await run(result)
    expect(failureOf(result)?.kind ?? null).toBe(kind)
  })

  it('is a new object when the same kind repeats', async () => {
    vi.mocked(testTarget).mockRejectedValue(problem(500, 'internal_error'))
    const { result } = setup()
    await run(result)
    const first = result.current.failure
    act(() => result.current.clear())
    await run(result)
    expect(result.current.failure).toEqual(first)
    expect(result.current.failure).not.toBe(first)
  })
})
