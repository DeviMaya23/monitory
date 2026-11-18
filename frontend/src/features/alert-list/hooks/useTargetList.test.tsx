import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import { listTargets } from '../../../lib/api/targets'
import { makeEmailTarget, makeTargetList, makeWebhookTarget, problem } from '../../../test/fixtures'
import { useTargetList } from './useTargetList'

vi.mock('../../../lib/api/targets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/targets')>()),
  listTargets: vi.fn(),
  deleteTarget: vi.fn(),
}))

const two = makeTargetList(makeEmailTarget(), makeWebhookTarget())

function setup() {
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useTargetList('s1'), { wrapper })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('state', () => {
  it('is loading before an answer', () => {
    vi.mocked(listTargets).mockReturnValue(new Promise(() => {}))
    expect(setup().result.current.state).toBe('loading')
  })

  it('is list for two targets and empty for none', async () => {
    vi.mocked(listTargets).mockResolvedValueOnce(two)
    const first = setup()
    await waitFor(() => expect(first.result.current.state).toBe('list'))
    expect(first.result.current.targets).toEqual(two)

    vi.mocked(listTargets).mockResolvedValueOnce([])
    const second = setup()
    await waitFor(() => expect(second.result.current.state).toBe('empty'))
  })

  it.each([
    ['a 500', problem(500, 'internal_error')],
    ['a network error', new TypeError('Failed to fetch')],
    ['a 404 with another code', problem(404, 'internal_error')],
    ['a 404 with no problem body', new ApiError(404, null, null)],
  ])('is could-not-load for %s with no data', async (_name, error) => {
    vi.mocked(listTargets).mockRejectedValueOnce(error)
    const { result } = setup()
    await waitFor(() => expect(result.current.state).toBe('could-not-load'))
    expect(result.current.refreshFailed).toBe(false)
  })

  it('is not-found for a 404 not_found', async () => {
    vi.mocked(listTargets).mockRejectedValueOnce(problem(404, 'not_found'))
    const { result } = setup()
    await waitFor(() => expect(result.current.state).toBe('not-found'))
  })

  it('is not-found for a 404 not_found even when data was cached before', async () => {
    vi.mocked(listTargets).mockResolvedValueOnce(two)
    const { result } = setup()
    await waitFor(() => expect(result.current.state).toBe('list'))
    vi.mocked(listTargets).mockRejectedValueOnce(problem(404, 'not_found'))
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.state).toBe('not-found'))
    expect(result.current.refreshFailed).toBe(false)
  })
})

describe('a failed reload', () => {
  it('keeps the list and sets refreshFailed until refresh() succeeds', async () => {
    vi.mocked(listTargets).mockResolvedValueOnce(two)
    const { result } = setup()
    await waitFor(() => expect(result.current.state).toBe('list'))

    vi.mocked(listTargets).mockRejectedValueOnce(problem(500, 'internal_error'))
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.refreshFailed).toBe(true))
    expect(result.current.state).toBe('list')
    expect(result.current.targets).toEqual(two)

    vi.mocked(listTargets).mockResolvedValueOnce(two)
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.refreshFailed).toBe(false))
    expect(listTargets).toHaveBeenCalledTimes(3)
  })
})

it('asks for the service in the address', async () => {
  vi.mocked(listTargets).mockResolvedValueOnce([])
  setup()
  await waitFor(() => expect(listTargets).toHaveBeenCalledWith('s1'))
})
