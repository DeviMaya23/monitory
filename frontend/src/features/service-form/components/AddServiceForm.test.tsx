import { QueryClient } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Outlet } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../components/ui/Toast'
import { createService, type Service } from '../../../lib/api/services'
import { fieldError, makeService, makeServiceList, problem, validationProblem } from '../../../test/fixtures'
import { renderRoutes } from '../../../test/renderRoutes'
import { AddServiceForm } from './AddServiceForm'

// The real query key is kept: the tests look for the literal ['services'] in the cache.
vi.mock('../../../lib/api/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/services')>()),
  createService: vi.fn(),
}))

const URL_VALUE = 'https://search.example.com/health'

function setup() {
  const client = new QueryClient()
  client.setQueryData(['services'], makeServiceList(makeService()))
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
          { path: '/services/new', element: <AddServiceForm /> },
        ],
      },
    ],
    { initialEntries: ['/services/new'], client },
  )
  return { client, router, user: userEvent.setup() }
}

const nameInput = () => screen.getByLabelText('Name')
const urlInput = () => screen.getByLabelText('URL')
const methodTrigger = () => screen.getByRole('combobox', { name: 'Method' })
const saveButton = () => screen.getByRole('button', { name: /Save service|Saving…/ })
const cancelButton = () => screen.getByRole('button', { name: 'Cancel' })
const backLink = () => screen.getByRole('link', { name: 'Services' })
const footerStatus = () => document.querySelector('.form-foot__status')
const bannerSlot = () => document.querySelector('.form-banners') as HTMLElement
const marker = () => screen.findByText('dashboard marker')
const discardDialog = () => screen.queryByRole('dialog', { name: 'Discard unsaved changes?' })
/** The text shown under a field's control, found through `aria-describedby`. */
const describedBy = (control: HTMLElement) =>
  document.getElementById(control.getAttribute('aria-describedby') ?? '')?.textContent
const sentInput = (call = 0) => vi.mocked(createService).mock.calls[call][0]

/** Dispatches `beforeunload` as the browser does; true when the prompt would show. */
function unloadPrompts(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
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

async function fill(user: ReturnType<typeof userEvent.setup>, name = 'Search API', url = URL_VALUE) {
  await user.type(nameInput(), name)
  await user.type(urlInput(), url)
}

/** Fills the form, has the request fail with `error`, and waits for the saving state to end. */
async function failWith(user: ReturnType<typeof userEvent.setup>, error: unknown) {
  vi.mocked(createService).mockRejectedValueOnce(error)
  await fill(user)
  await user.click(saveButton())
  await waitFor(() => expect(saveButton()).toBeEnabled())
}

async function chooseMethod(user: ReturnType<typeof userEvent.setup>, method: string) {
  await user.click(methodTrigger())
  await user.click(await screen.findByRole('option', { name: method }))
  await waitFor(() => expect(methodTrigger()).toHaveTextContent(method))
}

beforeEach(() => {
  vi.resetAllMocks()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('idle', () => {
  it('shows the heading, the back link, the three fields with their defaults, and an empty footer status', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Add service' })).toBeInTheDocument()
    expect(backLink()).toHaveAttribute('href', '/')
    expect(nameInput()).toHaveFocus()
    expect(nameInput()).toHaveValue('')
    expect(nameInput()).not.toHaveAttribute('maxlength')
    expect(methodTrigger()).toHaveTextContent('GET')
    expect(urlInput()).toHaveAttribute('placeholder', 'https://')
    expect(urlInput()).toHaveAttribute('type', 'url')
    expect(describedBy(urlInput())).toBe('Starts with http:// or https://. Query parameters can go here or below.')
    expect(cancelButton()).toBeEnabled()
    expect(saveButton()).toBeEnabled()
    expect(saveButton()).toHaveTextContent('Save service')
    expect(footerStatus()).toBeEmptyDOMElement()
    expect(footerStatus()).toHaveAttribute('aria-live', 'polite')
    expect(bannerSlot()).toBeEmptyDOMElement()
    expect(bannerSlot()).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('has the Type control and the test button', () => {
    setup()
    // The choices are the type, the body's and the rules' mode.
    expect(screen.getAllByRole('radiogroup')).toHaveLength(3)
    expect(screen.getByRole('radiogroup', { name: 'Type' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Body type' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Mark unhealthy when' })).toBeInTheDocument()
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Add parameter',
      'Add header',
      'Add rule',
      'Run test',
      'Cancel',
      'Save service',
    ])
  })
})

describe('saving a valid form (FR-6, FR-12)', () => {
  it('sends what was typed, locks the form in flight, and on the 201 goes to / with the toast and no cached list', async () => {
    const settle = pending()
    const { client, user } = setup()
    await fill(user, '  Search API ')
    await user.click(saveButton())

    expect(createService).toHaveBeenCalledTimes(1)
    expect(sentInput()).toStrictEqual({
      name: '  Search API ',
      check: {
        type: 'http',
        method: 'GET',
        url: URL_VALUE,
        query_params: [],
        headers: [],
        json_rules: [],
        json_rule_mode: 'any',
        certificate_check: { enabled: false },
        ignore_certificate_errors: false,
      },
      alerts_enabled: true,
      shown_on_public_view: false,
      unhealthy_message: '',
      recovery_message: '',
      settings: {
        check_interval_seconds: 60,
        timeout_seconds: 10,
        retry_count: 2,
        retry_interval_seconds: 10,
      },
    })
    expect(saveButton()).toHaveTextContent('Saving…')
    expect(saveButton()).toHaveAttribute('aria-busy', 'true')
    expect(saveButton().querySelector('.spinner')).not.toBeNull()
    expect(saveButton()).toBeDisabled()
    expect(cancelButton()).toBeDisabled()
    expect(footerStatus()).toHaveTextContent('Saving…')
    expect(nameInput()).toHaveAttribute('readonly')
    expect(urlInput()).toHaveAttribute('readonly')
    expect(methodTrigger()).toBeDisabled()
    expect(unloadPrompts()).toBe(false)
    expect(client.getQueryData(['services'])).toBeDefined()

    // The name of the response, not the typed one.
    await act(async () => settle.resolve(makeService({ name: 'Search API (trimmed)' })))
    expect(await marker()).toBeInTheDocument()
    expect(client.getQueryData(['services'])).toBeUndefined()
    expect(screen.getByText('Service “Search API (trimmed)” added.')).toBeInTheDocument()
    expect(discardDialog()).not.toBeInTheDocument()
    expect(unloadPrompts()).toBe(false)
  })

  it('is not locked before a save, and has no spinner', () => {
    setup()
    expect(saveButton()).not.toHaveAttribute('aria-busy')
    expect(saveButton().querySelector('.spinner')).toBeNull()
    expect(nameInput()).not.toHaveAttribute('readonly')
    expect(urlInput()).not.toHaveAttribute('readonly')
    expect(methodTrigger()).toBeEnabled()
  })

  it('shows a name with markup as text in the toast (NFR-7)', async () => {
    vi.mocked(createService).mockResolvedValue(makeService({ name: '<b>x</b>' }))
    const { user } = setup()
    await fill(user, '<b>x</b>')
    await user.click(saveButton())
    await marker()
    expect(sentInput().name).toBe('<b>x</b>')
    const toast = screen.getByText('Service “<b>x</b>” added.')
    expect(toast.querySelector('b')).toBeNull()
  })
})

describe('the method (FR-36)', () => {
  it('lists exactly the nine methods in order', async () => {
    const { user } = setup()
    await user.click(methodTrigger())
    const options = within(await screen.findByRole('listbox')).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'GET',
      'HEAD',
      'POST',
      'PUT',
      'DELETE',
      'CONNECT',
      'OPTIONS',
      'TRACE',
      'PATCH',
    ])
  })

  it('sends PATCH when PATCH is chosen', async () => {
    vi.mocked(createService).mockResolvedValue(makeService())
    const { user } = setup()
    await fill(user)
    await chooseMethod(user, 'PATCH')
    await user.click(saveButton())
    await marker()
    expect(sentInput().check).toStrictEqual({
      type: 'http',
      method: 'PATCH',
      url: URL_VALUE,
      query_params: [],
      headers: [],
      json_rules: [],
      json_rule_mode: 'any',
      certificate_check: { enabled: false },
      ignore_certificate_errors: false,
    })
  })

  it('sends GET by default', async () => {
    vi.mocked(createService).mockResolvedValue(makeService())
    const { user } = setup()
    await fill(user)
    await user.click(saveButton())
    await marker()
    expect(sentInput().check).toStrictEqual({
      type: 'http',
      method: 'GET',
      url: URL_VALUE,
      query_params: [],
      headers: [],
      json_rules: [],
      json_rule_mode: 'any',
      certificate_check: { enabled: false },
      ignore_certificate_errors: false,
    })
  })
})

describe('submitting from the keyboard (NFR-4)', () => {
  it.each([
    ['Name', nameInput],
    ['URL', urlInput],
  ])('Enter in the %s field submits once', async (_label, field) => {
    vi.mocked(createService).mockResolvedValue(makeService())
    const { user } = setup()
    await fill(user)
    await user.type(field(), '{Enter}')
    await marker()
    expect(createService).toHaveBeenCalledTimes(1)
  })

  it('Enter while a request is in flight sends nothing', async () => {
    const settle = pending()
    const { user } = setup()
    await fill(user)
    await user.type(nameInput(), '{Enter}')
    await waitFor(() => expect(saveButton()).toBeDisabled())
    await user.type(nameInput(), '{Enter}')
    await user.type(urlInput(), '{Enter}')
    fireEvent.submit(nameInput().closest('form') as HTMLFormElement)
    expect(createService).toHaveBeenCalledTimes(1)
    expect(nameInput()).toHaveValue('Search API')
    await act(async () => settle.resolve(makeService()))
    await marker()
    expect(createService).toHaveBeenCalledTimes(1)
  })

  it('a double click on Save service sends one request', async () => {
    pending()
    const { user } = setup()
    await fill(user)
    await user.dblClick(saveButton())
    await waitFor(() => expect(saveButton()).toBeDisabled())
    expect(createService).toHaveBeenCalledTimes(1)
  })

  it('two submits in the same tick send one request', async () => {
    pending()
    const { user } = setup()
    await fill(user)
    const form = nameInput().closest('form') as HTMLFormElement
    act(() => {
      fireEvent.submit(form)
      fireEvent.submit(form)
    })
    await waitFor(() => expect(saveButton()).toBeDisabled())
    expect(createService).toHaveBeenCalledTimes(1)
  })
})

describe('client checks', () => {
  it.each([
    ['an empty name', ''],
    ['a name of only spaces', '   '],
  ])('%s shows Enter a name. and sends nothing', async (_case, typed) => {
    const { user } = setup()
    if (typed) await user.type(nameInput(), typed)
    await user.type(urlInput(), URL_VALUE)
    await user.click(saveButton())
    expect(await screen.findByText('Enter a name.')).toBeInTheDocument()
    expect(describedBy(nameInput())).toBe('Enter a name.')
    expect(nameInput()).toHaveAttribute('aria-invalid', 'true')
    expect(nameInput()).toHaveFocus()
    expect(urlInput()).not.toHaveAttribute('aria-invalid')
    expect(createService).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    ['an empty URL', ''],
    ['a URL typed as only spaces', '   '],
  ])('%s shows Enter a URL. and sends nothing', async (_case, typed) => {
    const { user } = setup()
    await user.type(nameInput(), 'Search API')
    if (typed) await user.type(urlInput(), typed)
    expect(urlInput()).toHaveValue('')
    await user.click(saveButton())
    expect(await screen.findByText('Enter a URL.')).toBeInTheDocument()
    expect(describedBy(urlInput())).toBe('Enter a URL.')
    expect(urlInput()).toHaveAttribute('aria-invalid', 'true')
    expect(urlInput()).toHaveFocus()
    expect(nameInput()).not.toHaveAttribute('aria-invalid')
    expect(createService).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows both at once with focus in Name, and editing a field clears only its error', async () => {
    const { user } = setup()
    await user.click(saveButton())
    expect(await screen.findByText('Enter a name.')).toBeInTheDocument()
    expect(screen.getByText('Enter a URL.')).toBeInTheDocument()
    expect(nameInput()).toHaveFocus()
    expect(createService).not.toHaveBeenCalled()

    // Even a space is an edit: the error goes until the next submit.
    await user.type(nameInput(), ' ')
    expect(screen.queryByText('Enter a name.')).not.toBeInTheDocument()
    expect(nameInput()).not.toHaveAttribute('aria-invalid')
    expect(screen.getByText('Enter a URL.')).toBeInTheDocument()

    await user.type(urlInput(), 'h')
    expect(screen.queryByText('Enter a URL.')).not.toBeInTheDocument()
    expect(urlInput()).not.toHaveAttribute('aria-invalid')
    expect(describedBy(urlInput())).toBe('Starts with http:// or https://. Query parameters can go here or below.')
  })

  it('does not check the scheme: a URL that is not http(s) is sent', async () => {
    vi.mocked(createService).mockRejectedValue(validationProblem(fieldError('check.url', 'Not http.')))
    const { user } = setup()
    await fill(user, 'Search API', 'ftp://files.example.com')
    await user.click(saveButton())
    await waitFor(() => expect(createService).toHaveBeenCalledTimes(1))
    expect(sentInput().check).toStrictEqual({
      type: 'http',
      method: 'GET',
      url: 'ftp://files.example.com',
      query_params: [],
      headers: [],
      json_rules: [],
      json_rule_mode: 'any',
      certificate_check: { enabled: false },
      ignore_certificate_errors: false,
    })
  })
})

describe('422 validation_failed (FR-12, FR-74, NFR-4)', () => {
  const THREE = validationProblem(
    fieldError('name', 'The name is over the 40 characters this install allows.', 'too_long'),
    fieldError('check.url', 'The address must begin with http or https here.', 'invalid_format'),
    fieldError('check.method', 'This install does not check with that method.'),
  )

  it('shows each message on its field, and a focused summary with the entries in order', async () => {
    const { user } = setup()
    await failWith(user, THREE)

    expect(describedBy(nameInput())).toBe('The name is over the 40 characters this install allows.')
    expect(nameInput()).toHaveAttribute('aria-invalid', 'true')
    expect(describedBy(urlInput())).toBe('The address must begin with http or https here.')
    expect(urlInput()).toHaveAttribute('aria-invalid', 'true')
    expect(describedBy(methodTrigger())).toBe('This install does not check with that method.')
    expect(methodTrigger()).toHaveAttribute('aria-invalid', 'true')

    const summary = screen.getByRole('alert')
    expect(bannerSlot()).toContainElement(summary)
    expect(summary).toHaveTextContent('3 fields need fixing before this can be saved.')
    expect(summary).toHaveAttribute('tabindex', '-1')
    expect(summary).toHaveFocus()
    expect(
      within(summary)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Name: The name is over the 40 characters this install allows.',
      'URL: The address must begin with http or https here.',
      'Method: This install does not check with that method.',
    ])
    expect(nameInput()).toHaveValue('Search API')
    expect(urlInput()).toHaveValue(URL_VALUE)
    expect(cancelButton()).toBeEnabled()
  })

  it('an entry’s link moves focus to its input, and for the method to its trigger', async () => {
    const { user } = setup()
    await failWith(user, THREE)
    const summary = screen.getByRole('alert')
    await user.click(within(summary).getByRole('link', { name: /^URL:/ }))
    expect(urlInput()).toHaveFocus()
    await user.click(within(summary).getByRole('link', { name: /^Name:/ }))
    expect(nameInput()).toHaveFocus()
    await user.click(within(summary).getByRole('link', { name: /^Method:/ }))
    expect(methodTrigger()).toHaveFocus()
    expect(screen.queryByText('dashboard marker')).not.toBeInTheDocument()
  })

  it('editing a field removes its error and its entry, and the last edit removes the summary', async () => {
    const { user } = setup()
    await failWith(user, THREE)

    await user.type(urlInput(), 'x')
    expect(urlInput()).not.toHaveAttribute('aria-invalid')
    expect(describedBy(urlInput())).toBe('Starts with http:// or https://. Query parameters can go here or below.')
    const summary = screen.getByRole('alert')
    expect(summary).toHaveTextContent('2 fields need fixing before this can be saved.')
    expect(
      within(summary)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Name: The name is over the 40 characters this install allows.',
      'Method: This install does not check with that method.',
    ])
    expect(nameInput()).toHaveAttribute('aria-invalid', 'true')

    await user.type(nameInput(), 'x')
    expect(screen.getByRole('alert')).toHaveTextContent('1 field needs fixing before this can be saved.')
    expect(nameInput()).not.toHaveAttribute('aria-invalid')
    expect(methodTrigger()).toHaveAttribute('aria-invalid', 'true')

    await chooseMethod(user, 'HEAD')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(methodTrigger()).not.toHaveAttribute('aria-invalid')
    expect(methodTrigger()).not.toHaveAttribute('aria-describedby')
  })

  it('lists an unmapped path as plain text with no link, and no field shows an error', async () => {
    const { user } = setup()
    await failWith(user, validationProblem(fieldError('check.unknown', 'The value is not allowed.')))
    const summary = screen.getByRole('alert')
    expect(summary).toHaveTextContent('1 field needs fixing before this can be saved.')
    expect(within(summary).getByRole('listitem')).toHaveTextContent('check.unknown: The value is not allowed.')
    expect(within(summary).queryByRole('link')).not.toBeInTheDocument()
    expect(summary).toHaveFocus()
    expect(document.querySelector('[aria-invalid]')).toBeNull()
    expect(document.querySelector('.error-text')).toBeNull()
  })

  it('renders a server message with markup as text, on the field and in the summary (NFR-7)', async () => {
    const { user } = setup()
    await failWith(user, validationProblem(fieldError('name', 'Not <b>x</b> allowed.')))
    expect(describedBy(nameInput())).toBe('Not <b>x</b> allowed.')
    expect(screen.getByRole('alert')).toHaveTextContent('Name: Not <b>x</b> allowed.')
    expect(document.querySelector('main b')).toBeNull()
  })
})

describe('409 service_name_taken (FR-59)', () => {
  it('shows the text under Name with focus there, no summary or banner, and editing the name clears it', async () => {
    const { user } = setup()
    await failWith(user, problem(409, 'service_name_taken'))
    expect(describedBy(nameInput())).toBe('Another service already uses this name (names ignore case).')
    expect(nameInput()).toHaveAttribute('aria-invalid', 'true')
    expect(nameInput()).toHaveFocus()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(bannerSlot()).toBeEmptyDOMElement()
    expect(nameInput()).toHaveValue('Search API')
    expect(urlInput()).toHaveValue(URL_VALUE)
    expect(saveButton()).toBeEnabled()
    expect(cancelButton()).toBeEnabled()
    expect(urlInput()).not.toHaveAttribute('aria-invalid')

    await user.type(urlInput(), 'x')
    expect(nameInput()).toHaveAttribute('aria-invalid', 'true')
    await user.type(nameInput(), '2')
    expect(screen.queryByText('Another service already uses this name (names ignore case).')).not.toBeInTheDocument()
    expect(nameInput()).not.toHaveAttribute('aria-invalid')
  })
})

describe('the banners', () => {
  it('409 service_limit_reached: both lines and a Back to services link that leaves with no dialog (FR-60)', async () => {
    const { user, router } = setup()
    await failWith(user, problem(409, 'service_limit_reached'))
    const banner = screen.getByRole('alert')
    expect(bannerSlot()).toContainElement(banner)
    expect(banner).toHaveTextContent('Service limit reached.')
    expect(banner).toHaveTextContent('This install can’t hold more services. Delete one to add this one.')
    expect(nameInput()).toHaveValue('Search API')
    expect(urlInput()).toHaveValue(URL_VALUE)
    expect(document.querySelector('[aria-invalid]')).toBeNull()
    expect(footerStatus()).toHaveTextContent('Unsaved changes')

    const link = within(banner).getByRole('link', { name: 'Back to services' })
    expect(link).toHaveAttribute('href', '/')
    await user.click(link)
    expect(await marker()).toBeInTheDocument()
    expect(discardDialog()).not.toBeInTheDocument()

    // The entry the link made keeps its state: Forward onto it from a changed form still asks.
    await act(async () => router.navigate(-1))
    expect(await screen.findByRole('heading', { name: 'Add service' })).toBeInTheDocument()
    await user.type(nameInput(), 'Search API')
    await act(async () => router.navigate(1))
    expect(await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/services/new')
  })

  it('413: the title and the second line, and the values stay', async () => {
    const { user } = setup()
    await failWith(user, problem(413, 'payload_too_large'))
    const banner = screen.getByRole('alert')
    expect(banner).toHaveTextContent('The service is too large to save.')
    expect(banner).toHaveTextContent('Together its fields are over 1 MB. Shorten the body or the header values.')
    expect(within(banner).queryByRole('button')).not.toBeInTheDocument()
    expect(nameInput()).toHaveValue('Search API')
    expect(urlInput()).toHaveValue(URL_VALUE)
  })

  it('403 csrf_failed: Reload calls window.location.reload once, and the values stay (NFR-8)', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const { user } = setup()
    await failWith(user, problem(403, 'csrf_failed'))
    const banner = screen.getByRole('alert')
    expect(banner).toHaveTextContent('The request wasn’t accepted.')
    expect(banner).toHaveTextContent('Reload the page and try again.')
    expect(nameInput()).toHaveValue('Search API')
    expect(urlInput()).toHaveValue(URL_VALUE)
    expect(reload).not.toHaveBeenCalled()
    await user.click(within(banner).getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a 500', problem(500, 'internal_error')],
    ['a network failure', new TypeError('Failed to fetch')],
  ])('%s: the generic banner, and Try again sends the same values and then navigates', async (_name, error) => {
    const { user } = setup()
    await failWith(user, error)
    const banner = screen.getByRole('alert')
    expect(banner).toHaveTextContent('Something went wrong.')
    expect(banner).toHaveTextContent('The server couldn’t be reached or returned an error. Your values are still here.')
    expect(nameInput()).toHaveValue('Search API')

    const settle = pending()
    await user.click(within(banner).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(saveButton()).toBeDisabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(createService).toHaveBeenCalledTimes(2)
    expect(sentInput(1)).toStrictEqual(sentInput(0))
    expect(sentInput(1)).toStrictEqual({
      name: 'Search API',
      check: {
        type: 'http',
        method: 'GET',
        url: URL_VALUE,
        query_params: [],
        headers: [],
        json_rules: [],
        json_rule_mode: 'any',
        certificate_check: { enabled: false },
        ignore_certificate_errors: false,
      },
      alerts_enabled: true,
      shown_on_public_view: false,
      unhealthy_message: '',
      recovery_message: '',
      settings: {
        check_interval_seconds: 60,
        timeout_seconds: 10,
        retry_count: 2,
        retry_interval_seconds: 10,
      },
    })

    await act(async () => settle.resolve(makeService({ name: 'Search API' })))
    expect(await marker()).toBeInTheDocument()
    expect(screen.getByText('Service “Search API” added.')).toBeInTheDocument()
  })

  it('a later failure of another kind replaces the banner', async () => {
    const { user } = setup()
    await failWith(user, problem(413, 'payload_too_large'))
    vi.mocked(createService).mockRejectedValueOnce(problem(403, 'csrf_failed'))
    await user.click(saveButton())
    expect(await screen.findByText('The request wasn’t accepted.')).toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.queryByText('The service is too large to save.')).not.toBeInTheDocument()
  })

  it('editing a field does not remove a banner', async () => {
    const { user } = setup()
    await failWith(user, problem(413, 'payload_too_large'))
    await user.type(nameInput(), 'x')
    await user.type(urlInput(), 'x')
    expect(screen.getByRole('alert')).toHaveTextContent('The service is too large to save.')
  })
})

describe('a new submit clears what the last one left', () => {
  it('removes the banner before the request goes', async () => {
    const { user } = setup()
    await failWith(user, problem(500, 'internal_error'))
    pending()
    await user.click(saveButton())
    await waitFor(() => expect(saveButton()).toBeDisabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(bannerSlot()).toBeEmptyDOMElement()
  })

  it('removes the field errors and the summary before the request goes', async () => {
    const { user } = setup()
    await failWith(
      user,
      validationProblem(fieldError('name', 'Name refused.'), fieldError('check.url', 'URL refused.')),
    )
    pending()
    await user.click(saveButton())
    await waitFor(() => expect(saveButton()).toBeDisabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(document.querySelector('[aria-invalid]')).toBeNull()
    expect(document.querySelector('.error-text')).toBeNull()
  })

  it('removes the name-taken text before the request goes', async () => {
    const { user } = setup()
    await failWith(user, problem(409, 'service_name_taken'))
    pending()
    await user.click(saveButton())
    await waitFor(() => expect(saveButton()).toBeDisabled())
    expect(nameInput()).not.toHaveAttribute('aria-invalid')
    expect(document.querySelector('.error-text')).toBeNull()
  })

  it('removes a server message even when the client checks then stop the submit', async () => {
    const { user } = setup()
    await failWith(user, problem(500, 'internal_error'))
    await user.clear(urlInput())
    await user.click(saveButton())
    expect(await screen.findByText('Enter a URL.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(createService).toHaveBeenCalledTimes(1)
  })
})

describe('focus after a failure (NFR-4)', () => {
  it.each([
    ['a 403', problem(403, 'csrf_failed')],
    ['a 413', problem(413, 'payload_too_large')],
    ['a 409 limit', problem(409, 'service_limit_reached')],
    ['a 500', problem(500, 'internal_error')],
    ['a network failure', new TypeError('Failed to fetch')],
  ])('after %s Save service has focus', async (_name, error) => {
    const { user } = setup()
    await failWith(user, error)
    expect(saveButton()).toHaveFocus()
  })

  it.each([
    ['a 403', problem(403, 'csrf_failed')],
    ['a 500', problem(500, 'internal_error')],
  ])('after %s submitted by Enter in a field Save service has focus', async (_name, error) => {
    vi.mocked(createService).mockRejectedValueOnce(error)
    const { user } = setup()
    await fill(user)
    await user.type(urlInput(), '{Enter}')
    await waitFor(() => expect(saveButton()).toHaveFocus())
    expect(saveButton()).toBeEnabled()
  })

  it('after a 409 name error by Enter in the URL field, Name has focus', async () => {
    vi.mocked(createService).mockRejectedValueOnce(problem(409, 'service_name_taken'))
    const { user } = setup()
    await fill(user)
    await user.type(urlInput(), '{Enter}')
    await waitFor(() => expect(nameInput()).toHaveFocus())
  })

  it('after a 422 the summary has focus', async () => {
    const { user } = setup()
    await failWith(user, validationProblem(fieldError('check.url', 'URL refused.')))
    expect(screen.getByRole('alert')).toHaveFocus()
  })
})

describe('leaving', () => {
  it('Cancel on an untouched form goes to / with no dialog', async () => {
    const { user } = setup()
    expect(footerStatus()).toBeEmptyDOMElement()
    await user.click(cancelButton())
    expect(await marker()).toBeInTheDocument()
    expect(discardDialog()).not.toBeInTheDocument()
  })

  it('the back link on an untouched form goes to / with no dialog', async () => {
    const { user } = setup()
    await user.click(backLink())
    expect(await marker()).toBeInTheDocument()
    expect(discardDialog()).not.toBeInTheDocument()
  })

  it.each([
    ['Cancel', cancelButton],
    ['the back link', backLink],
  ])(
    '%s with a typed name opens the dialog with Keep editing focused; Keep editing closes it',
    async (_name, opener) => {
      const { user } = setup()
      await user.type(nameInput(), 'Search API')
      expect(footerStatus()).toHaveTextContent('Unsaved changes')
      await user.click(opener())
      const dialog = await screen.findByRole('dialog', {
        name: 'Discard unsaved changes?',
      })
      expect(dialog).toHaveTextContent('The changes to this service will be lost.')
      await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus())
      expect(screen.queryByText('dashboard marker')).not.toBeInTheDocument()

      await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
      await waitFor(() => expect(discardDialog()).not.toBeInTheDocument())
      expect(nameInput()).toHaveValue('Search API')
      expect(screen.queryByText('dashboard marker')).not.toBeInTheDocument()
      await waitFor(() => expect(opener()).toHaveFocus())
    },
  )

  it('a double click on the back link with a changed form opens one question, and Discard changes goes to /', async () => {
    const { user } = setup()
    await user.type(nameInput(), 'Search API')
    await user.dblClick(backLink())
    const dialogs = await screen.findAllByRole('dialog', { name: 'Discard unsaved changes?' })
    expect(dialogs).toHaveLength(1)
    await user.click(within(dialogs[0]).getByRole('button', { name: 'Discard changes' }))
    expect(await marker()).toBeInTheDocument()
    expect(discardDialog()).not.toBeInTheDocument()
  })

  it('Esc closes the dialog and keeps the values', async () => {
    const { user } = setup()
    await user.type(nameInput(), 'Search API')
    await user.click(cancelButton())
    await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(discardDialog()).not.toBeInTheDocument())
    expect(nameInput()).toHaveValue('Search API')
    expect(screen.queryByText('dashboard marker')).not.toBeInTheDocument()
  })

  it('Discard changes goes to /', async () => {
    const { user } = setup()
    await user.type(nameInput(), 'Search API')
    await user.click(cancelButton())
    const dialog = await screen.findByRole('dialog', {
      name: 'Discard unsaved changes?',
    })
    await user.click(within(dialog).getByRole('button', { name: 'Discard changes' }))
    expect(await marker()).toBeInTheDocument()
    expect(createService).not.toHaveBeenCalled()
  })

  it('a form with only the method changed is changed', async () => {
    const { user } = setup()
    await chooseMethod(user, 'HEAD')
    expect(footerStatus()).toHaveTextContent('Unsaved changes')
    expect(unloadPrompts()).toBe(true)
    await user.click(cancelButton())
    expect(await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
  })

  it('Esc on the form does nothing', async () => {
    const { user } = setup()
    await user.type(nameInput(), 'Search API')
    await user.keyboard('{Escape}')
    expect(discardDialog()).not.toBeInTheDocument()
    expect(nameInput()).toHaveValue('Search API')
  })

  it('arms the unload prompt while changed, and the status is empty again when the form is emptied', async () => {
    const { user } = setup()
    expect(unloadPrompts()).toBe(false)
    await user.type(nameInput(), 'a')
    expect(unloadPrompts()).toBe(true)
    await user.clear(nameInput())
    expect(unloadPrompts()).toBe(false)
    expect(footerStatus()).toBeEmptyDOMElement()
  })

  it('while saving, the back link goes to / at once; the 201 then drops the cached list and shows no toast', async () => {
    const settle = pending()
    const { client, user } = setup()
    await fill(user)
    await user.click(saveButton())
    await waitFor(() => expect(cancelButton()).toBeDisabled())
    expect(footerStatus()).toHaveTextContent('Saving…')

    await user.click(backLink())
    expect(await marker()).toBeInTheDocument()
    expect(discardDialog()).not.toBeInTheDocument()
    expect(client.getQueryData(['services'])).toBeDefined()

    await act(async () => settle.resolve(makeService({ name: 'Search API' })))
    expect(client.getQueryData(['services'])).toBeUndefined()
    expect(screen.queryByText(/added\./)).not.toBeInTheDocument()
  })
})

describe('the Alerts group (FR-20, FR-65)', () => {
  const unhealthyArea = () => screen.getByLabelText('Unhealthy message (optional)')
  const recoveryArea = () => screen.getByLabelText('Recovery message (optional)')
  const alertsSwitch = () => screen.getByRole('switch', { name: 'Send alerts' })
  const counters = () => Array.from(document.querySelectorAll('.counter')).map((counter) => counter.textContent)

  it('shows after the Request group: the switch on and described, two text areas with counters at 0/500', () => {
    setup()
    const legends = Array.from(document.querySelectorAll('legend.group__legend')).map((legend) => legend.textContent)
    expect(legends).toEqual(['Service', 'Request', 'Health rules (optional)', 'HTTPS', 'Timing', 'Alerts', 'Public page'])
    expect(alertsSwitch()).toHaveAttribute('aria-checked', 'true')
    expect(alertsSwitch()).toHaveAccessibleDescription('To this service’s alert list when it goes down or recovers.')
    expect(screen.getByText('On')).toBeInTheDocument()
    for (const area of [unhealthyArea(), recoveryArea()]) {
      expect(area).toHaveAttribute('placeholder', 'Default message is used when empty')
      expect(area).toHaveAttribute('rows', '3')
      expect(area).not.toHaveAttribute('maxlength')
    }
    expect(counters()).toEqual(['0/500', '0/500'])
    expect(footerStatus()).toBeEmptyDOMElement()
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Add parameter',
      'Add header',
      'Add rule',
      'Run test',
      'Cancel',
      'Save service',
    ])
  })

  it('counts the characters of the field being typed in only, and an emoji as one', async () => {
    const { user } = setup()
    await user.type(unhealthyArea(), 'twelve chars')
    expect(counters()).toEqual(['12/500', '0/500'])
    await user.type(recoveryArea(), '😀')
    expect(counters()).toEqual(['12/500', '1/500'])
  })

  it('keeps a paste of 501 characters whole and shows no error at 500', async () => {
    const { user } = setup()
    await user.click(unhealthyArea())
    await user.paste('a'.repeat(501))
    expect(unhealthyArea()).toHaveValue('a'.repeat(501))
    expect(counters()[0]).toBe('501/500')
    await user.click(recoveryArea())
    await user.paste('b'.repeat(500))
    expect(counters()[1]).toBe('500/500')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(document.querySelector('.error-text')).toBeNull()
  })

  it('sends messages exactly as typed with alerts off, even when alerts are off', async () => {
    vi.mocked(createService).mockResolvedValueOnce(makeService())
    const { user } = setup()
    await fill(user)
    await user.click(alertsSwitch())
    expect(alertsSwitch()).toHaveAttribute('aria-checked', 'false')
    // The HTTPS switches also say Off: look at this switch's own row.
    expect(within(alertsSwitch().closest('label') as HTMLElement).getByText('Off')).toBeInTheDocument()
    await user.type(unhealthyArea(), '  down ')
    await user.type(recoveryArea(), '<b>x</b>')
    await user.click(saveButton())
    await marker()
    expect(sentInput()).toStrictEqual({
      name: 'Search API',
      check: {
        type: 'http',
        method: 'GET',
        url: URL_VALUE,
        query_params: [],
        headers: [],
        json_rules: [],
        json_rule_mode: 'any',
        certificate_check: { enabled: false },
        ignore_certificate_errors: false,
      },
      alerts_enabled: false,
      shown_on_public_view: false,
      unhealthy_message: '  down ',
      recovery_message: '<b>x</b>',
      settings: {
        check_interval_seconds: 60,
        timeout_seconds: 10,
        retry_count: 2,
        retry_interval_seconds: 10,
      },
    })
  })

  it('locks the switch and text areas in flight, and unlocks them after a failure', async () => {
    const settle = pending()
    const { user } = setup()
    await fill(user)
    await user.click(saveButton())
    // Base UI's switch is a span that announces disabled through aria-disabled.
    expect(alertsSwitch()).toHaveAttribute('aria-disabled', 'true')
    expect(unhealthyArea()).toHaveAttribute('readonly')
    expect(recoveryArea()).toHaveAttribute('readonly')
    await act(async () => settle.reject(problem(500, 'internal_error')))
    await waitFor(() => expect(saveButton()).toBeEnabled())
    expect(alertsSwitch()).not.toHaveAttribute('aria-disabled')
    expect(unhealthyArea()).not.toHaveAttribute('readonly')
    expect(recoveryArea()).not.toHaveAttribute('readonly')
  })

  describe('a 422 for the messages (FR-12, FR-74, NFR-7)', () => {
    const UNHEALTHY = 'The unhealthy message is over the 500 characters allowed.'
    const RECOVERY = '<i>The recovery message</i> is over the 500 characters allowed.'
    const BOTH = () =>
      validationProblem(
        fieldError('unhealthy_message', UNHEALTHY, 'too_long'),
        fieldError('unhealthy_message', 'A second error for the same field.', 'too_long'),
        fieldError('recovery_message', RECOVERY, 'too_long'),
      )

    it('shows each message on its text area and in the summary, in order, as text, with the first error only', async () => {
      const { user } = setup()
      await failWith(user, BOTH())
      expect(describedBy(unhealthyArea())).toBe(UNHEALTHY)
      expect(unhealthyArea()).toHaveAttribute('aria-invalid', 'true')
      expect(describedBy(recoveryArea())).toBe(RECOVERY)
      expect(recoveryArea()).toHaveAttribute('aria-invalid', 'true')
      expect(document.querySelector('.error-text i')).toBeNull()
      const summary = screen.getByRole('alert')
      expect(summary).toHaveFocus()
      expect(
        within(summary)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual([
        `Unhealthy message: ${UNHEALTHY}`,
        'Unhealthy message: A second error for the same field.',
        `Recovery message: ${RECOVERY}`,
      ])
    })

    it('links each entry to its text area', async () => {
      const { user } = setup()
      await failWith(user, BOTH())
      await user.click(screen.getByRole('link', { name: `Recovery message: ${RECOVERY}` }))
      expect(recoveryArea()).toHaveFocus()
      await user.click(screen.getByRole('link', { name: `Unhealthy message: ${UNHEALTHY}` }))
      expect(unhealthyArea()).toHaveFocus()
    })

    it('editing one text area removes only its error, and editing the other removes the summary', async () => {
      const { user } = setup()
      await failWith(
        user,
        validationProblem(
          fieldError('unhealthy_message', UNHEALTHY, 'too_long'),
          fieldError('recovery_message', RECOVERY, 'too_long'),
        ),
      )
      await user.type(unhealthyArea(), 'x')
      expect(unhealthyArea()).not.toHaveAttribute('aria-invalid')
      expect(recoveryArea()).toHaveAttribute('aria-invalid', 'true')
      expect(within(screen.getByRole('alert')).getAllByRole('listitem')).toHaveLength(1)
      await user.type(recoveryArea(), 'y')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('lists a header path as plain text with no link and no field error', async () => {
      const { user } = setup()
      await failWith(user, validationProblem(fieldError('check.unknown', 'Not on this screen.')))
      expect(within(screen.getByRole('alert')).queryByRole('link')).toBeNull()
      expect(screen.getByRole('alert')).toHaveTextContent('check.unknown: Not on this screen.')
      expect(document.querySelector('.error-text')).toBeNull()
    })

    it('lists alerts_enabled as plain text with no link', async () => {
      const { user } = setup()
      await failWith(user, validationProblem(fieldError('alerts_enabled', 'Not a field here.')))
      expect(within(screen.getByRole('alert')).queryByRole('link')).toBeNull()
    })
  })

  describe('leaving', () => {
    it('counts the switch off as changed, and on again as unchanged', async () => {
      const { user } = setup()
      await user.click(alertsSwitch())
      expect(footerStatus()).toHaveTextContent('Unsaved changes')
      expect(unloadPrompts()).toBe(true)
      await user.click(cancelButton())
      expect(await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Keep editing' }))
      await user.click(alertsSwitch())
      expect(footerStatus()).toBeEmptyDOMElement()
      expect(unloadPrompts()).toBe(false)
      await user.click(cancelButton())
      expect(await marker()).toBeInTheDocument()
    })

    it('counts a message of one space as changed', async () => {
      const { user } = setup()
      await user.type(recoveryArea(), ' ')
      expect(footerStatus()).toHaveTextContent('Unsaved changes')
    })
  })
})

describe('the Alerts group: boundaries and keyboard (FR-20, FR-65, NFR-4)', () => {
  const unhealthyArea = () => screen.getByLabelText('Unhealthy message (optional)')
  const recoveryArea = () => screen.getByLabelText('Recovery message (optional)')
  const alertsSwitch = () => screen.getByRole('switch', { name: 'Send alerts' })
  const counters = () => Array.from(document.querySelectorAll('.counter')).map((counter) => counter.textContent)

  it('is reached by Tab in the order URL, the rows’ Add buttons, Body type, the four timing inputs, switch, Unhealthy message, Recovery message, Show on public page, Run test, Cancel, Save; Space toggles the switch', async () => {
    const { user } = setup()
    await user.click(urlInput())
    // Add parameter, Add header, the Body type choice, Add rule, the mode choice (the HTTPS options are disabled
    // for an empty URL), then the four timing inputs.
    for (let stop = 0; stop < 3 + 2 + 4; stop++) await user.tab()
    await user.tab()
    expect(alertsSwitch()).toHaveFocus()
    await user.keyboard(' ')
    expect(alertsSwitch()).toHaveAttribute('aria-checked', 'false')
    await user.keyboard(' ')
    expect(alertsSwitch()).toHaveAttribute('aria-checked', 'true')
    await user.tab()
    expect(unhealthyArea()).toHaveFocus()
    await user.tab()
    expect(recoveryArea()).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('switch', { name: 'Show on public page' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Run test' })).toHaveFocus()
    await user.tab()
    expect(cancelButton()).toHaveFocus()
  })

  it('counts exactly 500 as 500/500 and 500 plus three trailing spaces as 503/500, with no error, and sends them untrimmed', async () => {
    vi.mocked(createService).mockResolvedValueOnce(makeService())
    const { user } = setup()
    await fill(user)
    await user.click(unhealthyArea())
    await user.paste('a'.repeat(500))
    await user.click(recoveryArea())
    await user.paste(`${'b'.repeat(500)}   `)
    expect(counters()).toEqual(['500/500', '503/500'])
    expect(document.querySelector('.error-text')).toBeNull()
    await user.click(saveButton())
    await marker()
    expect(sentInput().unhealthy_message).toBe('a'.repeat(500))
    expect(sentInput().recovery_message).toBe(`${'b'.repeat(500)}   `)
  })

  it('keeps a line break in a message, counts it as one character and sends it', async () => {
    vi.mocked(createService).mockResolvedValueOnce(makeService())
    const { user } = setup()
    await fill(user)
    await user.type(unhealthyArea(), 'a{Enter}b')
    expect(counters()[0]).toBe('3/500')
    await user.click(saveButton())
    await marker()
    expect(sentInput().unhealthy_message).toBe('a\nb')
  })

  it('keeps both field errors and the summary when the switch is turned off and on', async () => {
    const { user } = setup()
    await failWith(
      user,
      validationProblem(
        fieldError('unhealthy_message', 'Too long.', 'too_long'),
        fieldError('recovery_message', 'Also too long.', 'too_long'),
      ),
    )
    await user.click(alertsSwitch())
    expect(unhealthyArea()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await user.click(alertsSwitch())
    expect(unhealthyArea()).toHaveAttribute('aria-invalid', 'true')
  })

  it('opens the discard question for Cancel after a message of one space', async () => {
    const { user } = setup()
    await user.type(unhealthyArea(), ' ')
    await user.click(cancelButton())
    expect(await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
  })
})

describe('the Timing group (FR-41, FR-51, FR-53, FR-56, FR-57)', () => {
  const interval = () => screen.getByLabelText('Check interval')
  const timeout = () => screen.getByLabelText('Timeout')
  const retries = () => screen.getByLabelText('Retries')
  const retryInterval = () => screen.getByLabelText('Retry interval')
  const inputs = () => [interval(), timeout(), retries(), retryInterval()]
  const alertsSwitch = () => screen.getByRole('switch', { name: 'Send alerts' })
  const line = () => document.querySelector('.timing-sum')
  const group = () => screen.getByText('Timing', { selector: 'legend' }).closest('fieldset') as HTMLElement
  const summary = () => screen.getByRole('alert')
  const WHOLE = 'Enter a whole number.'
  const set = async (user: ReturnType<typeof userEvent.setup>, input: HTMLElement, text: string) => {
    await user.clear(input)
    if (text !== '') await user.type(input, text)
  }
  const BUDGET = 'The longest attempt, 70 s, is longer than the 30 s interval.'
  const budget = () => fieldError('settings', BUDGET, 'check_budget_exceeded')
  const rangeError = (path: string, message: string) => fieldError(path, message, 'out_of_range')

  it('shows between Request and Alerts with four inputs at 60, 10, 2, 10, their addons, no placeholder, and the line', () => {
    setup()
    expect(inputs().map((input) => (input as HTMLInputElement).value)).toEqual(['60', '10', '2', '10'])
    for (const input of inputs()) {
      expect(input).not.toHaveAttribute('placeholder')
      expect(input).toHaveAttribute('inputmode', 'numeric')
      expect(input).toHaveClass('input--mono')
      expect(input.closest('.input-group')).not.toBeNull()
    }
    expect(
      inputs().map((input) => input.closest('.input-group')?.querySelector('.input-group__addon')?.textContent),
    ).toEqual(['s', 's', 'times', 's'])
    expect(group().querySelector('.hint')).toBeNull()
    expect(line()).toHaveTextContent('Longest attempt: 10 × (1 + 2) + 10 × 2 = 50 s fits in the 60 s interval.')
    expect(group()).toHaveAttribute('aria-describedby', line()?.id)
    expect(footerStatus()).toBeEmptyDOMElement()
  })

  it('updates the line as the admin types, hides it for a blank or non-number, and shows fits again', async () => {
    const { user } = setup()
    await set(user, interval(), '30')
    await set(user, retries(), '3')
    expect(line()).toHaveTextContent('10 × (1 + 3) + 10 × 3 = 70 s exceeds the 30 s interval.')
    await set(user, interval(), '')
    expect(line()).toBeNull()
    expect(group()).not.toHaveAttribute('aria-describedby')
    await set(user, interval(), '70')
    expect(line()).toHaveTextContent('fits in the 70 s interval.')
    await set(user, timeout(), 'abc')
    expect(line()).toBeNull()
    await set(user, timeout(), '007')
    await set(user, retries(), '0')
    expect(line()).toHaveTextContent('7 × (1 + 0) + 10 × 0 = 7 s fits in the 70 s interval.')
  })

  it('still sends the request when the line says exceeds (FR-56: the server decides)', async () => {
    vi.mocked(createService).mockResolvedValueOnce(makeService())
    const { user } = setup()
    await set(user, interval(), '30')
    await set(user, retries(), '3')
    expect(line()).toHaveTextContent('exceeds')
    await fill(user)
    await user.click(saveButton())
    await marker()
    expect(sentInput().settings).toStrictEqual({
      check_interval_seconds: 30,
      timeout_seconds: 10,
      retry_count: 3,
      retry_interval_seconds: 10,
    })
  })

  it('sends the typed values as integers, with spaces trimmed', async () => {
    vi.mocked(createService).mockResolvedValueOnce(makeService())
    const { user } = setup()
    await set(user, interval(), '45')
    await set(user, timeout(), '5')
    await set(user, retries(), '0')
    await set(user, retryInterval(), ' 12 ')
    await fill(user)
    await user.click(saveButton())
    await marker()
    expect(sentInput().settings).toStrictEqual({
      check_interval_seconds: 45,
      timeout_seconds: 5,
      retry_count: 0,
      retry_interval_seconds: 12,
    })
  })

  it.each(['0', '100000', '9007199254740991'])(
    'sends %s as it is: no client minimum or maximum, only the server judges the range (FR-57)',
    async (big) => {
      vi.mocked(createService).mockResolvedValueOnce(makeService())
      const { user } = setup()
      await set(user, interval(), big)
      await fill(user)
      await user.click(saveButton())
      await marker()
      expect(sentInput().settings?.check_interval_seconds).toBe(Number(big))
    },
  )

  it('refuses the first number above the largest safe integer, 9007199254740992, and sends nothing', async () => {
    const { user } = setup()
    await set(user, interval(), '9007199254740992')
    await fill(user)
    await user.click(saveButton())
    expect(createService).not.toHaveBeenCalled()
    expect(describedBy(interval())).toBe(WHOLE)
  })

  describe('client checks', () => {
    it.each(['', ' ', 'abc', '-1', '1.5', '99999999999999999999'])(
      'refuses %j with a message under the field, focuses it, sends nothing, and drops the message on edit',
      async (bad) => {
        const { user } = setup()
        await fill(user)
        await set(user, timeout(), bad)
        await user.click(saveButton())
        expect(createService).not.toHaveBeenCalled()
        expect(describedBy(timeout())).toBe(WHOLE)
        expect(timeout()).toHaveAttribute('aria-invalid', 'true')
        expect(timeout()).toHaveFocus()
        await user.type(timeout(), '5')
        expect(timeout()).not.toHaveAttribute('aria-invalid')
        expect(screen.queryByText(WHOLE)).toBeNull()
      },
    )

    it('shows both bad fields and focuses the first in the order of the form', async () => {
      const { user } = setup()
      await fill(user)
      await set(user, retryInterval(), 'x')
      await set(user, retries(), 'y')
      await user.click(saveButton())
      expect(screen.getAllByText(WHOLE)).toHaveLength(2)
      expect(retries()).toHaveFocus()
      expect(createService).not.toHaveBeenCalled()
    })

    it('puts the Name before the timing fields', async () => {
      const { user } = setup()
      await set(user, interval(), 'x')
      await user.click(saveButton())
      expect(nameInput()).toHaveFocus()
      expect(describedBy(interval())).toBe(WHOLE)
    })
  })

  it('locks the four inputs in flight and unlocks them after a failure', async () => {
    const settle = pending()
    const { user } = setup()
    await fill(user)
    await user.click(saveButton())
    for (const input of inputs()) expect(input).toHaveAttribute('readonly')
    expect(line()).not.toBeNull()
    await act(async () => settle.reject(problem(500, 'internal_error')))
    await waitFor(() => expect(saveButton()).toBeEnabled())
    for (const input of inputs()) expect(input).not.toHaveAttribute('readonly')
  })

  describe('a 422 for fields', () => {
    const twoErrors = () =>
      validationProblem(
        rangeError('settings.timeout_seconds', 'The timeout is 1 to 300 seconds. <b>x</b>'),
        rangeError('settings.retry_count', 'Retries are 0 to 5.'),
      )

    it('lists Timeout then Retries, shows each message under its input as text, and focuses the summary', async () => {
      const { user } = setup()
      await failWith(user, twoErrors())
      const items = within(summary()).getAllByRole('listitem')
      expect(items.map((item) => item.textContent)).toEqual([
        'Timeout: The timeout is 1 to 300 seconds. <b>x</b>',
        'Retries: Retries are 0 to 5.',
      ])
      expect(describedBy(timeout())).toBe('The timeout is 1 to 300 seconds. <b>x</b>')
      expect(describedBy(retries())).toBe('Retries are 0 to 5.')
      expect(timeout()).toHaveAttribute('aria-invalid', 'true')
      expect(retries()).toHaveAttribute('aria-invalid', 'true')
      expect(interval()).not.toHaveAttribute('aria-invalid')
      expect(retryInterval()).not.toHaveAttribute('aria-invalid')
      expect(document.querySelector('main b')).toBeNull()
      expect(summary()).toHaveFocus()
    })

    it('moves focus to the input from its summary link', async () => {
      const { user } = setup()
      await failWith(user, twoErrors())
      await user.click(within(summary()).getByRole('link', { name: /^Retries:/ }))
      expect(retries()).toHaveFocus()
      await act(async () => summary().focus())
      await user.click(within(summary()).getByRole('link', { name: /^Timeout:/ }))
      expect(timeout()).toHaveFocus()
    })

    it('editing one input removes only its error and entry', async () => {
      const { user } = setup()
      await failWith(user, twoErrors())
      await user.type(timeout(), '0')
      expect(timeout()).not.toHaveAttribute('aria-invalid')
      expect(retries()).toHaveAttribute('aria-invalid', 'true')
      expect(within(summary()).getAllByRole('listitem')).toHaveLength(1)
      await user.type(retries(), '0')
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('a 422 for check.url and a timing error clear independently', async () => {
      const { user } = setup()
      await failWith(
        user,
        validationProblem(
          fieldError('check.url', 'Needs a scheme.'),
          rangeError('settings.retry_interval_seconds', 'Range.'),
        ),
      )
      expect(describedBy(urlInput())).toBe('Needs a scheme.')
      expect(describedBy(retryInterval())).toBe('Range.')
      await user.type(urlInput(), 'x')
      expect(urlInput()).not.toHaveAttribute('aria-invalid')
      expect(retryInterval()).toHaveAttribute('aria-invalid', 'true')
      expect(within(summary()).getAllByRole('listitem')).toHaveLength(1)
      await user.type(retryInterval(), '1')
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })

  describe('a 422 for the group (FR-56)', () => {
    it('shows the server message under the legend with the icon, marks the group, and lists Timing as plain text', async () => {
      const { user } = setup()
      await failWith(user, validationProblem(budget()))
      const error = group().querySelector('.error-text') as HTMLElement
      expect(group().querySelector('legend')?.nextElementSibling).toBe(error)
      expect(error).toHaveTextContent(BUDGET)
      expect(error.firstElementChild?.tagName.toLowerCase()).toBe('svg')
      expect(group()).toHaveClass('group--invalid')
      expect(group().getAttribute('aria-describedby')?.split(' ')).toEqual([line()?.id, error.id])
      const item = within(summary()).getByRole('listitem')
      expect(item).toHaveTextContent(`Timing: ${BUDGET}`)
      expect(within(summary()).queryByRole('link')).toBeNull()
      expect(summary()).toHaveFocus()
      expect(document.querySelector('[aria-invalid]')).toBeNull()
    })

    it.each([
      ['Check interval', 0],
      ['Timeout', 1],
      ['Retries', 2],
      ['Retry interval', 3],
    ])('editing %s removes the error, the class and the entry, and the summary with it', async (_label, index) => {
      const { user } = setup()
      await failWith(user, validationProblem(budget()))
      await user.type(inputs()[index], '1')
      expect(group().querySelector('.error-text')).toBeNull()
      expect(group()).not.toHaveClass('group--invalid')
      expect(group().getAttribute('aria-describedby')).toBe(line()?.id)
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('editing a field outside the group leaves the group error', async () => {
      const { user } = setup()
      await failWith(user, validationProblem(budget(), fieldError('name', 'Taken.')))
      await user.type(nameInput(), 'x')
      expect(group()).toHaveClass('group--invalid')
      expect(within(summary()).getAllByRole('listitem')).toHaveLength(1)
    })
  })

  describe('leaving', () => {
    it('counts a changed value, asks on Cancel, arms the unload prompt, and is clean again when put back', async () => {
      const { user } = setup()
      await user.type(retries(), ' ')
      expect(footerStatus()).toHaveTextContent('Unsaved changes')
      expect(unloadPrompts()).toBe(true)
      await user.click(cancelButton())
      expect(await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Keep editing' }))
      await user.type(retries(), '{Backspace}')
      expect(footerStatus()).toBeEmptyDOMElement()
      expect(unloadPrompts()).toBe(false)
      await user.click(cancelButton())
      expect(await marker()).toBeInTheDocument()
    })
  })

  it('is reached by Tab from the URL: the four inputs in order, then the alert switch', async () => {
    const { user } = setup()
    await user.click(urlInput())
    for (let stop = 0; stop < 3 + 2; stop++) await user.tab() // Add parameter, Add header, Body type, Add rule, the mode
    for (const input of inputs()) {
      await user.tab()
      expect(input).toHaveFocus()
    }
    await user.tab()
    expect(alertsSwitch()).toHaveFocus()
  })
})

describe('the Request group’s rows and body (FR-35, FR-37, FR-38, FR-39, NFR-4, NFR-7)', () => {
  type User = ReturnType<typeof userEvent.setup>
  const addParameter = (user: User) => user.click(screen.getByRole('button', { name: 'Add parameter' }))
  const addHeader = (user: User) => user.click(screen.getByRole('button', { name: 'Add header' }))
  const chooseBody = (user: User, name: string) => user.click(screen.getByRole('radio', { name }))
  const bodyText = () => screen.getByLabelText('Body')
  const summary = () => screen.getByRole('alert')
  const entries = () => within(summary()).getAllByRole('listitem')

  /** A form with query rows 1 and 2, header row 1 and a JSON body, all typed. */
  async function fillRows(user: User) {
    await addParameter(user)
    await user.type(screen.getByLabelText('Query parameter 1 name'), 'page')
    await user.type(screen.getByLabelText('Query parameter 1 value'), '2')
    await addParameter(user)
    await user.type(screen.getByLabelText('Query parameter 2 name'), 'q')
    await addHeader(user)
    await user.type(screen.getByLabelText('Header 1 name'), 'X-Key')
    await user.type(screen.getByLabelText('Header 1 value'), 'secret-value')
    await chooseBody(user, 'JSON')
    await user.click(bodyText())
    await user.paste('{"a":1}')
  }

  /** Fills the form with rows, has the request fail with `error`, and waits for the saving state to end. */
  async function failWithRows(user: User, error: unknown) {
    vi.mocked(createService).mockRejectedValueOnce(error)
    await fill(user)
    await fillRows(user)
    await user.click(saveButton())
    await waitFor(() => expect(saveButton()).toBeEnabled())
  }

  describe('idle', () => {
    it('shows the rows, Add buttons, the headers hint and Body type on None after the method and URL', () => {
      setup()
      expect(screen.getByRole('group', { name: 'Query parameters' })).toBeInTheDocument()
      expect(screen.getByText('No query parameters.')).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'Headers' })).toHaveAccessibleDescription('Values are shown in full.')
      expect(screen.getByText('No headers.')).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'None' })).toBeChecked()
      expect(screen.getAllByRole('radio')).toHaveLength(8)
      expect(screen.queryByLabelText('Body')).not.toBeInTheDocument()
      const request = screen.getByRole('group', { name: 'Request' })
      expect(request).toContainElement(screen.getByRole('group', { name: 'Headers' }))
      expect(urlInput().compareDocumentPosition(screen.getByRole('group', { name: 'Query parameters' }))).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      )
      expect(footerStatus()).toBeEmptyDOMElement()
    })
  })

  describe('sending', () => {
    it('sends the rows in order as typed, a header value in full, and the JSON body', async () => {
      vi.mocked(createService).mockResolvedValue(makeService())
      const { user } = setup()
      await fill(user)
      await fillRows(user)
      await user.click(saveButton())
      await marker()
      expect(sentInput().check).toStrictEqual({
        type: 'http',
        method: 'GET',
        url: URL_VALUE,
        query_params: [
          { name: 'page', value: '2' },
          { name: 'q', value: '' },
        ],
        headers: [{ name: 'X-Key', value: 'secret-value' }],
        body: { type: 'json', content: '{"a":1}' },
        json_rules: [],
        json_rule_mode: 'any',
        certificate_check: { enabled: false },
        ignore_certificate_errors: false,
      })
      expect(screen.queryByDisplayValue('••••')).not.toBeInTheDocument()
    })

    it('shows a header value in full in its input', async () => {
      const { user } = setup()
      await addHeader(user)
      await user.type(screen.getByLabelText('Header 1 value'), 'Bearer abc.def')
      expect(screen.getByLabelText('Header 1 value')).toHaveValue('Bearer abc.def')
      expect(screen.getByLabelText('Header 1 value')).toHaveAttribute('type', 'text')
    })

    it('sends a row with an empty name as it is, with no client error', async () => {
      vi.mocked(createService).mockResolvedValue(makeService())
      const { user } = setup()
      await fill(user)
      await addParameter(user)
      await addHeader(user)
      await user.click(saveButton())
      await marker()
      expect(sentInput().check).toMatchObject({
        query_params: [{ name: '', value: '' }],
        headers: [{ name: '', value: '' }],
      })
    })

    it.each([
      ['Plain text', 'text'],
      ['Form (URL-encoded)', 'form'],
    ])('sends a %s body', async (option, type) => {
      vi.mocked(createService).mockResolvedValue(makeService())
      const { user } = setup()
      await fill(user)
      await chooseBody(user, option)
      await user.click(bodyText())
      await user.paste(' a=b&c=d ')
      await user.click(saveButton())
      await marker()
      expect(sentInput().check).toMatchObject({ body: { type, content: ' a=b&c=d ' } })
    })

    it('sends no body when the type is back on None, even with text typed', async () => {
      vi.mocked(createService).mockResolvedValue(makeService())
      const { user } = setup()
      await fill(user)
      await chooseBody(user, 'JSON')
      await user.click(bodyText())
      await user.paste('{"a":1}')
      await chooseBody(user, 'None')
      await user.click(saveButton())
      await marker()
      expect('body' in sentInput().check).toBe(false)
    })

    it('keeps the body text when the type goes to None and comes back', async () => {
      const { user } = setup()
      await chooseBody(user, 'Plain text')
      await user.click(bodyText())
      await user.paste('hello')
      await chooseBody(user, 'None')
      expect(screen.queryByLabelText('Body')).not.toBeInTheDocument()
      await chooseBody(user, 'JSON')
      expect(bodyText()).toHaveValue('hello')
      expect(bodyText()).toHaveAccessibleDescription('Sent as entered.')
    })

    it('locks the rows and the body text and disables Add, Remove and the choice in flight, and unlocks after a failure', async () => {
      const settle = pending()
      const { user } = setup()
      await fill(user)
      await fillRows(user)
      await user.click(saveButton())
      await waitFor(() => expect(saveButton()).toBeDisabled())
      for (const label of [
        'Query parameter 1 name',
        'Query parameter 2 value',
        'Header 1 name',
        'Header 1 value',
        'Body',
      ]) {
        expect(screen.getByLabelText(label)).toHaveAttribute('readonly')
      }
      for (const name of ['Add parameter', 'Add header', 'Remove query parameter 1', 'Remove header 1']) {
        expect(screen.getByRole('button', { name })).toBeDisabled()
      }
      for (const radio of screen.getAllByRole('radio')) expect(radio).toHaveAttribute('aria-disabled', 'true')
      await act(async () => settle.reject(problem(500, 'internal_error')))
      await waitFor(() => expect(saveButton()).toBeEnabled())
      expect(screen.getByLabelText('Header 1 value')).not.toHaveAttribute('readonly')
      expect(bodyText()).not.toHaveAttribute('readonly')
      expect(screen.getByRole('button', { name: 'Add header' })).toBeEnabled()
      for (const radio of screen.getAllByRole('radio')) expect(radio).not.toHaveAttribute('aria-disabled', 'true')
    })
  })

  describe('a 422 on rows and the body', () => {
    it('lists each in the order sent as a link to its input, shows each under it, and focuses the summary', async () => {
      const { user } = setup()
      await failWithRows(
        user,
        validationProblem(
          fieldError('check.query_params[1].name', 'A query parameter needs a name.', 'required'),
          fieldError('check.headers[0].value', '<i>Too long.</i>', 'too_long'),
          fieldError('check.body.content', 'The body is over its limit.', 'too_long'),
        ),
      )
      expect(summary()).toHaveFocus()
      expect(summary()).toHaveAttribute('tabindex', '-1')
      expect(entries().map((entry) => entry.textContent)).toEqual([
        'Query parameter 2 name: A query parameter needs a name.',
        'Header 1 value: <i>Too long.</i>',
        'Body: The body is over its limit.',
      ])
      expect(document.querySelector('i')).toBeNull()
      expect(summary()).toHaveTextContent('3 fields need fixing before this can be saved.')
      const field = (label: string) => screen.getByLabelText(label)
      expect(field('Query parameter 2 name')).toHaveAttribute('aria-invalid', 'true')
      expect(describedBy(field('Query parameter 2 name'))).toBe('A query parameter needs a name.')
      expect(describedBy(field('Header 1 value'))).toBe('<i>Too long.</i>')
      expect(describedBy(bodyText())).toBe('The body is over its limit.')
      expect(bodyText()).toHaveAttribute('aria-invalid', 'true')
      expect(field('Header 1 name')).not.toHaveAttribute('aria-invalid')
      expect(field('Query parameter 1 name')).not.toHaveAttribute('aria-invalid')
      for (const [index, label] of ['Query parameter 2 name', 'Header 1 value', 'Body'].entries()) {
        await user.click(within(entries()[index]).getByRole('link'))
        expect(field(label)).toHaveFocus()
      }
    })

    it('shows a list’s message under its rows, lists it as plain text, and marks no input invalid', async () => {
      const { user } = setup()
      await failWithRows(
        user,
        validationProblem(
          fieldError('check.query_params', 'Too many query parameters.', 'too_many'),
          fieldError('check.headers', 'Too many headers.', 'too_many'),
        ),
      )
      expect(entries().map((entry) => entry.textContent)).toEqual([
        'Query parameters: Too many query parameters.',
        'Headers: Too many headers.',
      ])
      expect(within(summary()).queryByRole('link')).toBeNull()
      expect(screen.getByRole('group', { name: 'Query parameters' })).toHaveTextContent('Too many query parameters.')
      expect(screen.getByRole('group', { name: 'Headers' })).toHaveTextContent('Too many headers.')
      expect(document.querySelector('[aria-invalid]')).toBeNull()
    })

    it('lists check.body.type as plain text with no link and marks no input invalid', async () => {
      const { user } = setup()
      await failWithRows(user, validationProblem(fieldError('check.body.type', 'Unknown body type.', 'invalid_value')))
      expect(entries().map((entry) => entry.textContent)).toEqual(['Body type: Unknown body type.'])
      expect(within(summary()).queryByRole('link')).toBeNull()
      expect(document.querySelector('[aria-invalid]')).toBeNull()
    })

    it('sends a 70 000-character body untouched and shows the server’s refusal on it', async () => {
      vi.mocked(createService).mockRejectedValueOnce(
        validationProblem(fieldError('check.body.content', 'The body is over its limit.', 'too_long')),
      )
      const { user } = setup()
      await fill(user)
      await chooseBody(user, 'Plain text')
      await user.click(bodyText())
      await user.paste('b'.repeat(70_000))
      await user.click(saveButton())
      await waitFor(() => expect(saveButton()).toBeEnabled())
      expect(sentInput().check).toMatchObject({ body: { type: 'text', content: 'b'.repeat(70_000) } })
      expect(describedBy(bodyText())).toBe('The body is over its limit.')
      expect(bodyText()).toHaveValue('b'.repeat(70_000))
    })

    it('shows a check.url error and a row error together, and clears them independently', async () => {
      const { user } = setup()
      await failWithRows(
        user,
        validationProblem(
          fieldError('check.url', 'The URL is too long.', 'too_long'),
          fieldError('check.headers[0].name', 'A header needs a name.', 'required'),
        ),
      )
      expect(entries()).toHaveLength(2)
      await user.type(screen.getByLabelText('Header 1 name'), 'x')
      expect(entries().map((entry) => entry.textContent)).toEqual(['URL: The URL is too long.'])
      expect(describedBy(urlInput())).toBe('The URL is too long.')
      await user.type(urlInput(), 'x')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('clearing a 422', () => {
    const SIX = () =>
      validationProblem(
        fieldError('check.query_params[0].name', 'Q0.'),
        fieldError('check.query_params', 'QL.'),
        fieldError('check.headers[0].value', 'H0.'),
        fieldError('check.headers[1].name', 'H1.'),
        fieldError('check.headers', 'HL.'),
        fieldError('check.body.content', 'B.'),
      )

    async function setupSix(user: User) {
      vi.mocked(createService).mockRejectedValueOnce(SIX())
      await fill(user)
      await addParameter(user)
      await addHeader(user)
      await addHeader(user)
      await chooseBody(user, 'JSON')
      await user.click(saveButton())
      await waitFor(() => expect(saveButton()).toBeEnabled())
    }
    const messages = () => entries().map((entry) => entry.textContent)

    it('editing a row input removes only its error and entry', async () => {
      const { user } = setup()
      await setupSix(user)
      await user.type(screen.getByLabelText('Header 2 name'), 'x')
      expect(messages()).toEqual([
        'Query parameter 1 name: Q0.',
        'Query parameters: QL.',
        'Header 1 value: H0.',
        'Headers: HL.',
        'Body: B.',
      ])
      expect(screen.getByLabelText('Header 2 name')).not.toHaveAttribute('aria-invalid')
      expect(screen.getByLabelText('Header 1 value')).toHaveAttribute('aria-invalid', 'true')
    })

    it('Add parameter removes the list’s own error and entry only', async () => {
      const { user } = setup()
      await setupSix(user)
      await addParameter(user)
      expect(messages()).not.toContain('Query parameters: QL.')
      expect(messages()).toHaveLength(5)
      expect(screen.getByLabelText('Query parameter 1 name')).toHaveAttribute('aria-invalid', 'true')
    })

    it('Remove removes the list’s row errors and its own, and leaves the other list’s', async () => {
      const { user } = setup()
      await setupSix(user)
      await user.click(screen.getByRole('button', { name: 'Remove header 2' }))
      expect(messages()).toEqual(['Query parameter 1 name: Q0.', 'Query parameters: QL.', 'Body: B.'])
      expect(screen.getByLabelText('Header 1 value')).not.toHaveAttribute('aria-invalid')
      expect(screen.getByLabelText('Query parameter 1 name')).toHaveAttribute('aria-invalid', 'true')
    })

    it('Remove on the query parameters removes their errors and leaves the headers’ and the body’s', async () => {
      const { user } = setup()
      await setupSix(user)
      await user.click(screen.getByRole('button', { name: 'Remove query parameter 1' }))
      expect(messages()).toEqual(['Header 1 value: H0.', 'Header 2 name: H1.', 'Headers: HL.', 'Body: B.'])
      expect(screen.getByLabelText('Header 2 name')).toHaveAttribute('aria-invalid', 'true')
    })

    it('Add header removes only the headers’ own error, then Remove removes their rows’ errors too', async () => {
      const { user } = setup()
      await setupSix(user)
      await addHeader(user)
      expect(messages()).toEqual([
        'Query parameter 1 name: Q0.',
        'Query parameters: QL.',
        'Header 1 value: H0.',
        'Header 2 name: H1.',
        'Body: B.',
      ])
      await user.click(screen.getByRole('button', { name: 'Remove header 3' }))
      expect(messages()).toEqual(['Query parameter 1 name: Q0.', 'Query parameters: QL.', 'Body: B.'])
    })

    it('typing in the Body removes check.body.content', async () => {
      const { user } = setup()
      await setupSix(user)
      await user.type(bodyText(), 'x')
      expect(messages()).not.toContain('Body: B.')
      expect(messages()).toHaveLength(5)
    })

    it('choosing another Body type removes both body errors, and the last removal removes the summary', async () => {
      vi.mocked(createService).mockRejectedValueOnce(
        validationProblem(fieldError('check.body.type', 'T.'), fieldError('check.body.content', 'B.')),
      )
      const { user } = setup()
      await fill(user)
      await chooseBody(user, 'JSON')
      await user.click(saveButton())
      await waitFor(() => expect(saveButton()).toBeEnabled())
      expect(messages()).toEqual(['Body type: T.', 'Body: B.'])
      await chooseBody(user, 'Plain text')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(describedBy(bodyText())).toBe('Sent as entered.')
    })
  })

  describe('leaving without saving', () => {
    it.each([
      ['adding a query parameter row', (user: User) => addParameter(user)],
      ['adding a header row', (user: User) => addHeader(user)],
      ['choosing a body type', (user: User) => chooseBody(user, 'JSON')],
      [
        'typing body text while the type is None',
        async (user: User) => {
          await chooseBody(user, 'JSON')
          await user.click(bodyText())
          await user.paste('x')
          await chooseBody(user, 'None')
        },
      ],
    ])(
      '%s makes the footer say Unsaved changes, arms the unload prompt and makes Cancel ask',
      async (_name, change) => {
        const { user } = setup()
        expect(unloadPrompts()).toBe(false)
        await change(user)
        expect(footerStatus()).toHaveTextContent('Unsaved changes')
        expect(unloadPrompts()).toBe(true)
        await user.click(cancelButton())
        expect(discardDialog()).toBeInTheDocument()
      },
    )

    it('typing in a row alone keeps it changed, and putting everything back empties the status and Cancel leaves', async () => {
      const { user } = setup()
      await addParameter(user)
      await user.type(screen.getByLabelText('Query parameter 1 name'), 'a')
      await chooseBody(user, 'JSON')
      await user.click(bodyText())
      await user.paste('x')
      await user.click(screen.getByRole('button', { name: 'Remove query parameter 1' }))
      expect(footerStatus()).toHaveTextContent('Unsaved changes')
      await user.clear(bodyText())
      await chooseBody(user, 'None')
      expect(footerStatus()).toBeEmptyDOMElement()
      expect(unloadPrompts()).toBe(false)
      await user.click(cancelButton())
      await marker()
    })
  })

  describe('Tab order (NFR-4)', () => {
    it('goes from the URL to Add parameter, Add header, one Body type stop, the Body, Add rule, the mode, then Check interval, with arrow keys moving the choice', async () => {
      const { user } = setup()
      await user.click(urlInput())
      await user.tab()
      expect(screen.getByRole('button', { name: 'Add parameter' })).toHaveFocus()
      await user.tab()
      expect(screen.getByRole('button', { name: 'Add header' })).toHaveFocus()
      await user.tab()
      expect(screen.getByRole('radio', { name: 'None' })).toHaveFocus()
      await user.keyboard('{ArrowRight}')
      expect(screen.getByRole('radio', { name: 'JSON' })).toBeChecked()
      expect(bodyText()).toBeInTheDocument()
      await user.tab()
      expect(bodyText()).toHaveFocus()
      await user.tab()
      expect(screen.getByRole('button', { name: 'Add rule' })).toHaveFocus()
      await user.tab()
      expect(screen.getByRole('radio', { name: 'Any rule matches' })).toHaveFocus()
      await user.tab()
      expect(screen.getByLabelText('Check interval')).toHaveFocus()
    })

    it('goes to Add rule, the mode and then Check interval right after the Body type with the body None', async () => {
      const { user } = setup()
      await user.click(screen.getByRole('radio', { name: 'None' }))
      await user.tab()
      expect(screen.getByRole('button', { name: 'Add rule' })).toHaveFocus()
      await user.tab()
      expect(screen.getByRole('radio', { name: 'Any rule matches' })).toHaveFocus()
      await user.tab()
      expect(screen.getByLabelText('Check interval')).toHaveFocus()
    })

    it('goes query Name, Value, Remove, Add parameter, header Name, Value, Remove, Add header with a row in each list', async () => {
      const { user } = setup()
      await addParameter(user)
      await addHeader(user)
      await user.click(urlInput())
      const order = [
        'Query parameter 1 name',
        'Query parameter 1 value',
        'Remove query parameter 1',
        'Add parameter',
        'Header 1 name',
        'Header 1 value',
        'Remove header 1',
        'Add header',
      ]
      for (const label of order) {
        await user.tab()
        expect(document.activeElement).toHaveAccessibleName(label)
      }
    })
  })
})

describe('the Health rules and HTTPS groups (FR-44, FR-46, FR-47, FR-34, FR-50, FR-64, FR-74)', () => {
  type User = ReturnType<typeof userEvent.setup>
  const addRule = (user: User) => user.click(screen.getByRole('button', { name: 'Add rule' }))
  const expiry = () => screen.getByRole('switch', { name: 'Check certificate expiry' })
  const ignore = () => screen.getByRole('switch', { name: 'Ignore certificate errors' })
  const days = () => screen.getByLabelText('Minimum days left')
  const kindTrigger = (n: number) => screen.getByRole('combobox', { name: `Rule ${n} failing value type` })
  const summary = () => screen.getByRole('alert')
  const summaryItems = () =>
    within(summary())
      .getAllByRole('listitem')
      .map((item) => item.textContent)
  const isOn = (control: HTMLElement) => control.getAttribute('aria-checked') === 'true'
  const isDisabled = (control: HTMLElement) => control.getAttribute('aria-disabled') === 'true'
  const setUrl = (value: string) => fireEvent.change(urlInput(), { target: { value } })
  const chooseKind = async (user: User, n: number, kind: string) => {
    await user.click(kindTrigger(n))
    await user.click(await screen.findByRole('option', { name: kind }))
  }
  /** Adds a rule and types its path and, for a Text rule, its text. */
  async function rule(user: User, n: number, field: string, text?: string) {
    await addRule(user)
    fireEvent.change(screen.getByLabelText(`Rule ${n} field path`), { target: { value: field } })
    if (text !== undefined)
      fireEvent.change(screen.getByLabelText(`Rule ${n} failing text`), { target: { value: text } })
  }
  const GROUPS = ['Service', 'Request', 'Health rules (optional)', 'HTTPS', 'Timing', 'Alerts', 'Public page']
  /** Saves a filled form that the server refuses with `error`, with the rules added by `prepare`. */
  async function saveRefused(user: User, error: unknown, prepare: () => Promise<void> = async () => {}) {
    vi.mocked(createService).mockRejectedValueOnce(error)
    await fill(user)
    await prepare()
    await user.click(saveButton())
    await waitFor(() => expect(saveButton()).toBeEnabled())
  }

  describe('idle', () => {
    it('shows both groups between Request and Timing with their words, the HTTPS note, both switches off and disabled, and an empty footer', () => {
      setup()
      const legends = Array.from(document.querySelectorAll('legend.group__legend')).map((legend) => legend.textContent)
      expect(legends).toEqual(GROUPS)
      expect(
        screen.getByText(
          'The response is parsed as JSON. A rule matches when the value at the field path equals the failing value.',
        ),
      ).toBeInTheDocument()
      expect(screen.getByText('No JSON rules. Any 2xx response counts as healthy.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add rule' })).toBeInTheDocument()
      expect(screen.getByText('Path example:', { exact: false })).toHaveTextContent('Path example: checks.db.status')
      expect(screen.getByRole('radiogroup', { name: 'Mark unhealthy when' })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'Any rule matches' })).toBeChecked()
      expect(screen.getByText('Available only when the URL starts with https://.')).toBeInTheDocument()
      expect(isOn(expiry()) || isOn(ignore())).toBe(false)
      expect(isDisabled(expiry()) && isDisabled(ignore())).toBe(true)
      expect(days()).toHaveValue('14')
      expect(days()).toBeDisabled()
      expect(footerStatus()).toBeEmptyDOMElement()
      const request = screen.getByRole('group', { name: 'Request' })
      const rules = screen.getByRole('group', { name: /Health rules/ })
      const timing = screen.getByRole('group', { name: 'Timing' })
      expect(request.compareDocumentPosition(rules)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
      expect(rules.compareDocumentPosition(timing)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })
  })

  describe('sending the rules', () => {
    it('sends Text, false and true rules in order with the mode, and an empty path as it is', async () => {
      vi.mocked(createService).mockResolvedValue(makeService())
      const { user } = setup()
      await fill(user)
      await rule(user, 1, 'checks.db.status', 'down')
      await rule(user, 2, 'ok')
      await chooseKind(user, 2, 'false')
      await rule(user, 3, 'maintenance')
      await chooseKind(user, 3, 'true')
      await addRule(user)
      await user.click(screen.getByRole('radio', { name: 'All rules match' }))
      await user.click(saveButton())
      await marker()
      expect(sentInput().check).toMatchObject({
        json_rules: [
          { field: 'checks.db.status', failing_value: 'down' },
          { field: 'ok', failing_value: false },
          { field: 'maintenance', failing_value: true },
          { field: '', failing_value: '' },
        ],
        json_rule_mode: 'all',
      })
    }, 15_000)

    it('does not send the text typed before the kind became true', async () => {
      vi.mocked(createService).mockResolvedValue(makeService())
      const { user } = setup()
      await fill(user)
      await rule(user, 1, 'a', 'abc')
      await chooseKind(user, 1, 'true')
      await user.click(saveButton())
      await marker()
      expect(sentInput().check).toMatchObject({ json_rules: [{ field: 'a', failing_value: true }] })
    }, 15_000)
  })

  describe('the HTTPS options and the URL', () => {
    it.each(['https://x.example.com', 'HTTPS://x'])('enables the switches for %s and drops the note', (url) => {
      setup()
      setUrl(url)
      expect(screen.queryByText('Available only when the URL starts with https://.')).not.toBeInTheDocument()
      expect(isDisabled(expiry())).toBe(false)
      expect(isDisabled(ignore())).toBe(false)
    })

    it.each(['http://x.example.com', ''])('keeps the note and the disabled controls for %j', (url) => {
      setup()
      setUrl('https://x')
      setUrl(url)
      expect(screen.getByText('Available only when the URL starts with https://.')).toBeInTheDocument()
      expect(isDisabled(expiry()) && isDisabled(ignore())).toBe(true)
      expect(days()).toBeDisabled()
    })

    it('turns both switches off when the URL stops being https, and typing https:// again leaves them off (FR-74)', async () => {
      vi.mocked(createService).mockResolvedValue(makeService())
      const { user } = setup()
      await fill(user, 'Search API', 'https://x')
      await user.click(expiry())
      await user.click(ignore())
      expect(isOn(expiry()) && isOn(ignore())).toBe(true)
      setUrl('http://x')
      expect(isOn(expiry()) || isOn(ignore())).toBe(false)
      setUrl('https://x')
      expect(isOn(expiry()) || isOn(ignore())).toBe(false)
      await user.click(saveButton())
      await marker()
      expect(sentInput().check).toMatchObject({
        certificate_check: { enabled: false },
        ignore_certificate_errors: false,
      })
    })

    it('turns them off for a URL typed through its scheme one character at a time, keeping the days text', async () => {
      const { user } = setup()
      await fill(user, 'Search API', 'https://x')
      await user.click(expiry())
      await user.clear(days())
      await user.type(days(), '30')
      await user.type(urlInput(), '{Backspace}'.repeat('https://x'.length))
      await user.type(urlInput(), 'https://')
      expect(isOn(expiry())).toBe(false)
      expect(days()).toHaveValue('30')
    })

    it('leaves both switches on when the URL goes from one https URL to another', async () => {
      const { user } = setup()
      await fill(user, 'Search API', 'https://a')
      await user.click(expiry())
      await user.click(ignore())
      setUrl('https://b')
      expect(isOn(expiry()) && isOn(ignore())).toBe(true)
    })

    it('keeps the days text while the switch is off and sends it when the switch is turned on again', async () => {
      vi.mocked(createService).mockResolvedValue(makeService())
      const { user } = setup()
      await fill(user, 'Search API', 'https://x')
      await user.click(expiry())
      await user.clear(days())
      await user.type(days(), '30')
      await user.click(expiry())
      expect(days()).toBeDisabled()
      await user.click(expiry())
      await user.click(saveButton())
      await marker()
      expect(sentInput().check).toMatchObject({ certificate_check: { enabled: true, min_days_left: 30 } })
    })

    it('sends the days with the switch on, the ignore switch as set, and no days with the switch off even over abc', async () => {
      vi.mocked(createService).mockResolvedValue(makeService())
      const { user } = setup()
      await fill(user, 'Search API', 'https://x')
      await user.click(expiry())
      await user.clear(days())
      await user.type(days(), '45')
      await user.click(ignore())
      await user.click(saveButton())
      await marker()
      expect(sentInput().check).toMatchObject({
        certificate_check: { enabled: true, min_days_left: 45 },
        ignore_certificate_errors: true,
      })
    })

    it('sends { enabled: false } with abc in the days while the switch is off, with no client error', async () => {
      vi.mocked(createService).mockResolvedValue(makeService())
      const { user } = setup()
      await fill(user, 'Search API', 'https://x')
      await user.click(expiry())
      await user.clear(days())
      await user.type(days(), 'abc')
      await user.click(expiry())
      await user.click(saveButton())
      await marker()
      expect(screen.queryByText('Enter a whole number.')).not.toBeInTheDocument()
      expect(sentInput().check).toMatchObject({ certificate_check: { enabled: false } })
      expect(JSON.stringify(sentInput().check)).not.toContain('min_days_left')
    })
  })

  describe('the client check of the days', () => {
    async function withDays(user: User, text: string) {
      await fill(user, 'Search API', 'https://x')
      await user.click(expiry())
      await user.clear(days())
      if (text !== '') await user.type(days(), text)
      await user.click(saveButton())
    }

    it.each(['', 'abc', '1.5', '-3', '9007199254740992', '12345678901234567890', '1e3', '+5'])(
      'refuses %j with the message under the days, focus on it, and nothing sent',
      async (text) => {
        const { user } = setup()
        await withDays(user, text)
        expect(createService).not.toHaveBeenCalled()
        expect(days()).toHaveFocus()
        expect(days()).toHaveAttribute('aria-invalid', 'true')
        expect(describedBy(days())).toBe('Enter a whole number.')
      },
    )

    it('focuses the first invalid field of the whole form in its order, the days before the timing', async () => {
      const { user } = setup()
      await fill(user, 'Search API', 'https://x')
      await user.click(expiry())
      await user.clear(days())
      await user.type(days(), 'abc')
      await user.clear(screen.getByLabelText('Timeout'))
      await user.type(screen.getByLabelText('Timeout'), 'x')
      await user.click(saveButton())
      expect(days()).toHaveFocus()
      expect(screen.getByLabelText('Timeout')).toHaveAttribute('aria-invalid', 'true')
    })

    it('drops the message when the days are edited, when the switch is turned off and when the URL is edited', async () => {
      const { user } = setup()
      await withDays(user, 'abc')
      await user.type(days(), '1')
      expect(screen.queryByText('Enter a whole number.')).not.toBeInTheDocument()
      await user.click(saveButton())
      expect(screen.getByText('Enter a whole number.')).toBeInTheDocument()
      await user.click(expiry())
      expect(screen.queryByText('Enter a whole number.')).not.toBeInTheDocument()
      await user.click(expiry())
      await user.click(saveButton())
      expect(screen.getByText('Enter a whole number.')).toBeInTheDocument()
      setUrl('https://y')
      expect(screen.queryByText('Enter a whole number.')).not.toBeInTheDocument()
    })

    it.each([
      ['1', 1],
      [' 7 ', 7],
      ['9007199254740991', Number.MAX_SAFE_INTEGER],
    ])('sends %j as the whole number %d', async (text, sent) => {
      vi.mocked(createService).mockResolvedValue(makeService())
      const { user } = setup()
      await withDays(user, text)
      await marker()
      expect(sentInput().check).toMatchObject({ certificate_check: { enabled: true, min_days_left: sent } })
    })

    it('sends 0 (the server refuses it)', async () => {
      vi.mocked(createService).mockResolvedValue(makeService())
      const { user } = setup()
      await withDays(user, '0')
      await marker()
      expect(sentInput().check).toMatchObject({ certificate_check: { enabled: true, min_days_left: 0 } })
    })
  })

  describe('in flight', () => {
    it('locks the inputs, the select, the switches, the radios and the buttons, and releases them after a failure', async () => {
      const settle = pending()
      const { user } = setup()
      await fill(user, 'Search API', 'https://x')
      await rule(user, 1, 'a', 'b')
      await user.click(expiry())
      await user.click(saveButton())
      await waitFor(() => expect(saveButton()).toBeDisabled())
      expect(screen.getByLabelText('Rule 1 field path')).toHaveAttribute('readonly')
      expect(screen.getByLabelText('Rule 1 failing text')).toHaveAttribute('readonly')
      expect(days()).toHaveAttribute('readonly')
      expect(kindTrigger(1)).toBeDisabled()
      expect(isDisabled(expiry()) && isDisabled(ignore())).toBe(true)
      expect(screen.getByRole('button', { name: 'Add rule' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Remove rule 1' })).toBeDisabled()
      for (const radio of screen.getAllByRole('radio')) expect(radio).toHaveAttribute('aria-disabled', 'true')
      await act(async () => settle.reject(problem(500, 'internal_error')))
      await waitFor(() => expect(saveButton()).toBeEnabled())
      expect(screen.getByLabelText('Rule 1 field path')).not.toHaveAttribute('readonly')
      expect(days()).not.toHaveAttribute('readonly')
      expect(kindTrigger(1)).toBeEnabled()
      expect(isDisabled(expiry())).toBe(false)
      expect(screen.getByRole('button', { name: 'Add rule' })).toBeEnabled()
      for (const radio of screen.getAllByRole('radio')) expect(radio).not.toHaveAttribute('aria-disabled', 'true')
    })
  })

  describe('a 422', () => {
    it('on two rules lists them in the order sent as links to the path input and the kind trigger, shows each message with its control marked, and the summary has focus (NFR-7)', async () => {
      const { user } = setup()
      await saveRefused(
        user,
        validationProblem(
          fieldError('check.json_rules[1].field', 'Rule 2 needs a <b>field</b>.', 'required'),
          fieldError('check.json_rules[0].failing_value', 'Rule 1 needs a value.', 'required'),
        ),
        async () => {
          await rule(user, 1, 'a')
          await addRule(user)
        },
      )
      expect(summaryItems()).toEqual([
        'Rule 2 field path: Rule 2 needs a <b>field</b>.',
        'Rule 1 failing value: Rule 1 needs a value.',
      ])
      expect(summary()).toHaveFocus()
      const path = screen.getByLabelText('Rule 2 field path')
      expect(path).toHaveAttribute('aria-invalid', 'true')
      expect(describedBy(path)).toBe('Rule 2 needs a <b>field</b>.')
      expect(within(summary()).queryByRole('strong')).toBeNull()
      expect(kindTrigger(1)).toHaveAttribute('aria-invalid', 'true')
      expect(describedBy(kindTrigger(1))).toBe('Rule 1 needs a value.')
      expect(screen.getByLabelText('Rule 1 failing text')).not.toHaveAttribute('aria-invalid')
      await user.click(within(summary()).getByRole('link', { name: /^Rule 2 field path/ }))
      expect(path).toHaveFocus()
      await user.click(within(summary()).getByRole('link', { name: /^Rule 1 failing value/ }))
      expect(kindTrigger(1)).toHaveFocus()
    })

    it('on the list shows the message under the rows, plain text in the summary, and no input invalid', async () => {
      const { user } = setup()
      await saveRefused(
        user,
        validationProblem(fieldError('check.json_rules', 'Too many rules (10).', 'too_many')),
        () => rule(user, 1, 'a'),
      )
      expect(summaryItems()).toEqual(['Health rules: Too many rules (10).'])
      expect(within(summary()).queryByRole('link')).toBeNull()
      // The message under the rows; the summary line carries its label as well.
      expect(screen.getByText('Too many rules (10).').closest('.rows')).not.toBeNull()
      expect(document.querySelector('[aria-invalid="true"]')).toBeNull()
    })

    it('on the days shows the message under the days and links the summary entry to the input', async () => {
      const { user } = setup()
      await saveRefused(
        user,
        validationProblem(fieldError('check.certificate_check.min_days_left', 'Must be 1 or more.', 'out_of_range')),
        async () => {
          setUrl('https://x')
          await user.click(expiry())
        },
      )
      expect(days()).toHaveAttribute('aria-invalid', 'true')
      expect(describedBy(days())).toBe('Must be 1 or more.')
      expect(summaryItems()).toEqual(['Minimum days left: Must be 1 or more.'])
      await user.click(within(summary()).getByRole('link', { name: /Minimum days left/ }))
      expect(days()).toHaveFocus()
    })

    it('on the two switches shows each message under its switch and lists them as plain text', async () => {
      const { user } = setup()
      await saveRefused(
        user,
        validationProblem(
          fieldError('check.certificate_check.enabled', 'Needs an https:// URL.', 'requires_https_url'),
          fieldError('check.ignore_certificate_errors', 'Needs an https:// URL, too.', 'requires_https_url'),
        ),
      )
      expect(summaryItems()).toEqual([
        'Check certificate expiry: Needs an https:// URL.',
        'Ignore certificate errors: Needs an https:// URL, too.',
      ])
      expect(within(summary()).queryByRole('link')).toBeNull()
      expect(expiry().closest('div')).toContainElement(screen.getByText('Needs an https:// URL.'))
      expect(ignore().closest('div')).toContainElement(screen.getByText('Needs an https:// URL, too.'))
      expect(document.querySelector('[aria-invalid="true"]')).toBeNull()
    })

    it('on the mode lists it as plain text with no link and no input invalid', async () => {
      const { user } = setup()
      await saveRefused(user, validationProblem(fieldError('check.json_rule_mode', 'Bad mode.')))
      expect(summaryItems()).toEqual(['Mark unhealthy when: Bad mode.'])
      expect(within(summary()).queryByRole('link')).toBeNull()
      expect(document.querySelector('[aria-invalid="true"]')).toBeNull()
    })

    it('shows a check.url error and a rule error together and clears them independently', async () => {
      const { user } = setup()
      await saveRefused(
        user,
        validationProblem(
          fieldError('check.url', 'Not a good URL.'),
          fieldError('check.json_rules[0].field', 'Needs a field.', 'required'),
        ),
        () => addRule(user),
      )
      expect(summaryItems()).toEqual(['URL: Not a good URL.', 'Rule 1 field path: Needs a field.'])
      await user.type(screen.getByLabelText('Rule 1 field path'), 'a')
      expect(summaryItems()).toEqual(['URL: Not a good URL.'])
      expect(describedBy(urlInput())).toBe('Not a good URL.')
    })
  })

  describe('clearing the errors', () => {
    const MANY = [
      fieldError('check.json_rules', 'List.', 'too_many'),
      fieldError('check.json_rules[0].field', 'Path 1.', 'required'),
      fieldError('check.json_rules[1].failing_value', 'Value 2.', 'required'),
      fieldError('check.headers[0].name', 'Header 1.'),
      fieldError('check.json_rule_mode', 'Mode.'),
      fieldError('check.certificate_check.enabled', 'Expiry.', 'requires_https_url'),
      fieldError('check.certificate_check.min_days_left', 'Days.', 'out_of_range'),
      fieldError('check.ignore_certificate_errors', 'Ignore.', 'requires_https_url'),
    ]
    async function refused(user: User) {
      await saveRefused(user, validationProblem(...MANY), async () => {
        await user.click(screen.getByRole('button', { name: 'Add header' }))
        await rule(user, 1, 'a')
        await addRule(user)
        setUrl('https://x')
      })
    }
    const labels = () => summaryItems().map((item) => (item ?? '').split(':')[0])

    it('editing a rule’s path clears only its error', async () => {
      const { user } = setup()
      await refused(user)
      await user.type(screen.getByLabelText('Rule 1 field path'), 'b')
      expect(labels()).not.toContain('Rule 1 field path')
      expect(labels()).toContain('Rule 2 failing value')
      expect(labels()).toHaveLength(7)
    })

    it('changing a rule’s kind clears its failing value error; typing its text does too', async () => {
      const { user } = setup()
      await refused(user)
      await chooseKind(user, 2, 'true')
      expect(labels()).not.toContain('Rule 2 failing value')
      expect(labels()).toContain('Rule 1 field path')
    })

    it('typing a rule’s text clears its failing value error', async () => {
      const { user } = setup()
      await refused(user)
      await user.type(screen.getByLabelText('Rule 2 failing text'), 'x')
      expect(labels()).not.toContain('Rule 2 failing value')
    })

    it('Add rule clears the list’s error only', async () => {
      const { user } = setup()
      await refused(user)
      await addRule(user)
      expect(labels()).not.toContain('Health rules')
      expect(labels()).toContain('Rule 1 field path')
      expect(labels()).toHaveLength(7)
    })

    it('Remove clears the list’s error and every rule row error, and leaves the request rows’ error', async () => {
      const { user } = setup()
      await refused(user)
      await user.click(screen.getByRole('button', { name: 'Remove rule 1' }))
      expect(labels()).toEqual([
        'Header 1 name',
        'Mark unhealthy when',
        'Check certificate expiry',
        'Minimum days left',
        'Ignore certificate errors',
      ])
    })

    it('changing the mode clears the mode error', async () => {
      const { user } = setup()
      await refused(user)
      await user.click(screen.getByRole('radio', { name: 'All rules match' }))
      expect(labels()).not.toContain('Mark unhealthy when')
      expect(labels()).toHaveLength(7)
    })

    it('turning a switch clears its own error; turning the expiry switch off also clears the days error', async () => {
      const { user } = setup()
      await refused(user)
      await user.click(ignore())
      expect(labels()).not.toContain('Ignore certificate errors')
      expect(labels()).toContain('Check certificate expiry')
      await user.click(expiry())
      expect(labels()).not.toContain('Check certificate expiry')
      expect(labels()).toContain('Minimum days left')
      await user.click(expiry())
      expect(labels()).not.toContain('Minimum days left')
    })

    it('editing the days clears only the days error', async () => {
      const { user } = setup()
      await refused(user)
      await user.click(expiry())
      await user.type(days(), '1')
      expect(labels()).not.toContain('Minimum days left')
      expect(labels()).toContain('Ignore certificate errors')
    })

    it('editing the URL clears the two requires_https_url errors and the days error', async () => {
      const { user } = setup()
      await refused(user)
      setUrl('https://other')
      expect(labels()).toEqual([
        'Health rules',
        'Rule 1 field path',
        'Rule 2 failing value',
        'Header 1 name',
        'Mark unhealthy when',
      ])
    })

    it('removes the summary with the last clearing', async () => {
      const { user } = setup()
      await saveRefused(
        user,
        validationProblem(fieldError('check.json_rules[0].field', 'Needs a field.', 'required')),
        () => addRule(user),
      )
      expect(screen.getByRole('alert')).toBeInTheDocument()
      await user.type(screen.getByLabelText('Rule 1 field path'), 'a')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('leaving without saving', () => {
    it.each([
      [
        'adding a rule',
        (user: User) => addRule(user),
        (user: User) => user.click(screen.getByRole('button', { name: 'Remove rule 1' })),
      ],
      [
        'choosing All rules match',
        (user: User) => user.click(screen.getByRole('radio', { name: 'All rules match' })),
        (user: User) => user.click(screen.getByRole('radio', { name: 'Any rule matches' })),
      ],
    ])(
      '%s makes the footer say Unsaved changes, arms the prompt and asks on Cancel; putting it back leaves at once',
      async (_label, change, undo) => {
        const { user } = setup()
        await change(user)
        expect(footerStatus()).toHaveTextContent('Unsaved changes')
        expect(unloadPrompts()).toBe(true)
        await user.click(cancelButton())
        expect(discardDialog()).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Keep editing' }))
        await undo(user)
        expect(footerStatus()).toBeEmptyDOMElement()
        expect(unloadPrompts()).toBe(false)
        await user.click(cancelButton())
        expect(await marker()).toBeInTheDocument()
      },
    )

    it.each([
      ['the expiry switch on', () => expiry()],
      ['the ignore switch on', () => ignore()],
    ])(
      '%s makes the footer say Unsaved changes and arms the prompt; turning it off again clears both',
      async (_label, control) => {
        const { user } = setup()
        setUrl('https://x')
        setUrl('')
        expect(footerStatus()).toBeEmptyDOMElement()
        setUrl('https://x')
        await user.click(control())
        expect(footerStatus()).toHaveTextContent('Unsaved changes')
        expect(unloadPrompts()).toBe(true)
        await user.click(control())
        setUrl('')
        expect(footerStatus()).toBeEmptyDOMElement()
        expect(unloadPrompts()).toBe(false)
      },
    )

    it('changing the days counts as a change, a trailing space too, and putting 14 back does not', async () => {
      const { user } = setup()
      setUrl('https://x')
      await user.click(expiry())
      await user.click(expiry())
      setUrl('')
      expect(footerStatus()).toBeEmptyDOMElement()
      for (const [text, changed] of [
        ['14 ', true],
        ['7', true],
        ['14', false],
      ] as const) {
        fireEvent.change(days(), { target: { value: text } })
        if (changed) expect(footerStatus()).toHaveTextContent('Unsaved changes')
        else expect(footerStatus()).toBeEmptyDOMElement()
      }
    })
  })

  describe('Tab order (NFR-4)', () => {
    it('goes from the Body type to Add rule, the mode (one stop), the expiry switch, the ignore switch, then Check interval', async () => {
      const { user } = setup()
      await fill(user, 'Search API', 'https://x')
      await user.click(screen.getByRole('radio', { name: 'None' }))
      await user.tab()
      expect(screen.getByRole('button', { name: 'Add rule' })).toHaveFocus()
      await user.tab()
      expect(screen.getByRole('radio', { name: 'Any rule matches' })).toHaveFocus()
      await user.tab()
      expect(expiry()).toHaveFocus()
      await user.tab()
      expect(ignore()).toHaveFocus()
      await user.tab()
      expect(screen.getByLabelText('Check interval')).toHaveFocus()
    })

    it('puts the days between the two switches while it is enabled', async () => {
      const { user } = setup()
      await fill(user, 'Search API', 'https://x')
      await user.click(expiry())
      expect(expiry()).toHaveFocus()
      await user.tab()
      expect(days()).toHaveFocus()
      await user.tab()
      expect(ignore()).toHaveFocus()
    })

    it('goes path, kind, text, Remove, Add rule with one rule', async () => {
      const { user } = setup()
      await addRule(user)
      expect(screen.getByLabelText('Rule 1 field path')).toHaveFocus()
      await user.tab()
      expect(kindTrigger(1)).toHaveFocus()
      await user.tab()
      expect(screen.getByLabelText('Rule 1 failing text')).toHaveFocus()
      await user.tab()
      expect(screen.getByRole('button', { name: 'Remove rule 1' })).toHaveFocus()
      await user.tab()
      expect(screen.getByRole('button', { name: 'Add rule' })).toHaveFocus()
    })
  })
})

describe('the Type choice and the TCP port group (FR-33, FR-49, FR-52, FR-74, NFR-4, NFR-7)', () => {
  type User = ReturnType<typeof userEvent.setup>
  const typeGroup = () => screen.getByRole('radiogroup', { name: 'Type' })
  const chooseType = (user: User, name: 'HTTP(S)' | 'TCP port') => user.click(screen.getByRole('radio', { name }))
  const hostInput = () => screen.getByLabelText('Host')
  const portInput = () => screen.getByLabelText('Port')
  const legends = () => Array.from(document.querySelectorAll('legend.group__legend')).map((el) => el.textContent)
  const summary = () => screen.getByRole('alert')
  const summaryItems = () => within(summary()).getAllByRole('listitem').map((item) => item.textContent)
  const WHOLE = 'Enter a whole number.'
  const set = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } })
  const chooseTcp = async (user: User) => {
    await chooseType(user, 'TCP port')
    await screen.findByLabelText('Host')
  }
  /** Fills the name, chooses TCP, types host and port, has the request refused with `error`, and waits. */
  async function tcpRefused(user: User, error: unknown, host = 'db.internal', port = '5432') {
    vi.mocked(createService).mockRejectedValueOnce(error)
    await user.type(nameInput(), 'DB')
    await chooseTcp(user)
    if (host !== '') await user.type(hostInput(), host)
    await user.type(portInput(), port)
    await user.click(saveButton())
    await waitFor(() => expect(saveButton()).toBeEnabled())
  }

  describe('idle and choosing', () => {
    it('shows Type with HTTP(S) chosen and its hint, and the HTTP groups only (FR-33)', () => {
      setup()
      expect(within(typeGroup()).getByRole('radio', { name: 'HTTP(S)' })).toBeChecked()
      expect(within(typeGroup()).getByRole('radio', { name: 'TCP port' })).not.toBeChecked()
      expect(screen.getByText('Changing type swaps the fields below.')).toBeInTheDocument()
      expect(legends()).toEqual(['Service', 'Request', 'Health rules (optional)', 'HTTPS', 'Timing', 'Alerts', 'Public page'])
      expect(screen.queryByLabelText('Host')).toBeNull()
      expect(screen.queryByLabelText('Port')).toBeNull()
      const name = nameInput().closest('.field') as HTMLElement
      expect(name.nextElementSibling).toContainElement(typeGroup())
    })

    it('swaps to the TCP port group, keeps focus on the radio and keeps the Timing and Alerts values (FR-33, FR-52)', async () => {
      const { user } = setup()
      await user.clear(screen.getByLabelText('Timeout'))
      await user.type(screen.getByLabelText('Timeout'), '5')
      await user.click(screen.getByRole('switch', { name: 'Send alerts' }))
      await chooseType(user, 'TCP port')
      expect(legends()).toEqual(['Service', 'TCP port', 'Timing', 'Alerts', 'Public page'])
      expect(hostInput()).toHaveValue('')
      expect(hostInput()).toHaveAttribute('placeholder', 'db.internal or 10.0.0.12')
      expect(portInput()).toHaveValue('')
      expect(portInput()).toHaveAttribute('placeholder', '5432')
      expect(portInput()).toHaveAttribute('inputmode', 'numeric')
      expect(portInput()).toHaveAccessibleDescription('1 to 65535')
      expect(screen.queryByLabelText('URL')).toBeNull()
      expect(screen.queryByRole('combobox', { name: 'Method' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Add rule' })).toBeNull()
      expect(screen.queryByText('Minimum days left')).toBeNull()
      expect(screen.getByRole('radio', { name: 'TCP port' })).toHaveFocus()
      expect(screen.getByLabelText('Timeout')).toHaveValue('5')
      expect(screen.getByRole('switch', { name: 'Send alerts' })).toHaveAttribute('aria-checked', 'false')
    })

    it('keeps the HTTP values while TCP is chosen and the TCP values while HTTP(S) is chosen', async () => {
      const { user } = setup()
      await user.type(urlInput(), 'https://a.example')
      await user.click(screen.getByRole('button', { name: 'Add parameter' }))
      await user.type(screen.getByLabelText('Query parameter 1 name'), 'q')
      await user.click(screen.getByRole('button', { name: 'Add rule' }))
      await user.type(screen.getByLabelText('Rule 1 field path'), 'ok')
      await user.click(screen.getByRole('switch', { name: /Ignore certificate errors/ }))
      await chooseTcp(user)
      await user.type(hostInput(), 'db.internal')
      await user.type(portInput(), '5432')
      await chooseType(user, 'HTTP(S)')
      expect(urlInput()).toHaveValue('https://a.example')
      expect(screen.getByLabelText('Query parameter 1 name')).toHaveValue('q')
      expect(screen.getByLabelText('Rule 1 field path')).toHaveValue('ok')
      expect(screen.getByRole('switch', { name: /Ignore certificate errors/ })).toHaveAttribute('aria-checked', 'true')
      await chooseType(user, 'TCP port')
      expect(hostInput()).toHaveValue('db.internal')
      expect(portInput()).toHaveValue('5432')
    })
  })

  describe('sending', () => {
    it('sends only type, host and port for TCP with an empty URL, then the HTTP check when HTTP(S) is chosen again (FR-33, FR-49)', async () => {
      vi.mocked(createService).mockResolvedValue(makeService())
      const { user } = setup()
      await user.type(nameInput(), 'DB')
      await chooseTcp(user)
      await user.type(hostInput(), 'db.internal')
      await user.type(portInput(), ' 5432 ')
      await user.click(saveButton())
      await waitFor(() => expect(createService).toHaveBeenCalledTimes(1))
      expect(sentInput().check).toStrictEqual({ type: 'tcp', host: 'db.internal', port: 5432 })
      expect(sentInput()).toMatchObject({ name: 'DB', alerts_enabled: true, settings: { timeout_seconds: 10 } })
      await marker()
    })

    it('sends the HTTP check, with no host or port, when HTTP(S) is chosen again with a URL', async () => {
      vi.mocked(createService).mockResolvedValue(makeService())
      const { user } = setup()
      await user.type(nameInput(), 'DB')
      await chooseTcp(user)
      await user.type(hostInput(), 'db.internal')
      await user.type(portInput(), '5432')
      await chooseType(user, 'HTTP(S)')
      await user.type(urlInput(), URL_VALUE)
      await user.click(saveButton())
      await waitFor(() => expect(createService).toHaveBeenCalledTimes(1))
      const check = sentInput().check
      expect(check).toMatchObject({ type: 'http', method: 'GET', url: URL_VALUE })
      expect(check).not.toHaveProperty('host')
      expect(check).not.toHaveProperty('port')
    })

    it('sends the Timing values as typed with a TCP check (FR-52)', async () => {
      vi.mocked(createService).mockResolvedValue(makeService())
      const { user } = setup()
      await user.type(nameInput(), 'DB')
      await chooseTcp(user)
      await user.type(hostInput(), 'h')
      await user.type(portInput(), '1')
      set(screen.getByLabelText('Check interval'), '45')
      set(screen.getByLabelText('Timeout'), '5')
      set(screen.getByLabelText('Retries'), '0')
      set(screen.getByLabelText('Retry interval'), '1')
      await user.click(saveButton())
      await waitFor(() => expect(createService).toHaveBeenCalledTimes(1))
      expect(sentInput().settings).toEqual({
        check_interval_seconds: 45,
        timeout_seconds: 5,
        retry_count: 0,
        retry_interval_seconds: 1,
      })
    })

    it.each([
      ['1', 1],
      ['65535', 65535],
      ['65536', 65536],
      [' 80 ', 80],
      ['00080', 80],
    ])('sends port %j as the integer %d, the range being the server’s (FR-74)', async (port, expected) => {
      vi.mocked(createService).mockResolvedValue(makeService())
      const { user } = setup()
      await user.type(nameInput(), 'DB')
      await chooseTcp(user)
      await user.type(hostInput(), 'h')
      await user.type(portInput(), port)
      await user.click(saveButton())
      await waitFor(() => expect(createService).toHaveBeenCalledTimes(1))
      expect(sentInput().check).toStrictEqual({ type: 'tcp', host: 'h', port: expected })
    })

    it('sends a host with spaces and markup as typed, and shows it back as text (NFR-7)', async () => {
      vi.mocked(createService).mockRejectedValue(
        validationProblem(fieldError('check.host', '<b>bad</b> host', 'invalid_value')),
      )
      const { user } = setup()
      await user.type(nameInput(), 'DB')
      await chooseTcp(user)
      await user.type(hostInput(), '  <img src=x onerror=1> a b  ')
      await user.type(portInput(), '1')
      await user.click(saveButton())
      await waitFor(() => expect(createService).toHaveBeenCalledTimes(1))
      expect(sentInput().check).toStrictEqual({ type: 'tcp', host: '  <img src=x onerror=1> a b  ', port: 1 })
      expect((await screen.findAllByText('<b>bad</b> host')).length).toBeGreaterThan(0)
      expect(document.querySelector('b')).toBeNull()
    })

    it('keeps both sets of values through five type switches and sends the chosen type', async () => {
      vi.mocked(createService).mockResolvedValue(makeService())
      const { user } = setup()
      await user.type(nameInput(), 'DB')
      await user.type(urlInput(), URL_VALUE)
      await chooseTcp(user)
      await user.type(hostInput(), 'db.internal')
      await user.type(portInput(), '5432')
      for (const next of ['HTTP(S)', 'TCP port', 'HTTP(S)', 'TCP port', 'HTTP(S)'] as const) await chooseType(user, next)
      expect(urlInput()).toHaveValue(URL_VALUE)
      await chooseType(user, 'TCP port')
      expect(hostInput()).toHaveValue('db.internal')
      expect(portInput()).toHaveValue('5432')
      await user.click(saveButton())
      await waitFor(() => expect(createService).toHaveBeenCalledTimes(1))
      expect(sentInput().check).toStrictEqual({ type: 'tcp', host: 'db.internal', port: 5432 })
    })

    it.each(['0', '70000'])('sends port %s and an empty host: the range and the host are the server’s (FR-74)', async (port) => {
      vi.mocked(createService).mockResolvedValue(makeService())
      const { user } = setup()
      await user.type(nameInput(), 'DB')
      await chooseTcp(user)
      await user.type(portInput(), port)
      await user.click(saveButton())
      await waitFor(() => expect(createService).toHaveBeenCalledTimes(1))
      expect(sentInput().check).toStrictEqual({ type: 'tcp', host: '', port: Number(port) })
    })
  })

  describe('the client check of the port', () => {
    it.each(['', 'abc', '1.5', '-3', '8o', '9007199254740992', '9999999999999999999999'])('refuses %j under Port, focuses it, sends nothing (FR-74)', async (port) => {
      const { user } = setup()
      await user.type(nameInput(), 'DB')
      await chooseTcp(user)
      await user.type(hostInput(), 'h')
      if (port !== '') await user.type(portInput(), port)
      await user.click(saveButton())
      expect(createService).not.toHaveBeenCalled()
      expect(portInput()).toHaveAttribute('aria-invalid', 'true')
      expect(describedBy(portInput())).toBe(WHOLE)
      expect(portInput()).toHaveFocus()
      expect(hostInput()).not.toHaveAttribute('aria-invalid')
    })

    it('goes when the port is edited, and when the type is changed', async () => {
      const { user } = setup()
      await user.type(nameInput(), 'DB')
      await chooseTcp(user)
      await user.click(saveButton())
      expect(screen.getByText(WHOLE)).toBeInTheDocument()
      await user.type(portInput(), '5')
      expect(screen.queryByText(WHOLE)).toBeNull()
      await user.clear(portInput())
      await user.click(saveButton())
      expect(screen.getByText(WHOLE)).toBeInTheDocument()
      await chooseType(user, 'HTTP(S)')
      await chooseType(user, 'TCP port')
      expect(screen.queryByText(WHOLE)).toBeNull()
      expect(portInput()).not.toHaveAttribute('aria-invalid')
    })

    it('focuses Port before a bad timing field, which comes later on the page', async () => {
      const { user } = setup()
      await user.type(nameInput(), 'DB')
      await chooseTcp(user)
      set(screen.getByLabelText('Retries'), 'x')
      await user.click(saveButton())
      expect(screen.getAllByText(WHOLE)).toHaveLength(2)
      expect(portInput()).toHaveFocus()
    })

    it('focuses the URL, not a bad timing field, after choosing TCP and then HTTP(S) again', async () => {
      const { user } = setup()
      await user.type(nameInput(), 'DB')
      await chooseTcp(user)
      await chooseType(user, 'HTTP(S)')
      set(screen.getByLabelText('Retries'), 'x')
      await user.click(saveButton())
      expect(screen.getByText('Enter a URL.')).toBeInTheDocument()
      expect(urlInput()).toHaveFocus()
    })

    it('does not check the hidden URL, and a URL error left from HTTP(S) does not come back', async () => {
      const { user } = setup()
      await user.type(nameInput(), 'DB')
      await user.click(saveButton())
      expect(screen.getByText('Enter a URL.')).toBeInTheDocument()
      await chooseTcp(user)
      await user.type(hostInput(), 'h')
      await user.type(portInput(), '1')
      await chooseType(user, 'HTTP(S)')
      expect(screen.queryByText('Enter a URL.')).toBeNull()
      expect(urlInput()).not.toHaveAttribute('aria-invalid')
    })

    it('does not check a hidden days field, and its error does not come back', async () => {
      const { user } = setup()
      await user.type(nameInput(), 'DB')
      await user.type(urlInput(), 'https://x')
      await user.click(screen.getByRole('switch', { name: /Check certificate expiry/ }))
      set(screen.getByLabelText('Minimum days left'), 'x')
      await user.click(saveButton())
      expect(screen.getByText(WHOLE)).toBeInTheDocument()
      await chooseTcp(user)
      await user.type(hostInput(), 'h')
      await user.type(portInput(), '1')
      await chooseType(user, 'HTTP(S)')
      expect(screen.queryByText(WHOLE)).toBeNull()
      await chooseType(user, 'TCP port')
      vi.mocked(createService).mockResolvedValue(makeService())
      await user.click(saveButton())
      await waitFor(() => expect(createService).toHaveBeenCalledTimes(1))
    })
  })

  describe('in flight', () => {
    it('locks the Type choice, Host and Port, and releases them after a failure', async () => {
      const settle = pending()
      const { user } = setup()
      await user.type(nameInput(), 'DB')
      await chooseTcp(user)
      await user.type(hostInput(), 'h')
      await user.type(portInput(), '1')
      await user.click(saveButton())
      expect(hostInput()).toHaveAttribute('readonly')
      expect(portInput()).toHaveAttribute('readonly')
      for (const radio of within(typeGroup()).getAllByRole('radio')) expect(radio).toHaveAttribute('aria-disabled', 'true')
      await act(async () => settle.reject(problem(500, 'internal_error')))
      await waitFor(() => expect(saveButton()).toBeEnabled())
      expect(hostInput()).not.toHaveAttribute('readonly')
      expect(portInput()).not.toHaveAttribute('readonly')
      for (const radio of within(typeGroup()).getAllByRole('radio'))
        expect(radio).not.toHaveAttribute('aria-disabled', 'true')
    })
  })

  describe('a 422', () => {
    it('lists Host and Port as links, shows each message under its input, and focuses the summary (NFR-7)', async () => {
      const { user } = setup()
      await tcpRefused(
        user,
        validationProblem(
          fieldError('check.host', 'Enter a <b>host</b>.', 'required'),
          fieldError('check.port', 'Must be between 1 and 65535.', 'out_of_range'),
        ),
        '',
        '70000',
      )
      expect(summaryItems()).toEqual(['Host: Enter a <b>host</b>.', 'Port: Must be between 1 and 65535.'])
      expect(summary()).toHaveFocus()
      expect(within(summary()).queryByRole('strong')).toBeNull()
      expect(hostInput()).toHaveAttribute('aria-invalid', 'true')
      expect(describedBy(hostInput())).toBe('Enter a <b>host</b>.')
      expect(portInput()).toHaveAttribute('aria-invalid', 'true')
      expect(describedBy(portInput())).toBe('Must be between 1 and 65535.')
      expect(screen.queryByText('1 to 65535')).toBeNull()
      await user.click(within(summary()).getByRole('link', { name: /^Port/ }))
      expect(portInput()).toHaveFocus()
      await user.click(within(summary()).getByRole('link', { name: /^Host/ }))
      expect(hostInput()).toHaveFocus()
    })

    it('lists check.type as plain text with no link and no input invalid', async () => {
      const { user } = setup()
      await tcpRefused(user, validationProblem(fieldError('check.type', 'Not a type.', 'invalid_value')))
      expect(summaryItems()).toEqual(['Type: Not a type.'])
      expect(within(summary()).queryByRole('link')).toBeNull()
      expect(document.querySelector('[aria-invalid="true"]')).toBeNull()
    })

    const FOUR = () =>
      validationProblem(
        fieldError('name', 'Name problem.'),
        fieldError('check.host', 'Host problem.'),
        fieldError('check.port', 'Port problem.'),
        fieldError('settings.timeout_seconds', 'Timeout problem.', 'out_of_range'),
      )

    it('editing the host clears only its error', async () => {
      const { user } = setup()
      await tcpRefused(user, FOUR())
      await user.type(hostInput(), 'x')
      expect(summaryItems()).toEqual(['Name: Name problem.', 'Port: Port problem.', 'Timeout: Timeout problem.'])
      expect(hostInput()).not.toHaveAttribute('aria-invalid')
    })

    it('editing the port clears only its error', async () => {
      const { user } = setup()
      await tcpRefused(user, FOUR())
      await user.type(portInput(), '1')
      expect(summaryItems()).toEqual(['Name: Name problem.', 'Host: Host problem.', 'Timeout: Timeout problem.'])
      expect(describedBy(portInput())).toBe('1 to 65535')
    })

    it('changing the type clears every check. entry, keeps the name and timing ones, and removes the summary after the last', async () => {
      const { user } = setup()
      vi.mocked(createService).mockRejectedValueOnce(
        validationProblem(
          fieldError('check.url', 'URL problem.'),
          fieldError('check.query_params[0].name', 'Row problem.'),
          fieldError('check.host', 'Host problem.'),
          fieldError('name', 'Name problem.'),
          fieldError('settings.timeout_seconds', 'Timeout problem.', 'out_of_range'),
        ),
      )
      await fill(user)
      await user.click(screen.getByRole('button', { name: 'Add parameter' }))
      await user.click(saveButton())
      await waitFor(() => expect(saveButton()).toBeEnabled())
      expect(summaryItems()).toHaveLength(5)
      await chooseType(user, 'TCP port')
      expect(summaryItems()).toEqual(['Name: Name problem.', 'Timeout: Timeout problem.'])
      await user.type(nameInput(), 'x')
      await user.type(screen.getByLabelText('Timeout'), '1')
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })

  describe('leaving without saving', () => {
    it.each([
      ['choosing TCP port', async (user: User) => chooseType(user, 'TCP port')],
      [
        'typing a host',
        async (user: User) => {
          await chooseTcp(user)
          await chooseType(user, 'HTTP(S)')
          await chooseType(user, 'TCP port')
          await user.type(hostInput(), 'h')
          await user.click(screen.getByRole('radio', { name: 'TCP port' }))
        },
      ],
    ])('%s makes the form changed, and putting it back makes it unchanged', async (_label, change) => {
      const { user } = setup()
      expect(footerStatus()).toBeEmptyDOMElement()
      await change(user)
      expect(footerStatus()).toHaveTextContent('Unsaved changes')
      expect(unloadPrompts()).toBe(true)
      await user.click(cancelButton())
      expect(discardDialog()).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Keep editing' }))
      if (screen.queryByLabelText('Host')) await user.clear(hostInput())
      await chooseType(user, 'HTTP(S)')
      expect(footerStatus()).toBeEmptyDOMElement()
      expect(unloadPrompts()).toBe(false)
      await user.click(cancelButton())
      await marker()
    })

    it('a typed port counts as changed while HTTP(S) is chosen', async () => {
      const { user } = setup()
      await chooseTcp(user)
      await user.type(portInput(), '1')
      await chooseType(user, 'HTTP(S)')
      expect(footerStatus()).toHaveTextContent('Unsaved changes')
      await chooseType(user, 'TCP port')
      await user.clear(portInput())
      await chooseType(user, 'HTTP(S)')
      expect(footerStatus()).toBeEmptyDOMElement()
    })
  })

  describe('Tab order (NFR-4)', () => {
    it('goes Name, the Type choice as one stop, then Method with HTTP(S)', async () => {
      const { user } = setup()
      expect(nameInput()).toHaveFocus()
      await user.tab()
      expect(screen.getByRole('radio', { name: 'HTTP(S)' })).toHaveFocus()
      await user.keyboard('{ArrowRight}')
      expect(screen.getByRole('radio', { name: 'TCP port' })).toBeChecked()
      await user.keyboard('{ArrowLeft}')
      expect(screen.getByRole('radio', { name: 'HTTP(S)' })).toBeChecked()
      await user.tab()
      expect(methodTrigger()).toHaveFocus()
    })

    it('goes Name, Type, Host, Port, Check interval with TCP', async () => {
      const { user } = setup()
      await user.tab()
      await user.keyboard('{ArrowRight}')
      expect(screen.getByRole('radio', { name: 'TCP port' })).toHaveFocus()
      await user.tab()
      expect(hostInput()).toHaveFocus()
      await user.tab()
      expect(portInput()).toHaveFocus()
      await user.tab()
      expect(screen.getByLabelText('Check interval')).toHaveFocus()
    })
  })
})

describe('the Public page group (FR-27, FR-68, NFR-4)', () => {
  const publicSwitch = () => screen.getByRole('switch', { name: 'Show on public page' })
  const legends = () => Array.from(document.querySelectorAll('legend.group__legend')).map((legend) => legend.textContent)

  it('is the last group, after Alerts and before the test panel, with the switch off and described', () => {
    setup()
    expect(legends().slice(-2)).toEqual(['Alerts', 'Public page'])
    const group = screen.getByRole('group', { name: 'Public page' })
    const panel = screen.getByRole('complementary', { name: 'Test check' })
    expect(group.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(publicSwitch()).toHaveAttribute('aria-checked', 'false')
    expect(publicSwitch()).toHaveAccessibleDescription(
      'Anyone can see its name, status and last check time. Hidden while paused.',
    )
  })

  it.each([
    ['untouched', false],
    ['turned on', true],
  ])('sends shown_on_public_view for the switch %s', async (_label, turnOn) => {
    vi.mocked(createService).mockResolvedValueOnce(makeService())
    const { user } = setup()
    await fill(user)
    if (turnOn) await user.click(publicSwitch())
    await user.click(saveButton())
    await marker()
    expect(sentInput().shown_on_public_view).toBe(turnOn)
  })

  it('sends false after the switch is turned on and off again', async () => {
    vi.mocked(createService).mockResolvedValueOnce(makeService())
    const { user } = setup()
    await fill(user)
    await user.click(publicSwitch())
    await user.click(publicSwitch())
    await user.click(saveButton())
    await marker()
    expect(sentInput().shown_on_public_view).toBe(false)
  })

  it('counts the switch on as changed (status, Cancel, unload prompt), and off again as unchanged', async () => {
    const { user } = setup()
    await user.click(publicSwitch())
    expect(footerStatus()).toHaveTextContent('Unsaved changes')
    expect(unloadPrompts()).toBe(true)
    await user.click(cancelButton())
    expect(await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    await user.click(backLink())
    expect(await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    await user.click(publicSwitch())
    expect(footerStatus()).toBeEmptyDOMElement()
    expect(unloadPrompts()).toBe(false)
    await user.click(cancelButton())
    expect(await marker()).toBeInTheDocument()
    expect(discardDialog()).not.toBeInTheDocument()
  })

  it('is disabled while a save is pending, and enabled again after a failure', async () => {
    const settle = pending()
    const { user } = setup()
    await fill(user)
    await user.click(publicSwitch())
    await user.click(saveButton())
    await waitFor(() => expect(publicSwitch()).toHaveAttribute('aria-disabled', 'true'))
    await act(async () => settle.reject(problem(500, 'internal_error')))
    await waitFor(() => expect(publicSwitch()).not.toHaveAttribute('aria-disabled', 'true'))
    expect(publicSwitch()).toHaveAttribute('aria-checked', 'true')
  })

  it('is reached by Tab after the Recovery message, then Run test, then Cancel, and Space toggles it', async () => {
    const { user } = setup()
    await user.click(screen.getByLabelText('Recovery message (optional)'))
    await user.tab()
    expect(publicSwitch()).toHaveFocus()
    await user.keyboard(' ')
    expect(publicSwitch()).toHaveAttribute('aria-checked', 'true')
    await user.keyboard(' ')
    expect(publicSwitch()).toHaveAttribute('aria-checked', 'false')
    await user.tab()
    expect(screen.getByRole('button', { name: 'Run test' })).toHaveFocus()
    await user.tab()
    expect(cancelButton()).toHaveFocus()
  })

  it('lists a 422 naming shown_on_public_view as plain text, with no link, no marked input and no text under the switch', async () => {
    const { user } = setup()
    vi.mocked(createService).mockRejectedValueOnce(
      validationProblem(fieldError('shown_on_public_view', 'Not a field here.')),
    )
    await fill(user)
    await user.click(publicSwitch())
    await user.click(saveButton())
    await waitFor(() => expect(saveButton()).toBeEnabled())
    const summary = screen.getByRole('alert')
    expect(summary).toHaveTextContent('shown_on_public_view: Not a field here.')
    expect(within(summary).queryByRole('link')).toBeNull()
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull()
    expect(document.querySelector('.error-text')).toBeNull()
    await user.click(publicSwitch())
    expect(publicSwitch()).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('alert')).toHaveTextContent('shown_on_public_view: Not a field here.')
  })

  it('keeps the switch on after a 422 on the name, and the retry sends true', async () => {
    vi.mocked(createService)
      .mockRejectedValueOnce(validationProblem(fieldError('name', 'Name refused.')))
      .mockResolvedValueOnce(makeService())
    const { user } = setup()
    await fill(user)
    await user.click(publicSwitch())
    await user.click(saveButton())
    await waitFor(() => expect(saveButton()).toBeEnabled())
    expect(publicSwitch()).toHaveAttribute('aria-checked', 'true')
    expect(vi.mocked(createService).mock.calls[0][0].shown_on_public_view).toBe(true)
    await user.click(saveButton())
    await marker()
    expect(vi.mocked(createService).mock.calls[1][0].shown_on_public_view).toBe(true)
  })

  it('shows the group on a TCP form, after Timing and Alerts, and sends its value with the TCP check', async () => {
    vi.mocked(createService).mockResolvedValueOnce(makeService())
    const { user } = setup()
    await user.type(nameInput(), 'DB')
    await user.click(screen.getByRole('radio', { name: 'TCP port' }))
    expect(legends()).toEqual(['Service', 'TCP port', 'Timing', 'Alerts', 'Public page'])
    await user.type(screen.getByLabelText('Host'), 'db.internal')
    await user.type(screen.getByLabelText('Port'), '5432')
    await user.click(publicSwitch())
    await user.click(saveButton())
    await marker()
    expect(sentInput().check).toStrictEqual({ type: 'tcp', host: 'db.internal', port: 5432 })
    expect(sentInput().shown_on_public_view).toBe(true)
  })
})
