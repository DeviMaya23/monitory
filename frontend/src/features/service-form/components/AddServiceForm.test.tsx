import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../components/ui/Toast'
import { createService, type Service } from '../../../lib/api/services'
import { fieldError, makeService, makeServiceList, problem, validationProblem } from '../../../test/fixtures'
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
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/services/new']}>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<p>dashboard marker</p>} />
            <Route path="/services/new" element={<AddServiceForm />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { client, user: userEvent.setup() }
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

  it('has no Type control and no test button', () => {
    setup()
    expect(screen.queryByText('Type')).not.toBeInTheDocument()
    // The only choice is the body's.
    expect(screen.getAllByRole('radiogroup')).toHaveLength(1)
    expect(screen.getByRole('radiogroup', { name: 'Body type' })).toBeInTheDocument()
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Add parameter',
      'Add header',
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
      check: { type: 'http', method: 'GET', url: URL_VALUE, query_params: [], headers: [] },
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
    await failWith(user, validationProblem(fieldError('check.type', 'The value is not allowed.')))
    const summary = screen.getByRole('alert')
    expect(summary).toHaveTextContent('1 field needs fixing before this can be saved.')
    expect(within(summary).getByRole('listitem')).toHaveTextContent('check.type: The value is not allowed.')
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
    const { user } = setup()
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
      check: { type: 'http', method: 'GET', url: URL_VALUE, query_params: [], headers: [] },
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
    expect(legends).toEqual(['Service', 'Request', 'Timing', 'Alerts'])
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
    expect(screen.getByText('Off')).toBeInTheDocument()
    await user.type(unhealthyArea(), '  down ')
    await user.type(recoveryArea(), '<b>x</b>')
    await user.click(saveButton())
    await marker()
    expect(sentInput()).toStrictEqual({
      name: 'Search API',
      check: { type: 'http', method: 'GET', url: URL_VALUE, query_params: [], headers: [] },
      alerts_enabled: false,
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
      await failWith(user, validationProblem(fieldError('check.type', 'Not on this screen.')))
      expect(within(screen.getByRole('alert')).queryByRole('link')).toBeNull()
      expect(screen.getByRole('alert')).toHaveTextContent('check.type: Not on this screen.')
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

  it('is reached by Tab in the order URL, the rows’ Add buttons, Body type, the four timing inputs, switch, Unhealthy message, Recovery message, Cancel, Save; Space toggles the switch', async () => {
    const { user } = setup()
    await user.click(urlInput())
    // Add parameter, Add header, the Body type choice, then the four timing inputs.
    for (let stop = 0; stop < 3 + 4; stop++) await user.tab()
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
    for (let stop = 0; stop < 3; stop++) await user.tab() // Add parameter, Add header, Body type
    for (const input of inputs()) {
      await user.tab()
      expect(input).toHaveFocus()
    }
    await user.tab()
    expect(alertsSwitch()).toHaveFocus()
  })
})
