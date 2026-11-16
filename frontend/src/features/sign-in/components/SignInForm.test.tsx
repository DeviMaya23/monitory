import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signIn, type SessionInfo } from '../../../lib/api/session'
import { problem, sessionInfo } from '../../../test/fixtures'
import { SignInForm } from './SignInForm'

vi.mock('../../../lib/api/session')

type Props = ComponentProps<typeof SignInForm>

function setup(props: Partial<Props> = {}) {
  const all: Props = {
    sessionEnded: false,
    unreachable: false,
    rechecking: false,
    onSignedIn: vi.fn<(info: SessionInfo) => void>(),
    onRecheck: vi.fn(),
    ...props,
  }
  const view = render(<SignInForm {...all} />)
  const rerender = (next: Partial<Props>) => view.rerender(<SignInForm {...all} {...next} />)
  return { props: all, rerender, container: view.container }
}

const username = () => screen.getByLabelText('Username')
const password = () => screen.getByLabelText('Password')
const submitButton = () => screen.getByRole('button', { name: /Sign in|Signing in/ })
const retryButton = () => screen.getByRole('button', { name: 'Retry' })
const slot = (container: HTMLElement) => container.querySelector('[aria-live="polite"]')

async function fill(user = 'admin', pass = 'secret') {
  await userEvent.type(username(), user)
  await userEvent.type(password(), pass)
}

async function failWith(error: unknown) {
  vi.mocked(signIn).mockRejectedValueOnce(error)
  await fill()
  await userEvent.click(submitButton())
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('focus and the banner slot', () => {
  it('starts in Username when idle', () => {
    setup()
    expect(username()).toHaveFocus()
  })

  it('starts in Username with the notice', () => {
    setup({ sessionEnded: true })
    expect(username()).toHaveFocus()
  })

  it('starts in Username with the unreachable banner', () => {
    setup({ unreachable: true })
    expect(username()).toHaveFocus()
  })

  it('has the polite live region in the page when idle, empty', () => {
    const { container } = setup()
    expect(slot(container)).toBeInTheDocument()
    expect(slot(container)).toBeEmptyDOMElement()
  })

  it('keeps the live region in every state, and the three failures are alerts', async () => {
    const { container, rerender } = setup()
    await failWith(problem(401, 'invalid_credentials'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Username or password is incorrect.')
    expect(slot(container)).toContainElement(screen.getByRole('alert'))

    vi.mocked(signIn).mockRejectedValueOnce(problem(403, 'https_required', 'x'))
    await userEvent.type(password(), 'again')
    await userEvent.click(submitButton())
    expect(await screen.findByText('Sign-in requires HTTPS')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(slot(container)).toBeInTheDocument()

    vi.mocked(signIn).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await userEvent.click(submitButton())
    expect(await screen.findByText('Can’t reach the server.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    rerender({})
    expect(slot(container)).toBeInTheDocument()
  })
})

describe('submitting', () => {
  it('sends the typed values by the button', async () => {
    vi.mocked(signIn).mockResolvedValue(sessionInfo)
    const { props } = setup()
    await fill()
    await userEvent.click(submitButton())
    expect(signIn).toHaveBeenCalledWith({ username: 'admin', password: 'secret' })
    await waitFor(() => expect(props.onSignedIn).toHaveBeenCalledWith(sessionInfo))
  })

  it.each(['username', 'password'])('sends the values on Enter in the %s field', async (field) => {
    vi.mocked(signIn).mockResolvedValue(sessionInfo)
    setup()
    await userEvent.type(username(), 'admin')
    await userEvent.type(password(), 'secret')
    await userEvent.type(field === 'username' ? username() : password(), '{Enter}')
    expect(signIn).toHaveBeenCalledWith({ username: 'admin', password: 'secret' })
  })

  it('with an empty username sends nothing, focuses Username and marks nothing invalid', async () => {
    setup()
    await userEvent.type(password(), 'secret')
    await userEvent.click(submitButton())
    expect(signIn).not.toHaveBeenCalled()
    expect(username()).toHaveFocus()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(document.querySelector('[aria-invalid]')).toBeNull()
  })

  it('with an empty password sends nothing, focuses Password and marks nothing invalid', async () => {
    setup()
    await userEvent.type(username(), 'admin')
    await userEvent.click(submitButton())
    expect(signIn).not.toHaveBeenCalled()
    expect(password()).toHaveFocus()
    expect(document.querySelector('[aria-invalid]')).toBeNull()
  })

  it('disables the fields and the button while in flight, busy and reading Signing in…', async () => {
    vi.mocked(signIn).mockReturnValue(new Promise(() => {}))
    setup()
    await fill()
    await userEvent.click(submitButton())
    await waitFor(() => expect(submitButton()).toBeDisabled())
    expect(submitButton()).toHaveAttribute('aria-busy', 'true')
    expect(submitButton()).toHaveTextContent('Signing in…')
    expect(username()).toBeDisabled()
    expect(password()).toBeDisabled()
  })
})

describe('outcomes', () => {
  it('401 invalid_credentials: clears the password, keeps the username, focuses Password (FR-1)', async () => {
    setup()
    await failWith(problem(401, 'invalid_credentials'))
    expect(await screen.findByText('Username or password is incorrect.')).toBeInTheDocument()
    expect(password()).toHaveValue('')
    expect(username()).toHaveValue('admin')
    expect(password()).toHaveFocus()
  })

  it('401 invalid_credentials: the text is the same whatever was typed (FR-1)', async () => {
    setup()
    vi.mocked(signIn).mockRejectedValue(problem(401, 'invalid_credentials'))
    await fill('nobody', 'x')
    await userEvent.click(submitButton())
    const first = (await screen.findByRole('alert')).textContent
    await userEvent.clear(username())
    await userEvent.type(username(), 'admin')
    await userEvent.type(password(), 'y')
    await userEvent.click(submitButton())
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('alert').textContent).toBe(first)
  })

  it('403 https_required: shows the title and the detail exactly, keeps the values, focuses the button (FR-97)', async () => {
    setup()
    await failWith(problem(403, 'https_required', 'Set REQUIRE_HTTPS=false  to allow HTTP.'))
    expect(await screen.findByText('Sign-in requires HTTPS')).toBeInTheDocument()
    const detail = screen.getByText('Set REQUIRE_HTTPS=false  to allow HTTP.', { normalizer: (t) => t })
    expect(detail).toHaveClass('signin__detail')
    expect(username()).toHaveValue('admin')
    expect(password()).toHaveValue('secret')
    expect(submitButton()).toHaveFocus()
  })

  it('403 https_required: a detail with markup is plain text and creates no element (NFR-7)', async () => {
    const { container } = setup()
    await failWith(problem(403, 'https_required', '<b>x</b>'))
    expect(await screen.findByText('<b>x</b>')).toBeInTheDocument()
    expect(container.querySelector('b')).toBeNull()
  })

  it('403 https_required without a detail shows the title alone', async () => {
    const { container } = setup()
    await failWith(problem(403, 'https_required'))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Sign-in requires HTTPS')).toBeInTheDocument()
    expect(container.querySelector('.signin__detail')).toBeNull()
  })

  it.each([
    ['a network failure', new TypeError('Failed to fetch')],
    ['a 500', problem(500, 'internal_error')],
    ['a 422', problem(422, 'validation_failed')],
    ['a 429', problem(429, 'sign_in_locked')],
  ])('%s shows the unexpected banner, focuses Retry, and Retry sends the same values', async (_name, error) => {
    const { props } = setup()
    await failWith(error)
    expect(await screen.findByText('Can’t reach the server.')).toBeInTheDocument()
    expect(screen.getByText('Check your connection and try again.')).toBeInTheDocument()
    expect(retryButton()).toHaveFocus()
    expect(username()).toHaveValue('admin')
    expect(password()).toHaveValue('secret')

    vi.mocked(signIn).mockResolvedValueOnce(sessionInfo)
    await userEvent.click(retryButton())
    expect(signIn).toHaveBeenCalledTimes(2)
    expect(signIn).toHaveBeenLastCalledWith({ username: 'admin', password: 'secret' })
    await waitFor(() => expect(props.onSignedIn).toHaveBeenCalledWith(sessionInfo))
  })

  it('a second failure replaces the first banner: never more than one', async () => {
    setup()
    await failWith(problem(401, 'invalid_credentials'))
    await screen.findByText('Username or password is incorrect.')
    vi.mocked(signIn).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await userEvent.type(password(), 'again')
    await userEvent.click(submitButton())
    await screen.findByText('Can’t reach the server.')
    expect(screen.queryByText('Username or password is incorrect.')).not.toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })
})

describe('unreachable session and the notice', () => {
  it('unreachable shows the banner and Retry calls the callback, not signIn', async () => {
    const { props } = setup({ unreachable: true })
    expect(screen.getByText('Can’t reach the server.')).toBeInTheDocument()
    await userEvent.click(retryButton())
    expect(props.onRecheck).toHaveBeenCalledTimes(1)
    expect(signIn).not.toHaveBeenCalled()
  })

  it('rechecking disables Retry, both fields and the button', () => {
    setup({ unreachable: true, rechecking: true })
    expect(retryButton()).toBeDisabled()
    expect(username()).toBeDisabled()
    expect(password()).toBeDisabled()
    expect(submitButton()).toBeDisabled()
  })

  it('when rechecking ends still unreachable, focus is on Retry', () => {
    const { rerender } = setup({ unreachable: true, rechecking: true })
    rerender({ unreachable: true, rechecking: false })
    expect(retryButton()).toHaveFocus()
  })

  it('when rechecking ends with unreachable cleared, focus is in Username and the banner is gone', () => {
    const { rerender } = setup({ unreachable: true, rechecking: true })
    rerender({ unreachable: false, rechecking: false })
    expect(username()).toHaveFocus()
    expect(screen.queryByText('Can’t reach the server.')).not.toBeInTheDocument()
  })

  it('a 401 submit shows the credentials banner, not the unreachable one', async () => {
    setup({ unreachable: true })
    await failWith(problem(401, 'invalid_credentials'))
    expect(await screen.findByText('Username or password is incorrect.')).toBeInTheDocument()
    expect(screen.queryByText('Can’t reach the server.')).not.toBeInTheDocument()
  })

  it('the session-ended notice has no alert role and is gone once a submit starts', async () => {
    vi.mocked(signIn).mockReturnValue(new Promise(() => {}))
    setup({ sessionEnded: true })
    expect(screen.getByText('Your session has ended.')).toBeInTheDocument()
    expect(screen.getByText('Sign in again to continue.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await fill()
    await userEvent.click(submitButton())
    await waitFor(() => expect(submitButton()).toBeDisabled())
    expect(screen.queryByText('Your session has ended.')).not.toBeInTheDocument()
  })

  it('the notice does not come back after a failed submit', async () => {
    setup({ sessionEnded: true })
    await failWith(problem(401, 'invalid_credentials'))
    await screen.findByText('Username or password is incorrect.')
    expect(screen.queryByText('Your session has ended.')).not.toBeInTheDocument()
  })
})
