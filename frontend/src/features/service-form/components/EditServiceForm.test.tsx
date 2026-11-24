import { QueryClient } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Outlet } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../components/ui/Toast'
import { getService, serviceQueryKey, servicesQueryKey, updateService, type Service } from '../../../lib/api/services'
import EditServicePage from '../../../pages/EditServicePage'
import {
  fieldError,
  makeRichService,
  makeService,
  makeTcp,
  problem,
  validationProblem,
} from '../../../test/fixtures'
import { renderRoutes } from '../../../test/renderRoutes'
import { toFormValues, toServiceInput } from '../lib/serviceInput'

vi.mock('../../../lib/api/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/services')>()),
  getService: vi.fn(),
  updateService: vi.fn(),
}))

type Options = { service?: Service; client?: QueryClient }

async function setup({ service = makeRichService(), client = new QueryClient() }: Options = {}) {
  vi.mocked(getService).mockResolvedValue(service)
  client.setQueryData(servicesQueryKey, [service])
  const { router } = renderRoutes(
    [
      {
        element: (
          <ToastProvider>
            <Outlet />
          </ToastProvider>
        ),
        children: [
          { path: '/', element: <p>dashboard marker</p> },
          { path: '/other', element: <p>other marker</p> },
          { path: '/services/:serviceId', element: <EditServicePage /> },
        ],
      },
    ],
    { initialEntries: [`/services/${service.id}`], client },
  )
  await screen.findByRole('heading', { level: 1, name: 'Edit service' })
  await screen.findByLabelText('Name')
  return { client, router, user: userEvent.setup({ delay: null }), service }
}

const nameInput = () => screen.getByLabelText('Name')
const saveButton = () => screen.getByRole('button', { name: /Save service|Saving…/ })
const cancelButton = () => screen.getByRole('button', { name: 'Cancel' })
const backLink = () => screen.getByRole('link', { name: 'Services' })
const footerStatus = () => document.querySelector('.form-foot__status') as HTMLElement
const bannerSlot = () => document.querySelector('.form-banners') as HTMLElement
const marker = () => screen.findByText('dashboard marker')
const discardDialog = () => screen.queryByRole('dialog', { name: 'Discard unsaved changes?' })
const switchOf = (name: string) => screen.getByRole('switch', { name })
const sent = (call = 0) => vi.mocked(updateService).mock.calls[call]
const describedBy = (control: HTMLElement) =>
  document.getElementById(control.getAttribute('aria-describedby') ?? '')?.textContent

function unloadPrompts(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

/** Puts text that is not the subject of the case into a field: a click to focus it and one paste. */
async function enter(user: ReturnType<typeof userEvent.setup>, control: HTMLElement, text: string) {
  await user.click(control)
  await user.paste(text)
}

async function retype(user: ReturnType<typeof userEvent.setup>, control: HTMLElement, text: string) {
  await user.clear(control)
  if (text !== '') await user.type(control, text)
}

beforeEach(() => {
  vi.resetAllMocks()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the loaded form (FR-7, FR-39)', () => {
  it('shows the heading, the sub line, a focused Name and every control at its saved value', async () => {
    await setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Edit service' })).toBeInTheDocument()
    expect(document.querySelector('.page-sub')).toHaveTextContent('Edge cache')
    expect(nameInput()).toHaveFocus()
    expect(nameInput()).toHaveValue('Edge cache')
    expect(screen.getByRole('radio', { name: 'HTTP(S)' })).toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Method' })).toHaveTextContent('POST')
    expect(screen.getByLabelText('URL')).toHaveValue('https://edge.example.com/health')
    expect(screen.getByLabelText('Query parameter 1 name')).toHaveValue('region')
    expect(screen.getByLabelText('Query parameter 1 value')).toHaveValue('eu')
    expect(screen.getByLabelText('Header 1 name')).toHaveValue('Authorization')
    const secret = screen.getByLabelText('Header 1 value')
    expect(secret).toHaveValue('Bearer abc123-secret')
    expect(secret).not.toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Header 2 value')).toHaveValue('on')
    expect(screen.getByRole('radio', { name: 'JSON' })).toBeChecked()
    expect(screen.getByLabelText('Body')).toHaveValue('{"ping":1}')
    expect(screen.getByLabelText('Rule 1 field path')).toHaveValue('checks.db.status')
    expect(screen.getByLabelText('Rule 1 failing text')).toHaveValue('down')
    expect(screen.getByLabelText('Rule 2 field path')).toHaveValue('maintenance')
    expect(screen.getByRole('combobox', { name: 'Rule 2 failing value type' })).toHaveTextContent('false')
    expect(screen.getByRole('radio', { name: 'All rules match' })).toBeChecked()
    expect(switchOf('Check certificate expiry')).toBeChecked()
    expect(screen.getByLabelText('Minimum days left')).toHaveValue('30')
    expect(switchOf('Ignore certificate errors')).toBeChecked()
    expect(screen.getByLabelText('Check interval')).toHaveValue('120')
    expect(screen.getByLabelText('Timeout')).toHaveValue('7')
    expect(screen.getByLabelText('Retries')).toHaveValue('3')
    expect(screen.getByLabelText('Retry interval')).toHaveValue('4')
    expect(switchOf('Send alerts')).not.toBeChecked()
    expect(screen.getByLabelText('Unhealthy message (optional)')).toHaveValue('Edge is down')
    expect(screen.getByLabelText('Recovery message (optional)')).toHaveValue('Edge is back')
    expect(footerStatus()).toBeEmptyDOMElement()
    expect(bannerSlot()).toBeEmptyDOMElement()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a TCP service with its host and port and no Request, Health rules or HTTPS group', async () => {
    await setup({ service: makeTcp({ id: 'tcp-1', check: { type: 'tcp', host: 'cache.internal', port: 6379 } }) })
    expect(screen.getByRole('radio', { name: 'TCP port' })).toBeChecked()
    expect(screen.getByLabelText('Host')).toHaveValue('cache.internal')
    expect(screen.getByLabelText('Port')).toHaveValue('6379')
    for (const legend of ['Request', 'Health rules (optional)', 'HTTPS']) {
      expect(screen.queryByText(legend, { selector: 'legend' })).not.toBeInTheDocument()
    }
  })

  it('keeps the loaded name in the sub line while the Name input is edited (NFR-7: markup is text)', async () => {
    const { user } = await setup({ service: makeService({ id: 'm-1', name: '<b>x</b>' }) })
    expect(nameInput()).toHaveValue('<b>x</b>')
    expect(document.querySelector('.page-sub')).toHaveTextContent('<b>x</b>')
    expect(document.querySelector('.page-sub b')).toBeNull()
    await retype(user, nameInput(), 'Changed')
    expect(document.querySelector('.page-sub')).toHaveTextContent('<b>x</b>')
  })
})

describe('the form start is read once (FR-7)', () => {
  it('keeps the form, the sub line and "unchanged" when a later answer for the service arrives', async () => {
    const { client, service } = await setup()
    vi.mocked(getService).mockResolvedValue({ ...service, name: 'Changed elsewhere', alerts_enabled: true })
    await act(() => client.refetchQueries({ queryKey: serviceQueryKey(service.id) }))
    expect(getService).toHaveBeenCalledTimes(2)
    expect(client.getQueryData<Service>(serviceQueryKey(service.id))?.name).toBe('Changed elsewhere')
    // The query library tells its observers on a timer: let the page render the new answer.
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(nameInput()).toHaveValue('Edge cache')
    expect(document.querySelector('.page-sub')).toHaveTextContent('Edge cache')
    expect(switchOf('Send alerts')).not.toBeChecked()
    expect(footerStatus()).toBeEmptyDOMElement()
  })
})

describe('saving (FR-7, FR-20, FR-65, FR-66)', () => {
  it.each([true, false])('with nothing changed sends the saved values and shown_on_public_view %s as loaded', async (shown) => {
    const service = makeRichService({ shown_on_public_view: shown })
    vi.mocked(updateService).mockResolvedValue(service)
    const { user } = await setup({ service })
    await user.click(saveButton())
    await marker()
    expect(sent()).toEqual([service.id, { ...toServiceInput(toFormValues(service)), shown_on_public_view: shown }])
  })

  it('sends each edited value and the rest as loaded, to the id in the address', async () => {
    const service = makeRichService()
    vi.mocked(updateService).mockResolvedValue(service)
    const { user } = await setup({ service })
    await retype(user, nameInput(), 'Renamed')
    await retype(user, screen.getByLabelText('Header 2 value'), 'off')
    await retype(user, screen.getByLabelText('Rule 1 failing text'), 'degraded')
    await retype(user, screen.getByLabelText('Minimum days left'), '45')
    await retype(user, screen.getByLabelText('Timeout'), '9')
    await user.click(switchOf('Send alerts'))
    await user.click(saveButton())
    await marker()
    const base = toServiceInput(toFormValues(service))
    const check = base.check as Extract<typeof base.check, { type: 'http' }>
    expect(sent()).toEqual([
      '0190-rich',
      {
        ...base,
        name: 'Renamed',
        check: {
          ...check,
          headers: [check.headers![0], { name: 'X-Trace', value: 'off' }],
          json_rules: [{ field: 'checks.db.status', failing_value: 'degraded' }, check.json_rules![1]],
          certificate_check: { enabled: true, min_days_left: 45 },
        },
        settings: { ...base.settings, timeout_seconds: 9 },
        alerts_enabled: true,
        shown_on_public_view: true,
      },
    ])
  })

  it('sends a TCP check and no HTTP key when an HTTP service is switched to TCP port', async () => {
    vi.mocked(updateService).mockResolvedValue(makeRichService())
    const { user } = await setup()
    await user.click(screen.getByRole('radio', { name: 'TCP port' }))
    await enter(user, screen.getByLabelText('Host'), 'db.internal')
    await enter(user, screen.getByLabelText('Port'), '5432')
    await user.click(saveButton())
    await marker()
    expect(sent()[1].check).toEqual({ type: 'tcp', host: 'db.internal', port: 5432 })
  })

  it('sends the HTTP check when a TCP service is switched to HTTP(S) with a URL typed', async () => {
    const service = makeTcp({ id: 'tcp-1' })
    vi.mocked(updateService).mockResolvedValue(service)
    const { user } = await setup({ service })
    await user.click(screen.getByRole('radio', { name: 'HTTP(S)' }))
    await enter(user, screen.getByLabelText('URL'), 'https://new.example.com')
    await user.click(saveButton())
    await marker()
    const check = sent()[1].check
    expect(check).toMatchObject({ type: 'http', method: 'GET', url: 'https://new.example.com' })
    expect(check).not.toHaveProperty('host')
    expect(check).not.toHaveProperty('port')
  })

  it('is read-only and disabled with Saving… while the request is in flight', async () => {
    let resolve: (service: Service) => void = () => {}
    vi.mocked(updateService).mockReturnValue(new Promise<Service>((r) => (resolve = r)))
    const { user } = await setup()
    await user.click(saveButton())
    expect(saveButton()).toBeDisabled()
    expect(saveButton()).toHaveTextContent('Saving…')
    expect(cancelButton()).toBeDisabled()
    expect(nameInput()).toHaveAttribute('readonly')
    expect(footerStatus()).toHaveTextContent('Saving…')
    await user.click(saveButton())
    expect(updateService).toHaveBeenCalledTimes(1)
    await act(async () => resolve(makeRichService()))
  })

  it('on success goes to /, drops the list, shows the response name in the toast, asks nothing and does not refetch', async () => {
    vi.mocked(updateService).mockResolvedValue(makeRichService({ name: 'Trimmed name' }))
    const { user, client, router } = await setup()
    await retype(user, nameInput(), '  Typed name  ')
    expect(unloadPrompts()).toBe(true)
    await user.click(saveButton())
    await marker()
    expect(router.state.location.pathname).toBe('/')
    expect(client.getQueryData(servicesQueryKey)).toBeUndefined()
    expect(screen.getByText('Service “Trimmed name” saved.')).toBeInTheDocument()
    expect(discardDialog()).not.toBeInTheDocument()
    expect(getService).toHaveBeenCalledTimes(1)
    expect(unloadPrompts()).toBe(false)
  })
})

describe('failures on the edit form (FR-12, FR-59, FR-74, NFR-7, NFR-8)', () => {
  it('shows a 422 on a field and in the summary with the server’s own message, as text', async () => {
    vi.mocked(updateService).mockRejectedValue(
      validationProblem(fieldError('check.url', 'Custom <b>bad</b> URL.'), fieldError('settings.timeout_seconds', 'Timeout too long.')),
    )
    const { user } = await setup()
    await user.click(saveButton())
    expect(await screen.findByRole('link', { name: 'URL: Custom <b>bad</b> URL.' })).toBeInTheDocument()
    expect(describedBy(screen.getByLabelText('URL'))).toBe('Custom <b>bad</b> URL.')
    expect(document.querySelector('.form-banners b')).toBeNull()
    expect(describedBy(screen.getByLabelText('Timeout'))).toBe('Timeout too long.')
  })

  it('shows a 422 on a field of the other type in the summary, and drops it when the type is switched', async () => {
    vi.mocked(updateService).mockRejectedValue(validationProblem(fieldError('check.port', 'Port <i>nope</i>.')))
    const { user } = await setup()
    await user.click(saveButton())
    const link = await screen.findByRole('link', { name: /Port <i>nope<\/i>\./ })
    expect(link).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'TCP port' }))
    expect(screen.queryByRole('link', { name: /Port <i>nope<\/i>\./ })).not.toBeInTheDocument()
  })

  it('shows 409 service_name_taken under Name and focuses it', async () => {
    vi.mocked(updateService).mockRejectedValue(problem(409, 'service_name_taken'))
    const { user } = await setup()
    await user.click(saveButton())
    await waitFor(() => expect(describedBy(nameInput())).toBe('Another service already uses this name (names ignore case).'))
    expect(nameInput()).toHaveFocus()
  })

  it('shows 413 and 403 csrf_failed banners, the latter with Reload', async () => {
    vi.mocked(updateService).mockRejectedValueOnce(problem(413, 'payload_too_large'))
    const { user } = await setup()
    await user.click(saveButton())
    expect(await screen.findByText('The service is too large to save.')).toBeInTheDocument()
    vi.mocked(updateService).mockRejectedValueOnce(problem(403, 'csrf_failed'))
    await user.click(saveButton())
    expect(await screen.findByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })

  it.each([
    ['a 500', problem(500, 'internal_error')],
    ['a network failure', new TypeError('Failed to fetch')],
    ['a 409 service_limit_reached', problem(409, 'service_limit_reached')],
  ])('shows the generic banner for %s, and Try again resends the same values', async (_label, error) => {
    vi.mocked(updateService).mockRejectedValueOnce(error).mockResolvedValueOnce(makeRichService())
    const { user } = await setup()
    await retype(user, nameInput(), 'Edited')
    await user.click(saveButton())
    expect(await screen.findByText('Something went wrong.')).toBeInTheDocument()
    expect(screen.queryByText('Service limit reached.')).not.toBeInTheDocument()
    expect(saveButton()).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await marker()
    expect(sent(1)).toEqual(sent(0))
    expect(sent(1)[1].name).toBe('Edited')
  })

  it('shows the not-found banner on a 404, disables Save, keeps the values and focuses the link', async () => {
    vi.mocked(updateService).mockRejectedValue(problem(404, 'not_found'))
    const { user, client } = await setup()
    await retype(user, nameInput(), 'Edited')
    await user.click(saveButton())
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('This service no longer exists.')).toBeInTheDocument()
    expect(within(alert).getByText('It was deleted, perhaps in another tab. It can’t be saved.')).toBeInTheDocument()
    const link = within(alert).getByRole('link', { name: 'Back to services' })
    expect(link).toHaveFocus()
    expect(saveButton()).toBeDisabled()
    expect(nameInput()).toHaveValue('Edited')
    expect(client.getQueryData(servicesQueryKey)).toBeUndefined()
    // Enter in a field sends nothing, and editing does not clear the banner.
    await user.type(nameInput(), '{Enter}')
    await user.type(nameInput(), 'x')
    expect(updateService).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('leaves by Back to services with no question even when changed, while Cancel asks', async () => {
    vi.mocked(updateService).mockRejectedValue(problem(404, 'not_found'))
    const { user, router } = await setup()
    await retype(user, nameInput(), 'Edited')
    await user.click(saveButton())
    await user.click(cancelButton())
    expect(discardDialog()).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    await user.click(screen.getByRole('link', { name: 'Back to services' }))
    await marker()
    expect(discardDialog()).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })
})

describe('leaving (NFR-4)', () => {
  it.each([
    ['Cancel', () => userEvent.click(cancelButton())],
    ['the back link', () => userEvent.click(backLink())],
  ])('an untouched form leaves by %s with no question', async (_label, leave) => {
    const { router } = await setup()
    await leave()
    await marker()
    expect(discardDialog()).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(unloadPrompts()).toBe(false)
  })

  it('an untouched form leaves by the browser Back with no question', async () => {
    const { router } = await setup()
    await act(() => router.navigate('/other'))
    await screen.findByText('other marker')
    expect(discardDialog()).not.toBeInTheDocument()
  })

  it.each([
    ['Cancel', () => userEvent.click(cancelButton())],
    ['the back link', () => userEvent.click(backLink())],
  ])('a changed form asks on %s, and Discard changes leaves', async (_label, leave) => {
    const { user, router } = await setup()
    await retype(user, nameInput(), 'Edited')
    expect(footerStatus()).toHaveTextContent('Unsaved changes')
    await leave()
    expect(discardDialog()).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/services/0190-rich')
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    await marker()
  })

  it('editing and putting everything back (a row added and removed, a type switched back, "30 " retyped) is unchanged', async () => {
    const { user } = await setup()
    expect(footerStatus()).toBeEmptyDOMElement()
    await retype(user, screen.getByLabelText('Minimum days left'), '30 ')
    expect(footerStatus()).toHaveTextContent('Unsaved changes')
    await retype(user, screen.getByLabelText('Minimum days left'), '30')
    expect(footerStatus()).toBeEmptyDOMElement()
    await user.click(screen.getByRole('button', { name: 'Add parameter' }))
    expect(footerStatus()).toHaveTextContent('Unsaved changes')
    await user.click(screen.getByRole('button', { name: 'Remove query parameter 2' }))
    expect(footerStatus()).toBeEmptyDOMElement()
    await user.click(screen.getByRole('radio', { name: 'TCP port' }))
    expect(footerStatus()).toHaveTextContent('Unsaved changes')
    await user.click(screen.getByRole('radio', { name: 'HTTP(S)' }))
    expect(footerStatus()).toBeEmptyDOMElement()
    await user.click(cancelButton())
    await marker()
    expect(discardDialog()).not.toBeInTheDocument()
  })

  it('keeps the unsaved-changes prompt on the browser unload only while changed', async () => {
    const { user } = await setup()
    expect(unloadPrompts()).toBe(false)
    await user.type(nameInput(), 'x')
    expect(unloadPrompts()).toBe(true)
    fireEvent.change(nameInput(), { target: { value: 'Edge cache' } })
    expect(unloadPrompts()).toBe(false)
  })
})

describe('the Public page switch (FR-27, FR-7, NFR-4)', () => {
  const publicSwitch = () => switchOf('Show on public page')

  it.each([true, false])('for a service saved as shown=%s: shows it, sends it unchanged, and sends the opposite once toggled', async (shown) => {
    const service = makeRichService({ shown_on_public_view: shown })
    vi.mocked(updateService).mockResolvedValue(service)
    const { user } = await setup({ service })
    expect(publicSwitch()).toHaveAttribute('aria-checked', String(shown))
    await user.click(saveButton())
    await marker()
    expect(sent()[1].shown_on_public_view).toBe(shown)
  })

  it.each([true, false])('for a service saved as shown=%s: sends the opposite once toggled', async (shown) => {
    const service = makeRichService({ shown_on_public_view: shown })
    vi.mocked(updateService).mockResolvedValue(service)
    const { user } = await setup({ service })
    await user.click(publicSwitch())
    await user.click(saveButton())
    await marker()
    expect(sent()[1].shown_on_public_view).toBe(!shown)
  })

  it.each([true, false])('for a service saved as shown=%s: toggled and put back, saving sends the saved value', async (shown) => {
    const service = makeRichService({ shown_on_public_view: shown })
    vi.mocked(updateService).mockResolvedValue(service)
    const { user } = await setup({ service })
    await user.click(publicSwitch())
    await user.click(publicSwitch())
    await user.click(saveButton())
    await marker()
    expect(sent()[1].shown_on_public_view).toBe(shown)
  })

  it('shows a service with no saved flag as off and sends false', async () => {
    const service = makeRichService({ shown_on_public_view: undefined })
    vi.mocked(updateService).mockResolvedValue(service)
    const { user } = await setup({ service })
    expect(publicSwitch()).toHaveAttribute('aria-checked', 'false')
    await user.click(saveButton())
    await marker()
    expect(sent()[1].shown_on_public_view).toBe(false)
  })

  it.each([
    ['Cancel', () => userEvent.click(cancelButton())],
    ['the back link', () => userEvent.click(backLink())],
  ])('counts a change from the loaded value as unsaved, asks on %s, and putting it back is unchanged', async (_label, leave) => {
    const { user } = await setup()
    await user.click(publicSwitch())
    expect(footerStatus()).toHaveTextContent('Unsaved changes')
    expect(unloadPrompts()).toBe(true)
    await leave()
    expect(discardDialog()).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    await user.click(publicSwitch())
    expect(footerStatus()).toBeEmptyDOMElement()
    expect(unloadPrompts()).toBe(false)
    await user.click(cancelButton())
    await marker()
    expect(discardDialog()).not.toBeInTheDocument()
  })

  it('is disabled while the save is pending and enabled again after a failure', async () => {
    let reject: (error: unknown) => void = () => {}
    vi.mocked(updateService).mockReturnValueOnce(new Promise<Service>((_resolve, rej) => (reject = rej)))
    const { user } = await setup()
    await user.click(saveButton())
    await waitFor(() => expect(publicSwitch()).toHaveAttribute('aria-disabled', 'true'))
    await act(async () => reject(problem(500, 'internal_error')))
    await waitFor(() => expect(publicSwitch()).not.toHaveAttribute('aria-disabled', 'true'))
  })

  it('lists a 422 naming shown_on_public_view as plain text and marks nothing', async () => {
    vi.mocked(updateService).mockRejectedValueOnce(validationProblem(fieldError('shown_on_public_view', 'Not here.')))
    const { user } = await setup()
    await user.click(saveButton())
    await waitFor(() => expect(saveButton()).toBeEnabled())
    expect(within(screen.getByRole('alert')).queryByRole('link')).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('shown_on_public_view: Not here.')
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull()
    await user.click(publicSwitch())
    expect(screen.getByRole('alert')).toHaveTextContent('shown_on_public_view: Not here.')
  })

  it('sends a TCP service’s saved flag with the TCP check', async () => {
    const service = makeTcp({ shown_on_public_view: true })
    vi.mocked(updateService).mockResolvedValue(service)
    const { user } = await setup({ service })
    expect(publicSwitch()).toHaveAttribute('aria-checked', 'true')
    await user.click(publicSwitch())
    await user.click(saveButton())
    await marker()
    expect(sent()[1]).toMatchObject({ check: { type: 'tcp' }, shown_on_public_view: false })
  })
})
