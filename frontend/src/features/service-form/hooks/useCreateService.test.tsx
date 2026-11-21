import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createService, type Service } from '../../../lib/api/services'
import { fieldError, makeService, problem, validationProblem } from '../../../test/fixtures'
import { useCreateService, type ServiceFormValues } from './useCreateService'

vi.mock('../../../lib/api/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/services')>()),
  createService: vi.fn(),
}))

const VALUES: ServiceFormValues = {
  name: 'Search API',
  method: 'POST',
  url: 'https://search.example.com/health',
  query_params: [],
  headers: [],
  body_type: 'none',
  body_content: '',
  json_rules: [],
  json_rule_mode: 'any',
  cert_enabled: false,
  cert_days: '14',
  ignore_cert_errors: false,
  alerts_enabled: true,
  unhealthy_message: '',
  recovery_message: '',
  check_interval: '60',
  timeout: '10',
  retries: '2',
  retry_interval: '10',
}

function setup() {
  const client = new QueryClient()
  const onCreated = vi.fn<(service: Service) => void>()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const view = renderHook(() => useCreateService(onCreated), { wrapper })
  return { ...view, client, onCreated }
}

type Settle = {
  resolve: (service: Service) => void
  reject: (error: unknown) => void
}
function pending(): Settle {
  const settle: Settle = { resolve: () => {}, reject: () => {} }
  vi.mocked(createService).mockReturnValueOnce(
    new Promise<Service>((resolve, reject) => {
      settle.resolve = resolve
      settle.reject = reject
    }),
  )
  return settle
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('the request rows and body (FR-35, FR-37)', () => {
  it('sends both lists in row order, untrimmed, an empty row as it is, and the body as typed', async () => {
    vi.mocked(createService).mockResolvedValue(makeService())
    const { result } = setup()
    await act(() =>
      result.current.submit({
        ...VALUES,
        query_params: [
          { name: ' a ', value: ' 1 ' },
          { name: '', value: '' },
        ],
        headers: [{ name: 'X-Key', value: 'secret-value' }],
        body_type: 'json',
        body_content: '{"a":1}',
      }),
    )
    expect(vi.mocked(createService).mock.calls[0][0].check).toStrictEqual({
      type: 'http',
      method: 'POST',
      url: 'https://search.example.com/health',
      query_params: [
        { name: ' a ', value: ' 1 ' },
        { name: '', value: '' },
      ],
      headers: [{ name: 'X-Key', value: 'secret-value' }],
      body: { type: 'json', content: '{"a":1}' },
      json_rules: [],
      json_rule_mode: 'any',
      certificate_check: { enabled: false },
      ignore_certificate_errors: false,
    })
  })

  it('sends the rules, the mode and the certificate options as typed (FR-44, FR-47, FR-34, FR-50, FR-64)', async () => {
    vi.mocked(createService).mockResolvedValue(makeService())
    const { result } = setup()
    await act(() =>
      result.current.submit({
        ...VALUES,
        json_rules: [
          { field: 'checks.db.status', kind: 'text', text: ' down ' },
          { field: 'ok', kind: 'false', text: 'kept' },
        ],
        json_rule_mode: 'all',
        cert_enabled: true,
        cert_days: '45',
        ignore_cert_errors: true,
      }),
    )
    expect(vi.mocked(createService).mock.calls[0][0].check).toMatchObject({
      json_rules: [
        { field: 'checks.db.status', failing_value: ' down ' },
        { field: 'ok', failing_value: false },
      ],
      json_rule_mode: 'all',
      certificate_check: { enabled: true, min_days_left: 45 },
      ignore_certificate_errors: true,
    })
  })

  it.each(['text', 'form'] as const)('sends a %s body', async (type) => {
    vi.mocked(createService).mockResolvedValue(makeService())
    const { result } = setup()
    await act(() => result.current.submit({ ...VALUES, body_type: type, body_content: 'a=b' }))
    expect(vi.mocked(createService).mock.calls[0][0]).toMatchObject({ check: { body: { type, content: 'a=b' } } })
  })

  it('sends no body for none, even with text kept in the form', async () => {
    vi.mocked(createService).mockResolvedValue(makeService())
    const { result } = setup()
    await act(() => result.current.submit({ ...VALUES, body_type: 'none', body_content: 'typed' }))
    const check = vi.mocked(createService).mock.calls[0][0].check
    expect('body' in check).toBe(false)
    expect(check).toMatchObject({ query_params: [], headers: [] })
  })
})

describe('a 201', () => {
  it('is a success with the returned service, and the request has the name, the HTTP check and the alert settings (FR-6)', async () => {
    const service = makeService({ name: 'Search API' })
    vi.mocked(createService).mockResolvedValue(service)
    const { result, onCreated } = setup()
    await act(() => result.current.submit(VALUES))
    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(onCreated).toHaveBeenCalledWith(service)
    expect(result.current.failure).toBeNull()
    expect(result.current.saved).toBe(true)
    expect(createService).toHaveBeenCalledTimes(1)
    // toStrictEqual: no other property, so every default stays the server's.
    expect(vi.mocked(createService).mock.calls[0][0]).toStrictEqual({
      name: 'Search API',
      check: {
        type: 'http',
        method: 'POST',
        url: 'https://search.example.com/health',
        query_params: [],
        headers: [],
        json_rules: [],
        json_rule_mode: 'any',
        certificate_check: { enabled: false },
        ignore_certificate_errors: false,
      },
      alerts_enabled: true,
      unhealthy_message: '',
      recovery_message: '',
      settings: {
        check_interval_seconds: 60,
        timeout_seconds: 10,
        retry_count: 2,
        retry_interval_seconds: 10,
      },
    })
  })

  it('sends the four timing texts as integers, trimmed (FR-41, FR-51, FR-53, FR-57)', async () => {
    vi.mocked(createService).mockResolvedValue(makeService())
    const { result } = setup()
    await act(() =>
      result.current.submit({
        ...VALUES,
        check_interval: '45',
        timeout: ' 5 ',
        retries: '0',
        retry_interval: '007',
      }),
    )
    expect(vi.mocked(createService).mock.calls[0][0].settings).toStrictEqual({
      check_interval_seconds: 45,
      timeout_seconds: 5,
      retry_count: 0,
      retry_interval_seconds: 7,
    })
  })

  it('sends alerts off and both messages exactly as given, untrimmed (FR-20, FR-65)', async () => {
    vi.mocked(createService).mockResolvedValue(makeService())
    const { result } = setup()
    await act(() =>
      result.current.submit({
        ...VALUES,
        alerts_enabled: false,
        unhealthy_message: '  text ',
        recovery_message: ' <b>x</b>',
      }),
    )
    const body = vi.mocked(createService).mock.calls[0][0]
    expect(body.alerts_enabled).toBe(false)
    expect(body.unhealthy_message).toBe('  text ')
    expect(body.recovery_message).toBe(' <b>x</b>')
  })

  it('drops the cached service list', async () => {
    vi.mocked(createService).mockResolvedValue(makeService())
    const { result, client } = setup()
    client.setQueryData(['services'], [makeService()])
    client.setQueryData(['session'], { kept: true })
    await act(() => result.current.submit(VALUES))
    expect(client.getQueryData(['services'])).toBeUndefined()
    expect(client.getQueryData(['session'])).toEqual({ kept: true })
  })

  it('after the form has gone still drops the list, and does not call back', async () => {
    const settle = pending()
    const { result, client, onCreated, unmount } = setup()
    client.setQueryData(['services'], [makeService()])
    act(() => void result.current.submit(VALUES))
    unmount()
    await act(async () => settle.resolve(makeService()))
    expect(client.getQueryData(['services'])).toBeUndefined()
    expect(onCreated).not.toHaveBeenCalled()
  })
})

describe('failures (FR-12, FR-59, FR-60, NFR-8)', () => {
  it('422 keeps both errors in the order sent', async () => {
    const errors = [fieldError('check.url', 'Too long.', 'too_long'), fieldError('name', 'Needed.', 'required')]
    vi.mocked(createService).mockRejectedValue(validationProblem(...errors))
    const { result, onCreated } = setup()
    await act(() => result.current.submit(VALUES))
    expect(result.current.failure).toEqual({ kind: 'field-errors', errors })
    expect(onCreated).not.toHaveBeenCalled()
    expect(result.current.saved).toBe(false)
  })

  it.each([
    ['409 service_name_taken', problem(409, 'service_name_taken'), 'name-taken'],
    ['409 service_limit_reached', problem(409, 'service_limit_reached'), 'limit'],
    ['413 payload_too_large', problem(413, 'payload_too_large'), 'too-large'],
    ['403 csrf_failed', problem(403, 'csrf_failed'), 'csrf'],
    ['400 malformed_request', problem(400, 'malformed_request'), 'unexpected'],
    ['415 unsupported_media_type', problem(415, 'unsupported_media_type'), 'unexpected'],
    ['500 internal_error', problem(500, 'internal_error'), 'unexpected'],
    ['a 422 with no errors', problem(422, 'validation_failed'), 'unexpected'],
    ['a network failure', new TypeError('Failed to fetch'), 'unexpected'],
  ])('%s is %s', async (_name, error, kind) => {
    vi.mocked(createService).mockRejectedValue(error)
    const { result } = setup()
    await act(() => result.current.submit(VALUES))
    expect(result.current.failure).toEqual({ kind })
    expect(result.current.saving).toBe(false)
  })

  it('the same failure twice in a row is a new outcome', async () => {
    vi.mocked(createService).mockRejectedValue(problem(403, 'csrf_failed'))
    const { result } = setup()
    await act(() => result.current.submit(VALUES))
    const first = result.current.failure
    await act(() => result.current.submit(VALUES))
    expect(result.current.failure).toEqual(first)
    expect(result.current.failure).not.toBe(first)
  })

  it('clearFailure drops the outcome', async () => {
    vi.mocked(createService).mockRejectedValue(problem(409, 'service_name_taken'))
    const { result } = setup()
    await act(() => result.current.submit(VALUES))
    act(() => result.current.clearFailure())
    expect(result.current.failure).toBeNull()
  })

  it('a 401 the shell handles gives no outcome', async () => {
    const shellHandler = vi.fn()
    // As apiRequest does: run the registered handler, then reject.
    vi.mocked(createService).mockImplementation(async () => {
      shellHandler()
      throw problem(401, 'unauthenticated')
    })
    const { result, onCreated } = setup()
    await act(() => result.current.submit(VALUES))
    expect(shellHandler).toHaveBeenCalledTimes(1)
    expect(result.current.failure).toBeNull()
    expect(result.current.saving).toBe(false)
    expect(result.current.saved).toBe(false)
    expect(onCreated).not.toHaveBeenCalled()
  })
})

describe('saving', () => {
  it('is true in flight, false after a success, and a submit while saving sends nothing', async () => {
    const settle = pending()
    const { result } = setup()
    expect(result.current.saving).toBe(false)
    act(() => void result.current.submit(VALUES))
    expect(result.current.saving).toBe(true)

    await act(() => result.current.submit(VALUES))
    await act(() => result.current.submit({ ...VALUES, name: 'Another' }))
    expect(createService).toHaveBeenCalledTimes(1)
    expect(result.current.saving).toBe(true)

    await act(async () => settle.resolve(makeService()))
    expect(result.current.saving).toBe(false)
  })

  it('is false after a failure, and the failure of the attempt before is gone while the next is in flight', async () => {
    const first = pending()
    const { result } = setup()
    act(() => void result.current.submit(VALUES))
    await act(async () => first.reject(problem(500, 'internal_error')))
    expect(result.current.saving).toBe(false)
    expect(result.current.failure).toEqual({ kind: 'unexpected' })

    const second = pending()
    act(() => void result.current.submit(VALUES))
    expect(result.current.saving).toBe(true)
    expect(result.current.failure).toBeNull()
    await act(async () => second.reject(problem(413, 'payload_too_large')))
    await waitFor(() => expect(result.current.saving).toBe(false))
    expect(result.current.failure).toEqual({ kind: 'too-large' })
    expect(createService).toHaveBeenCalledTimes(2)
  })
})
