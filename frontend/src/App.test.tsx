import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { setUnauthenticatedHandler } from './lib/api/request'
import { createService, deleteService, listServices } from './lib/api/services'
import { getPublicDashboard } from './lib/api/publicDashboard'
import { listTargets } from './lib/api/targets'
import { getSession, signIn, signOut, type SessionInfo } from './lib/api/session'
import {
  makeEmailTarget,
  makePublicDashboard,
  makePublicService,
  makeService,
  makeServiceList,
  problem,
  sessionInfo,
} from './test/fixtures'

vi.mock('./lib/api/session')
vi.mock('./lib/api/publicDashboard')
// The real query key is kept (an automock would empty it); only the requests are mocked.
vi.mock('./lib/api/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/api/services')>()),
  listServices: vi.fn(),
  createService: vi.fn(),
  deleteService: vi.fn(),
}))
vi.mock('./lib/api/targets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/api/targets')>()),
  listTargets: vi.fn(),
  deleteTarget: vi.fn(),
}))
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

// The routes that still show a placeholder when signed in: all but the pages that are built.
const builtRoutes = ['/', '/services/new', '/services/0190-abc/alerts']
const placeholderRoutes = adminRoutes.filter(([path]) => !builtRoutes.includes(path))

const dashboard = () => screen.findByRole('heading', { name: 'Services' })
const addServiceForm = () => screen.findByRole('heading', { name: 'Add service' })

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listServices).mockResolvedValue([])
  vi.mocked(getPublicDashboard).mockResolvedValue(makePublicDashboard(makePublicService()))
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

  it('signed in: /services/new shows the add service form inside the layout instead of the placeholder', async () => {
    vi.mocked(getSession).mockResolvedValue(sessionInfo)
    renderAt('/services/new')
    await addServiceForm()
    expect(screen.getByLabelText('Name')).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Save service' })).toBeInTheDocument()
    expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument()
    expect(signOutButton()).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Monitory' })).toHaveAttribute('href', '/')
    expect(listServices).not.toHaveBeenCalled()
  })

  it('signed in: /services/:id/alerts shows the alert list page inside the layout instead of the placeholder', async () => {
    vi.mocked(getSession).mockResolvedValue(sessionInfo)
    vi.mocked(listTargets).mockResolvedValue([makeEmailTarget()])
    renderAt('/services/0190-abc/alerts')
    expect(await screen.findByRole('heading', { name: 'Alert list' })).toBeInTheDocument()
    expect(await screen.findByText('Ops mailbox')).toBeInTheDocument()
    expect(listTargets).toHaveBeenCalledWith('0190-abc')
    expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument()
    expect(signOutButton()).toBeInTheDocument()
  })

  it('signed in: the Alerts link on the dashboard opens the alert list', async () => {
    vi.mocked(getSession).mockResolvedValue(sessionInfo)
    vi.mocked(listServices).mockResolvedValue(makeServiceList(makeService()))
    vi.mocked(listTargets).mockResolvedValue([])
    renderAt('/')
    await userEvent.click(await screen.findByRole('link', { name: 'Alerts API gateway' }))
    expect(await screen.findByRole('heading', { name: 'No notification targets' })).toBeInTheDocument()
    expect(listTargets).toHaveBeenCalledWith('id-API gateway')
  })

  it.each(placeholderRoutes)('signed in: %s shows the %s placeholder inside the layout', async (path, page) => {
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

  const statusPage = () => screen.findByRole('heading', { name: 'Service status' })

  it('/status shows the public page without signing in and never calls getSession (FR-28)', async () => {
    renderAt('/status')
    await statusPage()
    expect(await screen.findByText('API gateway')).toBeInTheDocument()
    expect(getPublicDashboard).toHaveBeenCalledTimes(1)
    expect(getSession).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('/status as a signed-in admin shows the same page, with no top bar', async () => {
    vi.mocked(getSession).mockResolvedValue(sessionInfo)
    renderAt('/status')
    await statusPage()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Monitory' })).not.toBeInTheDocument()
    expect(screen.queryByRole('banner', { name: /./ })).not.toBeInTheDocument()
    expect(getSession).not.toHaveBeenCalled()
  })

  it('/status with getSession answering signed out shows the page, not the sign-in form', async () => {
    vi.mocked(getSession).mockRejectedValue(problem(401, 'unauthenticated'))
    renderAt('/status')
    await statusPage()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('/status answered 401 shows could-not-load and does not navigate', async () => {
    vi.mocked(getPublicDashboard).mockRejectedValue(problem(401, 'unauthenticated'))
    renderAt('/status')
    expect(await screen.findByText('Couldn’t load service status.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Service status' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
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

  it('a delete answered 401 ends on the sign-in form with the notice, no toast, and the cached list is gone', async () => {
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
    // As apiRequest does: run the registered handler, then reject.
    vi.mocked(deleteService).mockImplementationOnce(async () => {
      registeredHandler()()
      throw problem(401, 'unauthenticated')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete API gateway' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete service' }))
    await form()
    expect(screen.getByText('Your session has ended.')).toBeInTheDocument()
    expect(deleteService).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Service deleted.')).not.toBeInTheDocument()
    expect(screen.queryByText('Couldn’t delete the service. Try again.')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('alertdialog', { hidden: true })).toHaveLength(0)
    expect(client.getQueryData(['services'])).toBeUndefined()
  })
})

describe('Add service (FR-6, FR-4)', () => {
  async function fillAndSave() {
    await addServiceForm()
    await userEvent.type(screen.getByLabelText('Name'), 'Search API')
    await userEvent.type(screen.getByLabelText('URL'), 'https://search.example.com/health')
    await userEvent.click(screen.getByRole('button', { name: 'Save service' }))
  }

  it('a valid submit ends on the dashboard with the toast and the new service’s row', async () => {
    vi.mocked(getSession).mockResolvedValue(sessionInfo)
    const created = makeService({ name: 'Search API' })
    vi.mocked(createService).mockImplementation(async () => {
      // From the 201 on, the list has the new service.
      vi.mocked(listServices).mockResolvedValue(makeServiceList(created))
      return created
    })
    renderAt('/services/new')
    await fillAndSave()

    await dashboard()
    expect(await screen.findByText('Search API')).toBeInTheDocument()
    expect(screen.getByText('Service “Search API” added.')).toBeInTheDocument()
    expect(screen.queryByText('No services yet')).not.toBeInTheDocument()
    expect(createService).toHaveBeenCalledTimes(1)
    expect(createService).toHaveBeenCalledWith({
      name: 'Search API',
      check: {
        type: 'http',
        method: 'GET',
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
      settings: { check_interval_seconds: 60, timeout_seconds: 10, retry_count: 2, retry_interval_seconds: 10 },
    })
    expect(signOutButton()).toBeInTheDocument()
  })

  it('after a visit to the dashboard, the 201 drops the cached list: the new row shows, not the old list', async () => {
    vi.mocked(getSession).mockResolvedValue(sessionInfo)
    renderAt('/')
    await dashboard()
    expect(await screen.findByText('No services yet')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('link', { name: 'Add service' })[0])

    const created = makeService({ name: 'Search API' })
    vi.mocked(createService).mockImplementation(async () => {
      vi.mocked(listServices).mockResolvedValue(makeServiceList(created))
      return created
    })
    // The old, empty list must never show again once the form is left.
    let stale = false
    const watch = new MutationObserver(() => {
      if (screen.queryByText('No services yet')) stale = true
    })
    await addServiceForm()
    watch.observe(document.body, { childList: true, subtree: true })
    await fillAndSave()
    await dashboard()
    expect(await screen.findByText('Search API')).toBeInTheDocument()
    watch.disconnect()
    expect(stale).toBe(false)
  })

  it('a 401 unauthenticated ends on the sign-in form with the notice and no banner', async () => {
    vi.mocked(getSession).mockResolvedValue(sessionInfo)
    renderAt('/services/new')
    // As apiRequest does: run the registered handler, then reject.
    vi.mocked(createService).mockImplementationOnce(async () => {
      registeredHandler()()
      throw problem(401, 'unauthenticated')
    })
    await fillAndSave()
    await form()
    expect(screen.getByText('Your session has ended.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Add service' })).not.toBeInTheDocument()
    expect(createService).toHaveBeenCalledTimes(1)
  })
})
