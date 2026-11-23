import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testServiceCheck, type ServiceTestResult } from '../../../lib/api/services'
import { fieldError, problem, validationProblem } from '../../../test/fixtures'
import { ADD_DEFAULT_VALUES, type ServiceFormValues } from '../lib/formValues'
import { useTestCheck } from './useTestCheck'

vi.mock('../../../lib/api/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/services')>()),
  testServiceCheck: vi.fn(),
}))

const values: ServiceFormValues = { ...ADD_DEFAULT_VALUES, url: 'https://probe.example.com/up', timeout: '7' }
const answer: ServiceTestResult = { healthy: true, duration_ms: 312, http_status: 200, response_body: 'fine' }

beforeEach(() => {
  vi.resetAllMocks()
})

function setup() {
  const onFieldErrors = vi.fn()
  const hook = renderHook(() => useTestCheck(onFieldErrors))
  return { ...hook, onFieldErrors }
}

describe('useTestCheck (FR-104, FR-106)', () => {
  it('goes running, then result with the answer and the type that was sent', async () => {
    let settle: (r: ServiceTestResult) => void = () => {}
    vi.mocked(testServiceCheck).mockReturnValue(new Promise((resolve) => (settle = resolve)))
    const { result } = setup()
    expect(result.current.state).toEqual({ kind: 'idle' })
    let done: Promise<void> = Promise.resolve()
    act(() => {
      done = result.current.run(values)
    })
    expect(result.current.state).toEqual({ kind: 'running' })
    await act(async () => {
      settle(answer)
      await done
    })
    expect(result.current.state).toEqual({ kind: 'result', result: answer, type: 'http' })
    expect(testServiceCheck).toHaveBeenCalledWith({
      check: expect.objectContaining({ type: 'http', url: 'https://probe.example.com/up' }),
      settings: { timeout_seconds: 7 },
    })
  })

  it('sends nothing for a second run while one is in flight', async () => {
    vi.mocked(testServiceCheck).mockReturnValue(new Promise(() => {}))
    const { result } = setup()
    act(() => {
      void result.current.run(values)
      void result.current.run(values)
    })
    expect(testServiceCheck).toHaveBeenCalledTimes(1)
  })

  it('hands the errors of a 422 to the callback and ends refused', async () => {
    const errors = [fieldError('check.url', 'Server says no.')]
    vi.mocked(testServiceCheck).mockRejectedValue(validationProblem(...errors))
    const { result, onFieldErrors } = setup()
    await act(() => result.current.run(values))
    expect(onFieldErrors).toHaveBeenCalledWith(errors)
    expect(result.current.state).toEqual({ kind: 'refused' })
  })

  it.each([
    ['403 csrf_failed', problem(403, 'csrf_failed'), 'csrf'],
    ['413', problem(413, 'payload_too_large'), 'too-large'],
    ['500', problem(500, 'internal_error'), 'unexpected'],
    ['400', problem(400, 'malformed_request'), 'unexpected'],
    ['415', problem(415, 'unsupported_media_type'), 'unexpected'],
    ['a network error', new TypeError('Failed to fetch'), 'unexpected'],
  ])('ends failed for %s', async (_name, error, reason) => {
    vi.mocked(testServiceCheck).mockRejectedValue(error)
    const { result, onFieldErrors } = setup()
    await act(() => result.current.run(values))
    expect(result.current.state).toEqual({ kind: 'failed', reason })
    expect(onFieldErrors).not.toHaveBeenCalled()
  })

  it('ends idle for a 401: the shell ends the session', async () => {
    vi.mocked(testServiceCheck).mockRejectedValue(problem(401, 'unauthenticated'))
    const { result } = setup()
    await act(() => result.current.run(values))
    expect(result.current.state).toEqual({ kind: 'idle' })
  })

  it('refuse() ends refused without a request', () => {
    const { result } = setup()
    act(() => result.current.refuse())
    expect(result.current.state).toEqual({ kind: 'refused' })
    expect(testServiceCheck).not.toHaveBeenCalled()
  })

  it('sets no state and calls no callback after unmount', async () => {
    let settle: (r: ServiceTestResult) => void = () => {}
    vi.mocked(testServiceCheck).mockReturnValue(new Promise((resolve) => (settle = resolve)))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result, unmount } = setup()
    let done: Promise<void> = Promise.resolve()
    act(() => {
      done = result.current.run(values)
    })
    unmount()
    await act(async () => {
      settle(answer)
      await done
    })
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('does not call the callback for a 422 answered after unmount', async () => {
    let fail: (e: unknown) => void = () => {}
    vi.mocked(testServiceCheck).mockReturnValue(new Promise((_, reject) => (fail = reject)))
    const { result, unmount, onFieldErrors } = setup()
    let done: Promise<void> = Promise.resolve()
    act(() => {
      done = result.current.run(values)
    })
    unmount()
    await act(async () => {
      fail(validationProblem(fieldError('check.url', 'late')))
      await done
    })
    expect(onFieldErrors).not.toHaveBeenCalled()
  })
})
