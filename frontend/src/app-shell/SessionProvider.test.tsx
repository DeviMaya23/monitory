import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/ui/Toast'
import { setCsrfToken, setUnauthenticatedHandler } from '../lib/api/request'
import { getSession, signOut, type SessionInfo } from '../lib/api/session'
import { problem, sessionInfo } from '../test/fixtures'
import { SessionProvider } from './SessionProvider'
import { useSession } from './useSession'
import { RELOAD_LABEL, REQUEST_NOT_ACCEPTED_TOAST } from '../lib/requestNotAccepted'

vi.mock('../lib/api/session')
vi.mock('../lib/api/request', () => ({
  setCsrfToken: vi.fn(),
  setUnauthenticatedHandler: vi.fn(),
}))

function Harness({ info }: { info?: SessionInfo }) {
  const s = useSession()
  return (
    <div>
      <p data-testid="state">{s.state}</p>
      <p data-testid="rechecking">{String(s.rechecking)}</p>
      <p data-testid="notice">{String(s.notice)}</p>
      <button onClick={s.recheck}>recheck</button>
      <button onClick={s.signOut}>sign out</button>
      <button onClick={() => s.signedIn(info ?? sessionInfo)}>signed in</button>
    </div>
  )
}

function setup(client = new QueryClient()) {
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <SessionProvider>
          <Harness />
        </SessionProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return { client, ...view }
}

const state = () => screen.getByTestId('state').textContent
const notice = () => screen.getByTestId('notice').textContent

/** The handler `SessionProvider` last gave to `setUnauthenticatedHandler`. */
function registeredHandler(): () => void {
  const calls = vi.mocked(setUnauthenticatedHandler).mock.calls.filter(([h]) => h !== null)
  const handler = calls[calls.length - 1]?.[0]
  if (!handler) throw new Error('no handler registered')
  return handler
}

async function signedInSetup() {
  vi.mocked(getSession).mockResolvedValue(sessionInfo)
  const view = setup()
  await waitFor(() => expect(state()).toBe('signed-in'))
  return view
}

beforeEach(() => {
  vi.resetAllMocks()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('session check', () => {
  it('gives signed in on 200 and passes the CSRF token on (NFR-8)', async () => {
    vi.mocked(getSession).mockResolvedValue(sessionInfo)
    setup()
    expect(state()).toBe('checking')
    await waitFor(() => expect(state()).toBe('signed-in'))
    expect(setCsrfToken).toHaveBeenCalledWith('csrf-1')
    expect(getSession).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a 401 unauthenticated', problem(401, 'unauthenticated'), 'signed-out'],
    ['a network failure', new TypeError('Failed to fetch'), 'unreachable'],
    ['a 500', problem(500, 'internal_error'), 'unreachable'],
  ])('%s gives %s, after one call', async (_name, error, expected) => {
    vi.mocked(getSession).mockRejectedValue(error)
    setup()
    await waitFor(() => expect(state()).toBe(expected))
    expect(getSession).toHaveBeenCalledTimes(1)
    expect(setCsrfToken).not.toHaveBeenCalled()
  })

  it('recheck from unreachable calls again, stays unreachable while in flight, then follows the answer', async () => {
    vi.mocked(getSession).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    setup()
    await waitFor(() => expect(state()).toBe('unreachable'))

    let answer: (info: SessionInfo) => void = () => {}
    vi.mocked(getSession).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    await userEvent.click(screen.getByText('recheck'))
    await waitFor(() => expect(screen.getByTestId('rechecking').textContent).toBe('true'))
    expect(state()).toBe('unreachable')
    expect(getSession).toHaveBeenCalledTimes(2)

    await act(async () => answer(sessionInfo))
    await waitFor(() => expect(state()).toBe('signed-in'))
    expect(screen.getByTestId('rechecking').textContent).toBe('false')
  })
})

describe('signedIn', () => {
  it('passes the CSRF token on and gives signed in (NFR-8)', async () => {
    vi.mocked(getSession).mockRejectedValue(problem(401, 'unauthenticated'))
    setup()
    await waitFor(() => expect(state()).toBe('signed-out'))
    await userEvent.click(screen.getByText('signed in'))
    expect(setCsrfToken).toHaveBeenCalledWith('csrf-1')
    expect(state()).toBe('signed-in')
  })
})

describe('a session that ends', () => {
  it('while signed in gives signed out with the notice and drops other queries', async () => {
    const { client } = await signedInSetup()
    client.setQueryData(['services'], [1])
    act(() => registeredHandler()())
    expect(state()).toBe('signed-out')
    expect(notice()).toBe('true')
    expect(client.getQueryData(['services'])).toBeUndefined()
  })

  it('while checking sets no notice', async () => {
    vi.mocked(getSession).mockReturnValue(new Promise(() => {}))
    setup()
    act(() => registeredHandler()())
    expect(state()).toBe('checking')
    expect(notice()).toBe('false')
  })

  it('then signing in clears the notice at once, and a later sign-out leaves it clear', async () => {
    await signedInSetup()
    act(() => registeredHandler()())
    expect(notice()).toBe('true')
    await userEvent.click(screen.getByText('signed in'))
    expect(notice()).toBe('false')
    vi.mocked(signOut).mockResolvedValue(undefined)
    await userEvent.click(screen.getByText('sign out'))
    await waitFor(() => expect(state()).toBe('signed-out'))
    expect(notice()).toBe('false')
  })
})

describe('sign-out', () => {
  it('on 204 clears the token, gives signed out with no notice and drops other queries (FR-3)', async () => {
    const { client } = await signedInSetup()
    client.setQueryData(['services'], [1])
    vi.mocked(signOut).mockResolvedValue(undefined)
    await userEvent.click(screen.getByText('sign out'))
    await waitFor(() => expect(state()).toBe('signed-out'))
    expect(setCsrfToken).toHaveBeenLastCalledWith(null)
    expect(screen.queryAllByRole('alertdialog', { hidden: true })).toHaveLength(0)
    expect(notice()).toBe('false')
    expect(client.getQueryData(['services'])).toBeUndefined()
  })

  it('on 401 unauthenticated, with the handler called first, ends signed out with no notice', async () => {
    await signedInSetup()
    vi.mocked(signOut).mockImplementation(async () => {
      registeredHandler()()
      throw problem(401, 'unauthenticated')
    })
    await userEvent.click(screen.getByText('sign out'))
    // Right after the handler ran, before the rejection was handled.
    expect(notice()).toBe('false')
    await waitFor(() => expect(state()).toBe('signed-out'))
    expect(notice()).toBe('false')
  })

  it('on a 500 stays signed in and shows the error toast, with no action (NFR-8)', async () => {
    await signedInSetup()
    vi.mocked(signOut).mockRejectedValue(problem(500, 'internal_error'))
    await userEvent.click(screen.getByText('sign out'))
    await waitFor(() => expect(signOut).toHaveBeenCalled())
    await waitFor(() => expect(vi.mocked(signOut).mock.settledResults[0]?.type).toBe('rejected'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t sign out. Try again.')
    expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument()
    expect(state()).toBe('signed-in')
    expect(notice()).toBe('false')
  })

  it('on a network failure shows the same toast and stays signed in', async () => {
    await signedInSetup()
    vi.mocked(signOut).mockRejectedValue(new TypeError('Failed to fetch'))
    await userEvent.click(screen.getByText('sign out'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t sign out. Try again.')
    expect(state()).toBe('signed-in')
  })

  it('on 403 csrf_failed shows the toast with Reload, which reloads once; stays signed in (NFR-8)', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    await signedInSetup()
    vi.mocked(signOut).mockRejectedValue(problem(403, 'csrf_failed'))
    await userEvent.click(screen.getByText('sign out'))
    expect(await screen.findByRole('alert')).toHaveTextContent('The request wasn’t accepted. Reload and try again.')
    expect(state()).toBe('signed-in')
    expect(reload).not.toHaveBeenCalled()

    fireEvent.focus(screen.getAllByRole('alertdialog', { hidden: true })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledTimes(1)
    expect(state()).toBe('signed-in')
  })

  it('shows the shared csrfToast: its message and Reload action', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    await signedInSetup()
    vi.mocked(signOut).mockRejectedValue(problem(403, 'csrf_failed'))
    await userEvent.click(screen.getByText('sign out'))
    const toast = await screen.findByRole('alert')
    expect(toast).toHaveTextContent(REQUEST_NOT_ACCEPTED_TOAST)
    fireEvent.focus(screen.getAllByRole('alertdialog', { hidden: true })[0])
    expect(screen.getByRole('button', { name: RELOAD_LABEL })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: RELOAD_LABEL }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('on 401 unauthenticated shows no toast', async () => {
    await signedInSetup()
    vi.mocked(signOut).mockRejectedValue(problem(401, 'unauthenticated'))
    await userEvent.click(screen.getByText('sign out'))
    await waitFor(() => expect(state()).toBe('signed-out'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('alertdialog', { hidden: true })).toHaveLength(0)
  })

  it('a 401 from another request after a failed sign-out still ends the session with the notice', async () => {
    await signedInSetup()
    vi.mocked(signOut).mockRejectedValue(problem(500, 'internal_error'))
    await userEvent.click(screen.getByText('sign out'))
    await waitFor(() => expect(vi.mocked(signOut).mock.settledResults[0]?.type).toBe('rejected'))
    await act(async () => registeredHandler()())
    expect(notice()).toBe('true')
  })
})

describe('the handler', () => {
  it('is set to null on unmount', () => {
    vi.mocked(getSession).mockReturnValue(new Promise(() => {}))
    const { unmount } = setup()
    unmount()
    expect(setUnauthenticatedHandler).toHaveBeenLastCalledWith(null)
  })
})
