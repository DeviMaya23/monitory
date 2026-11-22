import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { serviceQueryKey, servicesQueryKey, updateService, type Service } from '../../../lib/api/services'
import { makeRichService, makeService, problem, validationProblem, fieldError } from '../../../test/fixtures'
import { toFormValues, toServiceInput } from '../lib/serviceInput'
import { useUpdateService } from './useUpdateService'

vi.mock('../../../lib/api/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/services')>()),
  updateService: vi.fn(),
}))

function setup(service: Service) {
  const client = new QueryClient()
  client.setQueryData(servicesQueryKey, [service])
  client.setQueryData(serviceQueryKey(service.id), service)
  const onSaved = vi.fn<(saved: Service) => void>()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, onSaved, ...renderHook(() => useUpdateService(service, onSaved), { wrapper }) }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useUpdateService (FR-7)', () => {
  it('sends the create body and the loaded public flag to the service id', async () => {
    const service = makeRichService({ shown_on_public_view: true })
    vi.mocked(updateService).mockResolvedValue(service)
    const { result } = setup(service)
    const values = { ...toFormValues(service), name: 'Renamed' }
    await act(() => result.current.submit(values))
    expect(updateService).toHaveBeenCalledWith('0190-rich', { ...toServiceInput(values), shown_on_public_view: true })
  })

  it('sends false when the loaded service has no public flag', async () => {
    const service = makeService({ id: 'x', shown_on_public_view: undefined })
    vi.mocked(updateService).mockResolvedValue(service)
    const { result } = setup(service)
    await act(() => result.current.submit(toFormValues(service)))
    expect(vi.mocked(updateService).mock.calls[0][1]).toMatchObject({ shown_on_public_view: false })
  })

  it('on 200 removes the list entry, keeps the detail entry and calls onSaved', async () => {
    const service = makeService({ id: 'x' })
    const answer = makeService({ id: 'x', name: 'Server name' })
    vi.mocked(updateService).mockResolvedValue(answer)
    const { result, client, onSaved } = setup(service)
    await act(() => result.current.submit(toFormValues(service)))
    expect(client.getQueryData(servicesQueryKey)).toBeUndefined()
    expect(client.getQueryData(serviceQueryKey('x'))).toBe(service)
    expect(onSaved).toHaveBeenCalledWith(answer)
  })

  it('classifies a 404 not_found as not-found and drops the list', async () => {
    const service = makeService({ id: 'x' })
    vi.mocked(updateService).mockRejectedValue(problem(404, 'not_found'))
    const { result, client, onSaved } = setup(service)
    await act(() => result.current.submit(toFormValues(service)))
    expect(result.current.failure).toEqual({ kind: 'not-found' })
    expect(client.getQueryData(servicesQueryKey)).toBeUndefined()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('classifies a 409 service_limit_reached as the generic failure', async () => {
    const service = makeService({ id: 'x' })
    vi.mocked(updateService).mockRejectedValue(problem(409, 'service_limit_reached'))
    const { result, client } = setup(service)
    await act(() => result.current.submit(toFormValues(service)))
    expect(result.current.failure).toEqual({ kind: 'unexpected' })
    expect(client.getQueryData(servicesQueryKey)).toBeDefined()
  })

  it.each([
    ['a 409 name taken', problem(409, 'service_name_taken'), { kind: 'name-taken' }],
    ['a 413', problem(413, 'payload_too_large'), { kind: 'too-large' }],
    ['a 403 csrf', problem(403, 'csrf_failed'), { kind: 'csrf' }],
    ['a 500', problem(500, 'internal_error'), { kind: 'unexpected' }],
    ['a network failure', new TypeError('x'), { kind: 'unexpected' }],
    ['a 401', problem(401, 'unauthenticated'), null],
  ])('maps %s as the Add screen does', async (_label, error, expected) => {
    const service = makeService({ id: 'x' })
    vi.mocked(updateService).mockRejectedValue(error)
    const { result } = setup(service)
    await act(() => result.current.submit(toFormValues(service)))
    expect(result.current.failure).toEqual(expected)
  })

  it('maps a 422 to its field errors', async () => {
    const service = makeService({ id: 'x' })
    const errors = [fieldError('name', 'Server says no.')]
    vi.mocked(updateService).mockRejectedValue(validationProblem(...errors))
    const { result } = setup(service)
    await act(() => result.current.submit(toFormValues(service)))
    expect(result.current.failure).toEqual({ kind: 'field-errors', errors })
  })
})
