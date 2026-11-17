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

type Settle = { resolve: (service: Service) => void; reject: (error: unknown) => void }
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
    expect(describedBy(urlInput())).toBe('Starts with http:// or https://.')
    expect(cancelButton()).toBeEnabled()
    expect(saveButton()).toBeEnabled()
    expect(saveButton()).toHaveTextContent('Save service')
    expect(footerStatus()).toBeEmptyDOMElement()
    expect(footerStatus()).toHaveAttribute('aria-live', 'polite')
    expect(bannerSlot()).toBeEmptyDOMElement()
    expect(bannerSlot()).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('has no counter, no Type control, no switch and no test button', () => {
    setup()
    expect(document.querySelector('.counter')).toBeNull()
    expect(screen.queryByText(/\d+\/\d+/)).not.toBeInTheDocument()
    expect(screen.queryByText('Type')).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Cancel', 'Save service'])
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
      check: { type: 'http', method: 'GET', url: URL_VALUE },
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
    expect(sentInput().check).toStrictEqual({ type: 'http', method: 'PATCH', url: URL_VALUE })
  })

  it('sends GET by default', async () => {
    vi.mocked(createService).mockResolvedValue(makeService())
    const { user } = setup()
    await fill(user)
    await user.click(saveButton())
    await marker()
    expect(sentInput().check).toStrictEqual({ type: 'http', method: 'GET', url: URL_VALUE })
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
    expect(describedBy(urlInput())).toBe('Starts with http:// or https://.')
  })

  it('does not check the scheme: a URL that is not http(s) is sent', async () => {
    vi.mocked(createService).mockRejectedValue(validationProblem(fieldError('check.url', 'Not http.')))
    const { user } = setup()
    await fill(user, 'Search API', 'ftp://files.example.com')
    await user.click(saveButton())
    await waitFor(() => expect(createService).toHaveBeenCalledTimes(1))
    expect(sentInput().check).toStrictEqual({ type: 'http', method: 'GET', url: 'ftp://files.example.com' })
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
    expect(within(summary).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
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
    expect(describedBy(urlInput())).toBe('Starts with http:// or https://.')
    const summary = screen.getByRole('alert')
    expect(summary).toHaveTextContent('2 fields need fixing before this can be saved.')
    expect(within(summary).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
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
    await failWith(user, validationProblem(fieldError('settings', 'The timing does not fit.', 'check_budget_exceeded')))
    const summary = screen.getByRole('alert')
    expect(summary).toHaveTextContent('1 field needs fixing before this can be saved.')
    expect(within(summary).getByRole('listitem')).toHaveTextContent('settings: The timing does not fit.')
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
    expect(banner).toHaveTextContent('Together its fields are over 1 MB. Shorten the name or the URL.')
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
    expect(sentInput(1)).toStrictEqual({ name: 'Search API', check: { type: 'http', method: 'GET', url: URL_VALUE } })

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
  ])('%s with a typed name opens the dialog with Keep editing focused; Keep editing closes it', async (_name, opener) => {
    const { user } = setup()
    await user.type(nameInput(), 'Search API')
    expect(footerStatus()).toHaveTextContent('Unsaved changes')
    await user.click(opener())
    const dialog = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    expect(dialog).toHaveTextContent('The changes to this service will be lost.')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus())
    expect(screen.queryByText('dashboard marker')).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(discardDialog()).not.toBeInTheDocument())
    expect(nameInput()).toHaveValue('Search API')
    expect(screen.queryByText('dashboard marker')).not.toBeInTheDocument()
    await waitFor(() => expect(opener()).toHaveFocus())
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
    const dialog = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
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
