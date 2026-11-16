import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signIn, type SessionInfo } from '../../../lib/api/session'
import { problem, sessionInfo } from '../../../test/fixtures'
import { useSignIn } from './useSignIn'

vi.mock('../../../lib/api/session')

/** Renders the hook's state as text next to two inputs, since the form binds to DOM refs. */
function Harness({ onSignedIn }: { onSignedIn: (info: SessionInfo) => void }) {
  const { register, submit, retry, submitting, failure } = useSignIn(onSignedIn)
  return (
    <form onSubmit={submit}>
      <input aria-label="u" {...register('username', { required: true })} />
      <input aria-label="p" {...register('password', { required: true })} />
      <button type="submit">go</button>
      <button type="button" onClick={retry}>
        retry
      </button>
      <p data-testid="submitting">{String(submitting)}</p>
      <p data-testid="failure">{failure ? JSON.stringify(failure) : 'none'}</p>
    </form>
  )
}

async function fillAndSubmit(onSignedIn = vi.fn()) {
  render(<Harness onSignedIn={onSignedIn} />)
  await userEvent.type(screen.getByLabelText('u'), 'admin')
  await userEvent.type(screen.getByLabelText('p'), 'secret')
  await userEvent.click(screen.getByText('go'))
  return onSignedIn
}

const failure = () => screen.getByTestId('failure').textContent

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useSignIn', () => {
  it('on 200 calls back with the SessionInfo and sends the typed values', async () => {
    vi.mocked(signIn).mockResolvedValue(sessionInfo)
    const onSignedIn = await fillAndSubmit()
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(sessionInfo))
    expect(signIn).toHaveBeenCalledWith({ username: 'admin', password: 'secret' })
    expect(failure()).toBe('none')
  })

  it('is submitting while the request is in flight', async () => {
    vi.mocked(signIn).mockReturnValue(new Promise(() => {}))
    await fillAndSubmit()
    await waitFor(() => expect(screen.getByTestId('submitting').textContent).toBe('true'))
  })

  it('maps 401 invalid_credentials and clears only the password', async () => {
    vi.mocked(signIn).mockRejectedValue(problem(401, 'invalid_credentials'))
    await fillAndSubmit()
    await waitFor(() => expect(failure()).toBe('{"kind":"invalid-credentials"}'))
    expect(screen.getByLabelText('u')).toHaveValue('admin')
    expect(screen.getByLabelText('p')).toHaveValue('')
  })

  it('maps 403 https_required with its detail, and without one', async () => {
    vi.mocked(signIn).mockRejectedValueOnce(problem(403, 'https_required', 'Use HTTPS.'))
    await fillAndSubmit()
    await waitFor(() => expect(failure()).toBe('{"kind":"https-required","detail":"Use HTTPS."}'))
    expect(screen.getByLabelText('p')).toHaveValue('secret')

    vi.mocked(signIn).mockRejectedValueOnce(problem(403, 'https_required'))
    await userEvent.click(screen.getByText('go'))
    await waitFor(() => expect(failure()).toBe('{"kind":"https-required","detail":null}'))
  })

  it.each([
    ['a network failure', new TypeError('Failed to fetch')],
    ['a 500', problem(500, 'internal_error')],
    ['a 422', problem(422, 'validation_failed')],
    ['a 429', problem(429, 'sign_in_locked')],
    ['a 401 with another code', problem(401, 'unauthenticated')],
  ])('maps %s to unexpected and keeps both values', async (_name, error) => {
    vi.mocked(signIn).mockRejectedValue(error)
    await fillAndSubmit()
    await waitFor(() => expect(failure()).toBe('{"kind":"unexpected"}'))
    expect(screen.getByLabelText('u')).toHaveValue('admin')
    expect(screen.getByLabelText('p')).toHaveValue('secret')
  })

  it('retry sends the same values again', async () => {
    vi.mocked(signIn).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const onSignedIn = await fillAndSubmit()
    await waitFor(() => expect(failure()).toBe('{"kind":"unexpected"}'))
    vi.mocked(signIn).mockResolvedValueOnce(sessionInfo)
    await userEvent.click(screen.getByText('retry'))
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(sessionInfo))
    expect(signIn).toHaveBeenCalledTimes(2)
    expect(signIn).toHaveBeenLastCalledWith({ username: 'admin', password: 'secret' })
  })
})
