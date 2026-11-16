import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { setUnauthenticatedHandler } from './lib/api/request'
import { listServices } from './lib/api/services'
import { getSession, signIn, signOut, type SessionInfo } from './lib/api/session'
import { makeService, makeServiceList, problem, sessionInfo } from './test/fixtures'

vi.mock('./lib/api/session')
vi.mock('./lib/api/services')
vi.mock('./lib/api/request', () => ({
  setCsrfToken: vi.fn(),
  setUnauthenticatedHandler: vi.fn(),
}))

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const PLACEHOLDER = /is not built yet/
const form = () => screen.findByRole('heading', { name: 'Sign in' })
const signOutButton = () => screen.getByRole('button', { name: 'Sign out' })

/** Text of every node added to the page that matches the placeholder, so a flash is caught. */
function watchPlaceholders(): { seen: string[]; stop: () => void } {
  const seen: string[] = []
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (PLACEHOLDER.test(node.textContent ?? '')) seen.push(node.textContent ?? '')
      })
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
  return { seen, stop: () => observer.disconnect() }
}

function registeredHandler(): () => void {
  const calls = vi.mocked(setUnauthenticatedHandler).mock.calls.filter(([h]) => h !== null)
  const handler = calls[calls.length - 1]?.[0]
  if (!handler) throw new Error('no handler registered')
  return handler
}

const adminRoutes: [string, string][] = [
  ['/', 'dashboard'],
  ['/services/new', 'add service'],
  ['/services/0190-abc', 'edit service'],
  ['/services/0190-abc/alerts', 'alert list'],
  ['/nothing/here', 'requested'],
]

const dashboard = () => screen.findByRole('heading', { name: 'Services' })

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listServices).mockResolvedValue([])
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('App routes', () => {
  it('signed in: / shows the dashboard inside the layout instead of the placeholder', async () => {
    vi.mocked(getSession).mockResolvedValue(sessionInfo)
    vi.mocked(listServices).mockResolvedValue(makeServiceList(makeService()))
    renderAt('/')
    await dashboard()
    expect(await screen.findByText('API gateway')).toBeInTheDocument()
    expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument()
    expect(signOutButton()).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Monitory' })).toHaveAttribute('href', '/')
  })

  it.each(adminRoutes.filter(([path]) => path !== '/'))('signed in: %s shows the %s placeholder inside the layout', async (path, page) => {
    vi.mocked(getSession).mockResolvedValue(sessionInfo)
    renderAt(path)
    expect(await screen.findByText(`The ${page} page is not built yet.`)).toBeInTheDocument()
    expect(signOutButton()).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Monitory' })).toHaveAttribute('href', '/')
  })

  it.each(adminRoutes)('signed out: %s ends on the sign-in form and never shows a placeholder (FR-4)', async (path) => {
    vi.mocked(getSession).mockRejectedValue(problem(401, 'unauthenticated'))
    const watch = watchPlaceholders()
    renderAt(path)
    await form()
    watch.stop()
    expect(watch.seen).toEqual([])
    expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })

  it('unreachable: / ends on the form with the banner, and Retry rechecks', async () => {
    vi.mocked(getSession).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderAt('/')
    await form()
    expect(screen.getByText('Can’t reach the server.')).toBeInTheDocument()

    let answer: (info: SessionInfo) => void = () => {}
    vi.mocked(getSession).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(getSession).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled())
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()

    await act(async () => answer(sessionInfo))
    expect(await dashboard()).toBeInTheDocument()
    expect(signOutButton()).toBeInTheDocument()
  })

  it('unreachable: a Retry answered 401 removes the banner, enables the form and focuses Username', async () => {
    vi.mocked(getSession).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderAt('/')
    await form()
    let fail: (error: unknown) => void = () => {}
    vi.mocked(getSession).mockReturnValueOnce(new Promise((_resolve, reject) => (fail = reject)))
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled())
    await act(async () => fail(problem(401, 'unauthenticated')))
    await waitFor(() => expect(screen.queryByText('Can’t reach the server.')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Username')).toBeEnabled()
    expect(screen.getByLabelText('Username')).toHaveFocus()
  })

  it('unreachable: a Retry that fails again keeps the banner and focuses Retry', async () => {
    vi.mocked(getSession).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderAt('/')
    await form()
    let fail: (error: unknown) => void = () => {}
    vi.mocked(getSession).mockReturnValueOnce(new Promise((_resolve, reject) => (fail = reject)))
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled())
    await act(async () => fail(new TypeError('Failed to fetch')))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled())
    expect(screen.getByRole('button', { name: 'Retry' })).toHaveFocus()
    expect(screen.getByLabelText('Username')).toBeEnabled()
  })

  it('checking: neither a placeholder nor the form is in the page', () => {
    vi.mocked(getSession).mockReturnValue(new Promise(() => {}))
    renderAt('/')
    expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })

  it('checking on /sign-in renders nothing either', () => {
    vi.mocked(getSession).mockReturnValue(new Promise(() => {}))
    renderAt('/sign-in')
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('/status shows its placeholder and never calls getSession', async () => {
    renderAt('/status')
    expect(await screen.findByText('The public status page is not built yet.')).toBeInTheDocument()
    expect(getSession).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })

  it('/sign-in while signed in ends on /', async () => {
    vi.mocked(getSession).mockResolvedValue(sessionInfo)
    renderAt('/sign-in')
    expect(await dashboard()).toBeInTheDocument()
  })

  it('a successful submit on /sign-in ends on the dashboard inside the layout', async () => {
    vi.mocked(getSession).mockRejectedValue(problem(401, 'unauthenticated'))
    vi.mocked(signIn).mockResolvedValue(sessionInfo)
    renderAt('/sign-in')
    await form()
    await userEvent.type(screen.getByLabelText('Username'), 'admin')
    await userEvent.type(screen.getByLabelText('Password'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await dashboard()).toBeInTheDocument()
    expect(signOutButton()).toBeInTheDocument()
    expect(signIn).toHaveBeenCalledWith({ username: 'admin', password: 'secret' })
  })
})

describe('Sign out', () => {
  it('is disabled while in flight and a 204 ends on the form with no banner (FR-3)', async () => {
    vi.mocked(getSession).mockResolvedValue(sessionInfo)
    renderAt('/')
    await dashboard()
    let finish: () => void = () => {}
    vi.mocked(signOut).mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    await userEvent.click(signOutButton())
    expect(signOut).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(signOutButton()).toBeDisabled())

    await act(async () => finish())
    await form()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Your session has ended.')).not.toBeInTheDocument()
  })

  it('after a 500 is enabled again and the page stays', async () => {
    vi.mocked(getSession).mockResolvedValue(sessionInfo)
    renderAt('/')
    await dashboard()
    vi.mocked(signOut).mockRejectedValue(problem(500, 'internal_error'))
    await userEvent.click(signOutButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t sign out. Try again.')
    await waitFor(() => expect(signOutButton()).toBeEnabled())
    expect(screen.getByRole('heading', { name: 'Services' })).toBeInTheDocument()
  })
})

describe('A session that ends', () => {
  it('while on / shows the notice on the sign-in form', async () => {
    vi.mocked(getSession).mockResolvedValue(sessionInfo)
    renderAt('/')
    await dashboard()
    act(() => registeredHandler()())
    expect(await screen.findByText('Your session has ended.')).toBeInTheDocument()
    expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument()
  })
})

describe('Sign out failures', () => {
  it('403 csrf_failed shows the toast with Reload, and the admin stays on the dashboard (NFR-8)', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    vi.mocked(getSession).mockResolvedValue(sessionInfo)
    renderAt('/')
    await dashboard()
    vi.mocked(signOut).mockRejectedValue(problem(403, 'csrf_failed'))
    await userEvent.click(signOutButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('The request wasn’t accepted. Reload and try again.')
    await waitFor(() => expect(signOutButton()).toBeEnabled())
    expect(screen.getByRole('heading', { name: 'Services' })).toBeInTheDocument()
    fireEvent.focus(screen.getAllByRole('alertdialog', { hidden: true })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('a 401 unauthenticated and a 204 show no toast and end on the form (FR-3)', async () => {
    vi.mocked(getSession).mockResolvedValue(sessionInfo)
    renderAt('/')
    await dashboard()
    vi.mocked(signOut).mockRejectedValue(problem(401, 'unauthenticated'))
    await userEvent.click(signOutButton())
    await form()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('alertdialog', { hidden: true })).toHaveLength(0)
  })
})

describe('The dashboard and a session that ends (FR-4)', () => {
  it('a 401 on a refresh ends on the sign-in form with the notice, and the cached list is gone', async () => {
    vi.mocked(getSession).mockResolvedValue(sessionInfo)
    vi.mocked(listServices).mockResolvedValueOnce(makeServiceList(makeService()))
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await screen.findByText('API gateway')
    expect(client.getQueryData(['services'])).toBeDefined()

    // As apiRequest does: run the registered handler, then reject.
    vi.mocked(listServices).mockImplementationOnce(async () => {
      registeredHandler()()
      throw problem(401, 'unauthenticated')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await form()
    expect(screen.getByText('Your session has ended.')).toBeInTheDocument()
    expect(screen.queryByText('Couldn’t refresh.')).not.toBeInTheDocument()
    expect(client.getQueryData(['services'])).toBeUndefined()
  })
})
