import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getService, serviceQueryKey, servicesQueryKey } from '../../../lib/api/services'
import { makeService, problem } from '../../../test/fixtures'
import { useService } from './useService'

vi.mock('../../../lib/api/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/services')>()),
  getService: vi.fn(),
}))

function setup(client = new QueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...renderHook(() => useService('abc'), { wrapper }), wrapper }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useService', () => {
  it('is loading before an answer, then loaded with the service', async () => {
    const service = makeService({ id: 'abc' })
    vi.mocked(getService).mockResolvedValue(service)
    const { result } = setup()
    expect(result.current.state).toBe('loading')
    await waitFor(() => expect(result.current).toMatchObject({ state: 'loaded', service }))
    expect(getService).toHaveBeenCalledWith('abc')
  })

  it('is session-ended for a 401 unauthenticated', async () => {
    vi.mocked(getService).mockRejectedValue(problem(401, 'unauthenticated'))
    const { result } = setup()
    await waitFor(() => expect(result.current.state).toBe('session-ended'))
  })

  it('is not-found for a 404 not_found, and drops the cached list entry', async () => {
    vi.mocked(getService).mockRejectedValue(problem(404, 'not_found'))
    const client = new QueryClient()
    client.setQueryData(servicesQueryKey, [makeService()])
    const { result } = setup(client)
    await waitFor(() => expect(result.current.state).toBe('not-found'))
    expect(client.getQueryData(servicesQueryKey)).toBeUndefined()
  })

  it.each([
    ['a 500', problem(500, 'internal_error')],
    ['a network failure', new TypeError('Failed to fetch')],
    ['a 404 with another code', problem(404, 'validation_failed')],
    ['a 404 with no problem body', Object.assign(problem(404, 'not_found'), { problem: null })],
  ])('is could-not-load for %s, and refetch after it ends loaded', async (_label, error) => {
    const service = makeService({ id: 'abc' })
    vi.mocked(getService).mockRejectedValueOnce(error).mockResolvedValueOnce(service)
    const { result } = setup()
    await waitFor(() => expect(result.current.state).toBe('could-not-load'))
    act(() => result.current.refetch())
    await waitFor(() => expect(result.current.state).toBe('loaded'))
    expect(getService).toHaveBeenCalledTimes(2)
  })

  it('does not refetch on window focus', async () => {
    vi.mocked(getService).mockResolvedValue(makeService({ id: 'abc' }))
    const { result } = setup()
    await waitFor(() => expect(result.current.state).toBe('loaded'))
    act(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(getService).toHaveBeenCalledTimes(1)
  })

  it('asks the server again on a second mount and keeps nothing after the page closes', async () => {
    vi.mocked(getService).mockResolvedValue(makeService({ id: 'abc', name: 'First' }))
    const client = new QueryClient()
    const first = setup(client)
    await waitFor(() => expect(first.result.current.state).toBe('loaded'))
    first.unmount()
    await waitFor(() => expect(client.getQueryData(serviceQueryKey('abc'))).toBeUndefined())

    vi.mocked(getService).mockResolvedValue(makeService({ id: 'abc', name: 'Second' }))
    const second = setup(client)
    expect(second.result.current.state).toBe('loading')
    await waitFor(() => expect(second.result.current).toMatchObject({ service: { name: 'Second' } }))
    expect(getService).toHaveBeenCalledTimes(2)
  })
})
