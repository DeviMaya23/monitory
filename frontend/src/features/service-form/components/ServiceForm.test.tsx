import { QueryClient } from '@tanstack/react-query'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Outlet } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appRoutes } from '../../../App'
import { ToastProvider } from '../../../components/ui/Toast'
import { setUnauthenticatedHandler } from '../../../lib/api/request'
import {
  createService,
  getService,
  servicesQueryKey,
  testServiceCheck,
  updateService,
  type Service,
  type ServiceTestResult,
} from '../../../lib/api/services'
import { getSession } from '../../../lib/api/session'
import EditServicePage from '../../../pages/EditServicePage'
import {
  fieldError,
  makeRichService,
  makeService,
  makeServiceList,
  makeTcp,
  problem,
  sessionInfo,
  validationProblem,
} from '../../../test/fixtures'
import { renderRoutes } from '../../../test/renderRoutes'
import { AddServiceForm } from './AddServiceForm'

vi.mock('../../../lib/api/session')
vi.mock('../../../lib/api/request', () => ({ setCsrfToken: vi.fn(), setUnauthenticatedHandler: vi.fn() }))
vi.mock('../../../lib/api/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/services')>()),
  createService: vi.fn(),
  updateService: vi.fn(),
  getService: vi.fn(),
  testServiceCheck: vi.fn(),
  listServices: vi.fn(),
}))

const URL_VALUE = 'https://probe.example.com/up'
const OK: ServiceTestResult = { healthy: true, duration_ms: 312, http_status: 200, response_body: 'all fine here' }

type User = ReturnType<typeof userEvent.setup>
type Screen = 'add' | 'edit'

async function setup(kind: Screen = 'add', service: Service = makeRichService()) {
  const client = new QueryClient()
  client.setQueryData(servicesQueryKey, makeServiceList(makeService()))
  vi.mocked(getService).mockResolvedValue(service)
  const shell = (
    <ToastProvider>
      <Outlet />
    </ToastProvider>
  )
  const { router } = renderRoutes(
    [
      {
        element: shell,
        children: [
          { path: '/', element: <p>dashboard marker</p> },
          { path: '/services/new', element: <AddServiceForm /> },
          { path: '/services/:serviceId', element: <EditServicePage /> },
        ],
      },
    ],
    { initialEntries: [kind === 'add' ? '/services/new' : `/services/${service.id}`], client },
  )
  await screen.findByLabelText('Name')
  return { client, router, user: userEvent.setup() }
}

const runButton = () => screen.getByRole('button', { name: /Run test|Testing…/ })
const saveButton = () => screen.getByRole('button', { name: /Save service|Saving…/ })
const urlInput = () => screen.getByLabelText('URL')
const timeoutInput = () => screen.getByLabelText('Timeout')
const resultArea = () => document.querySelector('.test-panel [aria-live="polite"]') as HTMLElement
const describedBy = (control: HTMLElement) =>
  document.getElementById(control.getAttribute('aria-describedby') ?? '')?.textContent
const footerStatus = () => document.querySelector('.form-foot__status') as HTMLElement
const summary = () => document.querySelector('.form-banners [role="alert"]') as HTMLElement | null

async function typeUrl(user: User, url = URL_VALUE) {
  await user.type(urlInput(), url)
}

async function fillAdd(user: User) {
  await user.type(screen.getByLabelText('Name'), 'Probe API')
  await typeUrl(user)
}

function pending() {
  const settle: { resolve: (result: ServiceTestResult) => void; reject: (error: unknown) => void } = {
    resolve: () => {},
    reject: () => {},
  }
  vi.mocked(testServiceCheck).mockReturnValueOnce(
    new Promise<ServiceTestResult>((resolve, reject) => {
      settle.resolve = resolve
      settle.reject = reject
    }),
  )
  return settle
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each<Screen>(['add', 'edit'])('the test panel on the %s screen (NFR-4)', (kind) => {
  it('sits after the last group and before the footer, and Tab goes from the Alerts group to Run test, then Cancel', async () => {
    const { user } = await setup(kind)
    const panel = screen.getByRole('complementary', { name: 'Test check' })
    const lastGroup = screen.getByRole('group', { name: /Alerts/ })
    const foot = document.querySelector('.form-foot') as HTMLElement
    expect(lastGroup.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(panel.compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(panel.closest('form')).not.toBeNull()
    await user.click(screen.getByLabelText('Recovery message', { exact: false }))
    await user.tab()
    expect(runButton()).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('idle shows the title, the hint and the button, with an empty polite result area', async () => {
    await setup(kind)
    expect(screen.getByRole('heading', { level: 2, name: 'Test check' })).toBeInTheDocument()
    expect(screen.getByText('Runs one attempt with the values in the form. Nothing is saved.')).toBeInTheDocument()
    expect(runButton()).toBeEnabled()
    expect(resultArea()).toBeEmptyDOMElement()
  })
})

describe('what a test sends (FR-104)', () => {
  it('sends exactly the check and the timeout of a full HTTP form, nothing else, and shows the result', async () => {
    const service = makeRichService()
    vi.mocked(testServiceCheck).mockResolvedValue(OK)
    const { user } = await setup('edit', service)
    await user.click(runButton())
    expect(await screen.findByText('Healthy')).toBeInTheDocument()
    expect(testServiceCheck).toHaveBeenCalledTimes(1)
    const sent = vi.mocked(testServiceCheck).mock.calls[0][0]
    expect(sent).toEqual({ check: service.check, settings: { timeout_seconds: 7 } })
    expect(sent.check).toMatchObject({
      method: 'POST',
      headers: [{ name: 'Authorization' }, { name: 'X-Trace' }],
      body: { type: 'json', content: '{"ping":1}' },
      json_rules: [{ field: 'checks.db.status' }, { field: 'maintenance' }],
      certificate_check: { enabled: true, min_days_left: 30 },
    })
    expect(screen.getByText('all fine here')).toBeInTheDocument()
  })

  it('sends the TCP check and the timeout when TCP is chosen, and shows the TCP lines', async () => {
    vi.mocked(testServiceCheck).mockResolvedValue({ healthy: true, duration_ms: 5 })
    const { user } = await setup('add')
    await user.click(screen.getByRole('radio', { name: 'TCP port' }))
    await user.type(screen.getByLabelText('Host'), 'cache.internal')
    await user.type(screen.getByLabelText('Port'), '6379')
    await user.clear(timeoutInput())
    await user.type(timeoutInput(), '3')
    await user.click(runButton())
    expect(await screen.findByText('TCP checks have no status code or body.')).toBeInTheDocument()
    expect(testServiceCheck).toHaveBeenCalledWith({
      check: { type: 'tcp', host: 'cache.internal', port: 6379 },
      settings: { timeout_seconds: 3 },
    })
    expect(screen.queryByText('HTTP')).not.toBeInTheDocument()
  })

  it('does not need what a save needs: an empty name and bad other timing fields do not stop it', async () => {
    vi.mocked(testServiceCheck).mockResolvedValue(OK)
    const { user } = await setup('add')
    await typeUrl(user)
    await user.clear(screen.getByLabelText('Check interval'))
    await user.type(screen.getByLabelText('Check interval'), 'abc')
    await user.clear(screen.getByLabelText('Retries'))
    await user.type(screen.getByLabelText('Retries'), 'abc')
    await user.click(runButton())
    expect(await screen.findByText('Healthy')).toBeInTheDocument()
    expect(testServiceCheck).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Enter a name.')).not.toBeInTheDocument()
  })
})

describe('a test touches nothing (FR-105)', () => {
  it('calls no save, leaves the cache, the footer, the values and the toasts as they were', async () => {
    vi.mocked(testServiceCheck).mockResolvedValue(OK)
    const { user, client } = await setup('add')
    await fillAdd(user)
    const cached = client.getQueryData(servicesQueryKey)
    const status = footerStatus().textContent
    expect(status).toBe('Unsaved changes')
    await user.click(runButton())
    await screen.findByText('Healthy')
    expect(createService).not.toHaveBeenCalled()
    expect(updateService).not.toHaveBeenCalled()
    expect(getService).not.toHaveBeenCalled()
    expect(client.getQueryData(servicesQueryKey)).toBe(cached)
    expect(footerStatus().textContent).toBe(status)
    expect(screen.getByLabelText('Name')).toHaveValue('Probe API')
    expect(urlInput()).toHaveValue(URL_VALUE)
    expect(saveButton()).toBeEnabled()
    expect(screen.queryByRole('status', { name: /added|saved/ })).not.toBeInTheDocument()
    expect(document.querySelector('.toast')).toBeNull()
  })

  it('leaves an untouched edit form unchanged: the footer stays empty', async () => {
    vi.mocked(testServiceCheck).mockResolvedValue(OK)
    const { user } = await setup('edit')
    await user.click(runButton())
    await screen.findByText('Healthy')
    expect(footerStatus()).toBeEmptyDOMElement()
    expect(getService).toHaveBeenCalledTimes(1)
  })
})

describe('client checks before a test (FR-106)', () => {
  const notRun = () => within(resultArea()).getByRole('alert')

  it('an empty URL shows Enter a URL., focuses it, sends nothing and says the test did not run', async () => {
    const { user } = await setup('add')
    await user.click(runButton())
    expect(describedBy(urlInput())).toBe('Enter a URL.')
    expect(urlInput()).toHaveFocus()
    expect(testServiceCheck).not.toHaveBeenCalled()
    expect(notRun()).toHaveTextContent('Test not run. Fix the highlighted fields first.')
  })

  it('a timeout of abc shows Enter a whole number. on the timeout and focuses the first invalid field in page order', async () => {
    const { user } = await setup('add')
    await user.click(runButton())
    await typeUrl(user)
    await user.clear(timeoutInput())
    await user.type(timeoutInput(), 'abc')
    await user.click(runButton())
    expect(describedBy(timeoutInput())).toBe('Enter a whole number.')
    expect(timeoutInput()).toHaveFocus()
    expect(testServiceCheck).not.toHaveBeenCalled()
  })

  it('focuses the URL, which is before the timeout, when both are invalid', async () => {
    const { user } = await setup('add')
    await user.clear(timeoutInput())
    await user.type(timeoutInput(), 'abc')
    await user.click(runButton())
    expect(urlInput()).toHaveFocus()
    expect(describedBy(timeoutInput())).toBe('Enter a whole number.')
  })

  it('certificate days of abc with the switch on shows under the days', async () => {
    const { user } = await setup('edit')
    const days = screen.getByLabelText('Minimum days left')
    await user.clear(days)
    await user.type(days, 'abc')
    await user.click(runButton())
    expect(describedBy(days)).toBe('Enter a whole number.')
    expect(days).toHaveFocus()
    expect(testServiceCheck).not.toHaveBeenCalled()
    expect(notRun()).toBeInTheDocument()
  })

  it('an empty TCP port shows under Port', async () => {
    const { user } = await setup('add')
    await user.click(screen.getByRole('radio', { name: 'TCP port' }))
    await user.type(screen.getByLabelText('Host'), 'cache.internal')
    await user.click(runButton())
    expect(describedBy(screen.getByLabelText('Port'))).toBe('Enter a whole number.')
    expect(screen.getByLabelText('Port')).toHaveFocus()
    expect(testServiceCheck).not.toHaveBeenCalled()
  })

  it('a later valid test replaces the notice with the result', async () => {
    vi.mocked(testServiceCheck).mockResolvedValue(OK)
    const { user } = await setup('add')
    await user.click(runButton())
    expect(notRun()).toBeInTheDocument()
    await typeUrl(user)
    await user.click(runButton())
    expect(await screen.findByText('Healthy')).toBeInTheDocument()
    expect(screen.queryByText('Test not run. Fix the highlighted fields first.')).not.toBeInTheDocument()
  })
})

describe('a refused test, 422 (FR-106, FR-74, NFR-7)', () => {
  const refuse = () =>
    vi
      .mocked(testServiceCheck)
      .mockRejectedValueOnce(
        validationProblem(
          fieldError('check.url', 'Custom <b>bad</b> URL.'),
          fieldError('settings.timeout_seconds', 'Timeout is too long here.'),
        ),
      )

  it('shows each message on its field and in the summary, which has focus, and the Test not run notice', async () => {
    refuse()
    const { user } = await setup('edit')
    await user.click(runButton())
    expect(await screen.findByRole('link', { name: 'URL: Custom <b>bad</b> URL.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Timeout: Timeout is too long here.' })).toBeInTheDocument()
    expect(urlInput()).toHaveAttribute('aria-invalid', 'true')
    expect(describedBy(urlInput())).toBe('Custom <b>bad</b> URL.')
    expect(timeoutInput()).toHaveAttribute('aria-invalid', 'true')
    expect(describedBy(timeoutInput())).toBe('Timeout is too long here.')
    expect(summary()).toHaveFocus()
    expect(document.querySelector('.form-banners b')).toBeNull()
    expect(within(resultArea()).getByRole('alert')).toHaveTextContent('Test not run. Fix the highlighted fields first.')
    expect(runButton()).toBeEnabled()
  })

  it('a 422 that names a path of the other type (check.host on an HTTP form) is listed as text and breaks nothing', async () => {
    vi.mocked(testServiceCheck).mockRejectedValueOnce(validationProblem(fieldError('check.host', 'Host <i>refused</i>.')))
    const { user } = await setup('add')
    await typeUrl(user)
    await user.click(runButton())
    expect(await screen.findByText(/Host <i>refused<\/i>\./)).toBeInTheDocument()
    expect(document.querySelector('.form-banners i')).toBeNull()
    expect(within(resultArea()).getByRole('alert')).toHaveTextContent('Test not run.')
    expect(runButton()).toBeEnabled()
  })

  it('editing the URL clears its error and its summary entry only', async () => {
    refuse()
    const { user } = await setup('edit')
    await user.click(runButton())
    await screen.findByRole('link', { name: /URL: Custom/ })
    await user.type(urlInput(), 'x')
    expect(screen.queryByRole('link', { name: /URL: Custom/ })).not.toBeInTheDocument()
    expect(urlInput()).not.toHaveAttribute('aria-invalid')
    expect(screen.getByRole('link', { name: 'Timeout: Timeout is too long here.' })).toBeInTheDocument()
  })
})

describe('the one set of server field errors (FR-74)', () => {
  const nameError = () => fieldError('name', 'Name refused by the save.')
  const urlError = () => fieldError('check.url', 'URL refused by the test.')

  it('a test’s 422 replaces a save’s errors', async () => {
    vi.mocked(createService).mockRejectedValueOnce(validationProblem(nameError()))
    vi.mocked(testServiceCheck).mockRejectedValueOnce(validationProblem(urlError()))
    const { user } = await setup('add')
    await fillAdd(user)
    await user.click(saveButton())
    expect(await screen.findByRole('link', { name: /Name refused by the save/ })).toBeInTheDocument()
    await user.click(runButton())
    expect(await screen.findByRole('link', { name: /URL refused by the test/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Name refused by the save/ })).not.toBeInTheDocument()
  })

  it('a test’s 422 is cleared when the next test starts', async () => {
    vi.mocked(testServiceCheck).mockRejectedValueOnce(validationProblem(urlError()))
    const settle = pending()
    const { user } = await setup('add')
    await fillAdd(user)
    await user.click(runButton())
    await screen.findByRole('link', { name: /URL refused by the test/ })
    await user.click(runButton())
    expect(screen.queryByRole('link', { name: /URL refused by the test/ })).not.toBeInTheDocument()
    expect(describedBy(urlInput())).not.toBe('URL refused by the test.')
    await act(async () => settle.resolve(OK))
  })

  it('a save’s 422 stays when a test starts and succeeds', async () => {
    vi.mocked(createService).mockRejectedValueOnce(validationProblem(nameError()))
    vi.mocked(testServiceCheck).mockResolvedValue(OK)
    const { user } = await setup('add')
    await fillAdd(user)
    await user.click(saveButton())
    await screen.findByRole('link', { name: /Name refused by the save/ })
    await user.click(runButton())
    await screen.findByText('Healthy')
    expect(screen.getByRole('link', { name: /Name refused by the save/ })).toBeInTheDocument()
  })

  it('starting a save clears a test’s errors', async () => {
    vi.mocked(testServiceCheck).mockRejectedValueOnce(validationProblem(urlError()))
    vi.mocked(createService).mockReturnValueOnce(new Promise(() => {}))
    const { user } = await setup('add')
    await fillAdd(user)
    await user.click(runButton())
    await screen.findByRole('link', { name: /URL refused by the test/ })
    await user.click(saveButton())
    expect(screen.queryByRole('link', { name: /URL refused by the test/ })).not.toBeInTheDocument()
  })
})

describe('a request that failed as a whole (NFR-8)', () => {
  it('403 csrf_failed offers Reload, which reloads once', async () => {
    const original = window.location
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { ...original, reload }, configurable: true })
    try {
      vi.mocked(testServiceCheck).mockRejectedValueOnce(problem(403, 'csrf_failed'))
      const { user } = await setup('add')
      await typeUrl(user)
      await user.click(runButton())
      expect(await screen.findByText('The request wasn’t accepted. Reload the page and try again.')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Reload' }))
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(window, 'location', { value: original, configurable: true })
    }
  })

  it.each([
    ['413', problem(413, 'payload_too_large'), 'The test is too large to send. Shorten the body or the header values.'],
    [
      '500',
      problem(500, 'internal_error'),
      'The test couldn’t be run. The server couldn’t be reached or returned an error.',
    ],
    [
      'a network error',
      new TypeError('Failed to fetch'),
      'The test couldn’t be run. The server couldn’t be reached or returned an error.',
    ],
  ])('%s shows its notice, the button is enabled and a second press sends again', async (_name, error, text) => {
    vi.mocked(testServiceCheck).mockRejectedValueOnce(error).mockResolvedValueOnce(OK)
    const { user } = await setup('add')
    await typeUrl(user)
    await user.click(runButton())
    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(runButton()).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument()
    await user.click(runButton())
    expect(await screen.findByText('Healthy')).toBeInTheDocument()
    expect(testServiceCheck).toHaveBeenCalledTimes(2)
  })

  it('a 401 ends on the sign-in form with no panel text', async () => {
    vi.mocked(getSession).mockResolvedValue(sessionInfo)
    vi.mocked(testServiceCheck).mockImplementationOnce(() => {
      const handler = vi.mocked(setUnauthenticatedHandler).mock.calls.filter(([h]) => h !== null).at(-1)?.[0]
      handler?.()
      return Promise.reject(problem(401, 'unauthenticated'))
    })
    const { user } = await (async () => {
      renderRoutes(appRoutes, { initialEntries: ['/services/new'] })
      await screen.findByLabelText('Name')
      return { user: userEvent.setup() }
    })()
    await typeUrl(user)
    await user.click(runButton())
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText(/The test couldn’t be run/)).not.toBeInTheDocument()
    expect(screen.queryByText('Test not run. Fix the highlighted fields first.')).not.toBeInTheDocument()
  })
})

describe('while a test runs', () => {
  it('shows Testing… busy and disabled, the running notice, and drops the previous result', async () => {
    vi.mocked(testServiceCheck).mockResolvedValueOnce(OK)
    const settle = pending()
    const { user } = await setup('add')
    await typeUrl(user)
    await user.click(runButton())
    await screen.findByText('Healthy')
    await user.click(runButton())
    expect(runButton()).toHaveTextContent('Testing…')
    expect(runButton()).toHaveAttribute('aria-busy', 'true')
    expect(runButton()).toBeDisabled()
    expect(within(resultArea()).getByRole('status')).toHaveTextContent('Running one attempt…')
    expect(screen.queryByText('Healthy')).not.toBeInTheDocument()
    await act(async () => settle.resolve(OK))
    expect(await screen.findByText('Healthy')).toBeInTheDocument()
  })

  it('keeps the form editable and Save service working; a save that succeeds navigates away and the late answer sets nothing', async () => {
    const settle = pending()
    vi.mocked(createService).mockResolvedValueOnce(makeService({ name: 'Probe API' }))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { user } = await setup('add')
    await fillAdd(user)
    await user.click(runButton())
    await user.type(screen.getByLabelText('Name'), ' two')
    expect(screen.getByLabelText('Name')).toHaveValue('Probe API two')
    expect(saveButton()).toBeEnabled()
    await user.click(saveButton())
    expect(await screen.findByText('dashboard marker')).toBeInTheDocument()
    await act(async () => settle.resolve(OK))
    expect(errors).not.toHaveBeenCalled()
    expect(screen.queryByText('Healthy')).not.toBeInTheDocument()
  })

  it('Run test is disabled while a save is in flight and enabled again after a failed save', async () => {
    let reject: (e: unknown) => void = () => {}
    vi.mocked(createService).mockReturnValueOnce(new Promise((_, r) => (reject = r)))
    const { user } = await setup('add')
    await fillAdd(user)
    await user.click(saveButton())
    expect(runButton()).toBeDisabled()
    await act(async () => reject(problem(500, 'internal_error')))
    await waitFor(() => expect(runButton()).toBeEnabled())
  })

  it('a second press of Run test while one is pending sends nothing', async () => {
    pending()
    const { user } = await setup('add')
    await typeUrl(user)
    await user.click(runButton())
    await user.click(runButton())
    expect(testServiceCheck).toHaveBeenCalledTimes(1)
  })
})

describe('focus after an answer', () => {
  it('goes back to Run test when it was there when the test started', async () => {
    const settle = pending()
    const { user } = await setup('add')
    await typeUrl(user)
    await user.click(runButton())
    await act(async () => settle.resolve(OK))
    await screen.findByText('Healthy')
    expect(runButton()).toHaveFocus()
  })

  it('is not taken from a field the admin moved to meanwhile', async () => {
    const settle = pending()
    const { user } = await setup('add')
    await typeUrl(user)
    await user.click(runButton())
    await user.click(screen.getByLabelText('Name'))
    await act(async () => settle.resolve(OK))
    await screen.findByText('Healthy')
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })
})

describe('the known gap: a stale result', () => {
  it('stays when a field is edited and is replaced by the next test', async () => {
    vi.mocked(testServiceCheck)
      .mockResolvedValueOnce(OK)
      .mockResolvedValueOnce({ healthy: false, duration_ms: 10000, failure_reason: { code: 'timed_out' } })
    const { user } = await setup('add')
    await typeUrl(user)
    await user.click(runButton())
    await screen.findByText('Healthy')
    await user.type(urlInput(), '/more')
    expect(screen.getByText('Healthy')).toBeInTheDocument()
    await user.click(runButton())
    expect(await screen.findByText('Timed out')).toBeInTheDocument()
    expect(screen.queryByText('Healthy')).not.toBeInTheDocument()
  })
})

describe('the other type’s save does not matter to a TCP service on the edit screen', () => {
  it('tests a saved TCP service with its own check', async () => {
    vi.mocked(testServiceCheck).mockResolvedValue({ healthy: false, duration_ms: 1204, failure_reason: { code: 'could_not_connect' } })
    const { user } = await setup('edit', makeTcp())
    await user.click(runButton())
    expect(await screen.findByText('Could not connect')).toBeInTheDocument()
    expect(screen.getByText('1,204 ms')).toBeInTheDocument()
    expect(testServiceCheck).toHaveBeenCalledWith({
      check: { type: 'tcp', host: 'db.internal', port: 5432 },
      settings: { timeout_seconds: expect.any(Number) },
    })
  })
})
