import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appRoutes } from '../../../App'
import { ToastProvider } from '../../../components/ui/Toast'
import { setUnauthenticatedHandler } from '../../../lib/api/request'
import { listServices } from '../../../lib/api/services'
import { getSession } from '../../../lib/api/session'
import {
  createTarget,
  listTargets,
  testTarget,
  updateTarget,
  type Target,
  type TargetList,
  type TargetTestResult,
} from '../../../lib/api/targets'
import AlertListPage from '../../../pages/AlertListPage'
import {
  fieldError,
  makeEmailTarget,
  makeService,
  makeServiceList,
  makeTargetList,
  makeWebhookTarget,
  problem,
  sessionInfo,
  validationProblem,
} from '../../../test/fixtures'
import { renderRoutes } from '../../../test/renderRoutes'
import { ApiError } from '../../../lib/api/ApiError'

vi.mock('../../../lib/api/session')
vi.mock('../../../lib/api/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/services')>()),
  listServices: vi.fn(),
}))
vi.mock('../../../lib/api/targets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/targets')>()),
  listTargets: vi.fn(),
  deleteTarget: vi.fn(),
  createTarget: vi.fn(),
  updateTarget: vi.fn(),
  testTarget: vi.fn(),
}))
vi.mock('../../../lib/api/request', () => ({ setCsrfToken: vi.fn(), setUnauthenticatedHandler: vi.fn() }))

const service = makeService({ id: 's1', name: 'Search API' })
const mail = makeEmailTarget({ name: 'Ops mailbox', address: 'ops@example.com' })
const hook = makeWebhookTarget({
  name: 'Chat hook',
  url: 'https://hooks.example.com/alerts',
  headers: [
    { name: 'X-One', value: 'one' },
    { name: 'X-Two', value: 'two' },
  ],
})
const bare = makeWebhookTarget({ name: undefined, url: 'https://hooks.example.com/bare' })

function renderPage(queryClient = new QueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/services/s1/alerts']}>
          <Routes>
            <Route path="/services/:serviceId/alerts" element={<AlertListPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

async function shown(list: TargetList) {
  vi.mocked(listServices).mockResolvedValue(makeServiceList(service))
  vi.mocked(listTargets).mockResolvedValue(list)
  renderPage()
  if (list.length > 0) await screen.findByRole('list', { name: 'Notification targets' })
  else await screen.findByRole('heading', { name: 'No notification targets' })
}

type Settle = { resolve: (target: Target) => void; reject: (error: unknown) => void }
function pendingSave(which: typeof createTarget | typeof updateTarget = createTarget): Settle {
  const settle: Settle = { resolve: () => {}, reject: () => {} }
  vi.mocked(which).mockReturnValueOnce(
    new Promise<Target>((resolve, reject) => {
      settle.resolve = resolve
      settle.reject = reject
    }),
  )
  return settle
}

type TestSettle = { resolve: (result: TargetTestResult) => void; reject: (error: unknown) => void }
function pendingTest(): TestSettle {
  const settle: TestSettle = { resolve: () => {}, reject: () => {} }
  vi.mocked(testTarget).mockReturnValueOnce(
    new Promise<TargetTestResult>((resolve, reject) => {
      settle.resolve = resolve
      settle.reject = reject
    }),
  )
  return settle
}

const toastShown = async (text: string) => expect((await screen.findAllByText(text)).length).toBeGreaterThan(0)
const FORM_DIALOG = /^(Add|Edit) target$/
const dialog = (name: string | RegExp = 'Add target') => screen.getByRole('dialog', { name })
const inDialog = (name?: string) => within(dialog(name))
const primary = (name = 'Add target') => inDialog(name === 'Save target' ? 'Edit target' : 'Add target').getByRole('button', { name })
const nameInput = () => screen.getByRole('textbox', { name: 'Name (optional)' })
const addressInput = () => screen.getByLabelText('Email address')
const urlInput = () => screen.getByLabelText('Webhook URL')
const footAdd = () => within(document.querySelector('.list-foot') as HTMLElement).getByRole('button', { name: 'Add target' })
const editButton = (label: string) => screen.getByRole('button', { name: `Edit ${label}` })
const removeButton = (label: string) => screen.getByRole('button', { name: `Remove ${label}` })
const rowsText = () => screen.getAllByRole('listitem').map((li) => li.textContent)

async function openAddDialog() {
  await user.click(footAdd())
  await screen.findByRole('dialog', { name: 'Add target' })
}
async function openEditDialog(label: string) {
  await user.click(editButton(label))
  await screen.findByRole('dialog', { name: 'Edit target' })
}
async function chooseWebhook() {
  await user.click(screen.getByRole('radio', { name: 'Webhook' }))
}
/** Types a valid email target and submits it. */
async function fillEmail(address = 'new@example.com', name?: string) {
  if (name) await user.type(nameInput(), name)
  await user.type(addressInput(), address)
}
const submit = (name = 'Add target') => user.click(primary(name))

/** The backdrop is the dialog's outside. With the discard question open, the question's own layer is the outermost. */
function clickBackdrop(nested = false) {
  const layers = document.querySelectorAll('.dialog-layer')
  const backdrop = (nested ? layers[layers.length - 1] : document.querySelector('.dialog-backdrop')) as Element
  fireEvent.pointerDown(backdrop)
  fireEvent.mouseDown(backdrop)
  fireEvent.pointerUp(backdrop)
  fireEvent.mouseUp(backdrop)
  fireEvent.click(backdrop)
}

// One user per case, with no wait between its actions.
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup({ delay: null })
  vi.resetAllMocks()
  vi.mocked(listServices).mockResolvedValue(makeServiceList(service))
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('opening the add dialog', () => {
  it('shows the board’s form: Email chosen, Name focused, counter, label, no rows, footer, Close, the test row (FR-14, FR-80, FR-81)', async () => {
    await shown(makeTargetList(mail))
    await openAddDialog()
    expect(screen.getByRole('radio', { name: 'Email' })).toBeChecked()
    await waitFor(() => expect(nameInput()).toHaveFocus())
    expect(nameInput()).toHaveAttribute('maxlength', '50')
    expect(nameInput()).toHaveAttribute('placeholder', 'e.g. On-call inbox')
    expect(inDialog().getByText('0/50')).toBeInTheDocument()
    expect(addressInput()).toHaveAttribute('type', 'email')
    expect(screen.queryByLabelText('Webhook URL')).not.toBeInTheDocument()
    expect(screen.queryByText('Custom headers')).not.toBeInTheDocument()
    expect(inDialog().getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(primary()).toBeInTheDocument()
    expect(inDialog().getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(inDialog().getByRole('button', { name: 'Send test alert' })).toBeEnabled()
    expect(inDialog().getByText('Sends one alert to this target only, using the values above. Nothing is saved.')).toBeInTheDocument()
    expect(document.querySelector('.dialog--wide.dialog--sheet')).not.toBeNull()
  })

  it('counts the typed characters', async () => {
    await shown(makeTargetList(mail))
    await openAddDialog()
    await user.type(nameInput(), 'abcdefghijkl')
    expect(inDialog().getByText('12/50')).toBeInTheDocument()
  })

  it('opens from the empty state’s Add target as well', async () => {
    await shown([])
    await user.click(screen.getByRole('button', { name: 'Add target' }))
    expect(await screen.findByRole('dialog', { name: 'Add target' })).toBeInTheDocument()
  })

  it('opens Edit with the target’s values, type and headers, and the footer Save target', async () => {
    await shown(makeTargetList(mail, hook))
    await openEditDialog('Chat hook')
    expect(nameInput()).toHaveValue('Chat hook')
    expect(screen.getByRole('radio', { name: 'Webhook' })).toBeChecked()
    expect(urlInput()).toHaveValue('https://hooks.example.com/alerts')
    expect(screen.getByLabelText('Header 1 name')).toHaveValue('X-One')
    expect(screen.getByLabelText('Header 2 value')).toHaveValue('two')
    expect(primary('Save target')).toBeInTheDocument()
    expect(inDialog('Edit target').getByText('9/50')).toBeInTheDocument()
  })
})

describe('the form', () => {
  it('has a type radiogroup without a description', async () => {
    await shown(makeTargetList(mail))
    await openAddDialog()
    expect(screen.getByRole('radiogroup', { name: 'Type' })).not.toHaveAttribute('aria-describedby')
  })

  it('shows the webhook fields on Webhook, keeps what was typed per type, and sends only the active type’s fields', async () => {
    vi.mocked(createTarget).mockResolvedValue(makeWebhookTarget())
    await shown(makeTargetList(mail))
    await openAddDialog()
    await user.type(addressInput(), 'kept@example.com')
    await chooseWebhook()
    expect(addressInput).toThrow()
    expect(screen.getByText('Starts with http:// or https://.')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /Custom headers/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add header' })).toBeInTheDocument()
    await user.type(urlInput(), 'https://hook.example.com/x')
    await user.click(screen.getByRole('radio', { name: 'Email' }))
    expect(addressInput()).toHaveValue('kept@example.com')
    await chooseWebhook()
    expect(urlInput()).toHaveValue('https://hook.example.com/x')
    await submit()
    expect(createTarget).toHaveBeenCalledWith('s1', {
      type: 'webhook',
      name: '',
      url: 'https://hook.example.com/x',
      headers: [],
    })
  })

  it('sends an email as { type, name, address } with the name as typed, and nothing of the webhook', async () => {
    vi.mocked(createTarget).mockResolvedValue(makeEmailTarget())
    await shown(makeTargetList(mail))
    await openAddDialog()
    await chooseWebhook()
    await user.type(urlInput(), 'https://unsent.example.com')
    await user.click(screen.getByRole('button', { name: 'Add header' }))
    await user.click(screen.getByRole('radio', { name: 'Email' }))
    await fillEmail('a@example.com', ' Spaced ')
    await submit()
    expect(createTarget).toHaveBeenCalledOnce()
    expect(vi.mocked(createTarget).mock.calls[0][1]).toEqual({ type: 'email', name: ' Spaced ', address: 'a@example.com' })
  })

  it.each([
    ['http://x', true],
    ['  HTTP://x', true],
    ['https://x', false],
    ['http:/', false],
    ['', false],
  ])('the http:// warning for %j is %s, and saving is still sent (FR-100)', async (url, warns) => {
    vi.mocked(createTarget).mockResolvedValue(makeWebhookTarget())
    await shown(makeTargetList(mail))
    await openAddDialog()
    await chooseWebhook()
    if (url) await user.type(urlInput(), url)
    const warning = 'This URL uses http://, so the URL and headers are sent unencrypted. You can still save it.'
    if (warns) expect(screen.getByText(warning)).toBeInTheDocument()
    else expect(screen.queryByText(warning)).not.toBeInTheDocument()
    if (warns) {
      await submit()
      expect(createTarget).toHaveBeenCalledOnce()
    }
  })

  it('shows No custom headers. until a row is added', async () => {
    await shown(makeTargetList(mail))
    await openAddDialog()
    await chooseWebhook()
    expect(screen.getByText('No custom headers.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add header' }))
    expect(screen.queryByText('No custom headers.')).not.toBeInTheDocument()
  })

  it('adds a header row and focuses its name; names the inputs by number; renumbers and moves focus on removal; sends rows in order, empty ones too (FR-92)', async () => {
    vi.mocked(createTarget).mockResolvedValue(makeWebhookTarget())
    await shown(makeTargetList(mail))
    await openAddDialog()
    await chooseWebhook()
    await user.type(urlInput(), 'https://h.example.com')
    const add = screen.getByRole('button', { name: 'Add header' })
    await user.click(add)
    expect(screen.getByLabelText('Header 1 name')).toHaveFocus()
    await user.type(screen.getByLabelText('Header 1 name'), 'A')
    await user.click(add)
    await user.type(screen.getByLabelText('Header 2 name'), 'B')
    await user.type(screen.getByLabelText('Header 2 value'), 'two')
    await user.click(add)
    await user.type(screen.getByLabelText('Header 3 name'), 'C')
    // Removing row 2 of 3 renumbers the rest and focuses the next row's name input.
    await user.click(screen.getByRole('button', { name: 'Remove header 2' }))
    expect(screen.queryByLabelText('Header 3 name')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Header 2 name')).toHaveValue('C')
    expect(screen.getByLabelText('Header 2 name')).toHaveFocus()
    await user.click(add)
    await submit()
    expect(vi.mocked(createTarget).mock.calls[0][1]).toEqual({
      type: 'webhook',
      name: '',
      url: 'https://h.example.com',
      headers: [
        { name: 'A', value: '' },
        { name: 'C', value: '' },
        { name: '', value: '' },
      ],
    })
  })

  it('adds 21 header rows and offers each a Remove button: there is no limit (FR-92)', async () => {
    await shown(makeTargetList(mail))
    await openAddDialog()
    await chooseWebhook()
    const add = screen.getByRole('button', { name: 'Add header' })
    for (let i = 1; i <= 21; i++) fireEvent.click(add)
    expect(screen.getAllByRole('button', { name: /^Remove header/ })).toHaveLength(21)
    expect(screen.getByLabelText('Header 21 name')).toBeInTheDocument()
  })

  it('focuses the previous row when the last row goes, and Add header when the only row goes', async () => {
    await shown(makeTargetList(mail))
    await openAddDialog()
    await chooseWebhook()
    const add = screen.getByRole('button', { name: 'Add header' })
    await user.click(add)
    await user.click(add)
    await user.click(screen.getByRole('button', { name: 'Remove header 2' }))
    expect(screen.getByLabelText('Header 1 name')).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Remove header 1' }))
    expect(add).toHaveFocus()
  })

  it('shows names, addresses, URLs and header values as text, never as markup (NFR-7)', async () => {
    const markup = '<b>x</b>'
    const evil = makeWebhookTarget({
      name: markup,
      url: 'https://evil.example.com/?q=<b>x</b>',
      headers: [{ name: 'X', value: markup }],
    })
    const evilMail = makeEmailTarget({ name: undefined, address: `${markup}@example.com` })
    vi.mocked(updateTarget).mockResolvedValue(evil)
    await shown(makeTargetList(evil, evilMail))
    expect(editButton(markup)).toBeInTheDocument()
    expect(removeButton(markup)).toBeInTheDocument()
    expect(editButton(`${markup}@example.com`)).toBeInTheDocument()
    expect(screen.getByText('https://evil.example.com/?q=<b>x</b>')).toBeInTheDocument()
    await openEditDialog(markup)
    expect(nameInput()).toHaveValue(markup)
    expect(urlInput()).toHaveValue('https://evil.example.com/?q=<b>x</b>')
    expect(screen.getByLabelText('Header 1 value')).toHaveValue(markup)
    await submit('Save target')
    await toastShown('Target saved.')
    expect(document.querySelector('b')).toBeNull()
  })

  it('shows the client message on an empty or blank address or URL, sends nothing, focuses the field, and clears it on edit', async () => {
    await shown(makeTargetList(mail))
    await openAddDialog()
    await user.type(addressInput(), '   ')
    await submit()
    expect(await screen.findByText('Enter an email address.')).toBeInTheDocument()
    expect(addressInput()).toHaveFocus()
    expect(addressInput()).toHaveAttribute('aria-invalid', 'true')
    expect(createTarget).not.toHaveBeenCalled()
    await user.type(addressInput(), 'a')
    expect(screen.queryByText('Enter an email address.')).not.toBeInTheDocument()
    await user.clear(addressInput())
    await chooseWebhook()
    await submit()
    expect(await screen.findByText('Enter a URL that starts with http:// or https://.')).toBeInTheDocument()
    expect(urlInput()).toHaveFocus()
    expect(createTarget).not.toHaveBeenCalled()
    await user.type(urlInput(), 'h')
    expect(screen.queryByText('Enter a URL that starts with http:// or https://.')).not.toBeInTheDocument()
  })

  it('submits once on Enter in Name, and sends nothing on Enter while saving (NFR-4)', async () => {
    const settle = pendingSave()
    await shown(makeTargetList(mail))
    await openAddDialog()
    await user.type(addressInput(), 'a@example.com')
    await user.type(nameInput(), 'N{Enter}')
    await waitFor(() => expect(createTarget).toHaveBeenCalledOnce())
    await user.type(nameInput(), '{Enter}')
    fireEvent.submit(document.getElementById('target-form') as HTMLFormElement)
    expect(createTarget).toHaveBeenCalledOnce()
    await act(async () => settle.resolve(makeEmailTarget({ address: 'a@example.com' })))
  })
})

describe('opening while a removal question is open', () => {
  it.each(['add', 'edit'])('%s closes the question and sends nothing', async (which) => {
    await shown(makeTargetList(mail, bare))
    await user.click(removeButton('Ops mailbox'))
    expect(screen.getByText('Remove this target?')).toBeInTheDocument()
    if (which === 'add') await user.click(footAdd())
    else await user.click(editButton('https://hooks.example.com/bare'))
    await screen.findByRole('dialog')
    expect(screen.queryByText('Remove this target?')).not.toBeInTheDocument()
    expect(vi.mocked(listTargets)).toHaveBeenCalledOnce()
  })
})

describe('saving', () => {
  it('while pending: the button is disabled and busy with Saving…, the inputs are read-only, and Cancel, Close, Esc and the backdrop do nothing', async () => {
    const settle = pendingSave()
    await shown(makeTargetList(mail))
    await openAddDialog()
    await fillEmail()
    await submit()
    const button = await inDialog().findByRole('button', { name: 'Saving…' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelector('.spinner')).not.toBeNull()
    expect(nameInput()).toHaveAttribute('readonly')
    expect(addressInput()).toHaveAttribute('readonly')
    expect(inDialog().getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await user.click(inDialog().getByRole('button', { name: 'Close' }))
    await user.keyboard('{Escape}')
    clickBackdrop()
    expect(dialog()).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Discard unsaved changes?' })).not.toBeInTheDocument()
    expect(createTarget).toHaveBeenCalledOnce()
    await act(async () => settle.resolve(makeEmailTarget()))
  })

  it('201 closes, adds the row last with the new count, toasts, and returns focus to the footer’s Add target (FR-14)', async () => {
    const created = makeEmailTarget({ name: 'Fresh', address: 'fresh@example.com' })
    vi.mocked(createTarget).mockResolvedValue(created)
    await shown(makeTargetList(mail, bare))
    await openAddDialog()
    await fillEmail('fresh@example.com', 'Fresh')
    await submit()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument())
    expect(rowsText()[2]).toContain('Fresh')
    expect(screen.getByText('3 targets · in the order added')).toBeInTheDocument()
    await toastShown('Target added.')
    await waitFor(() => expect(footAdd()).toHaveFocus())
    expect(createTarget).toHaveBeenCalledWith('s1', { type: 'email', name: 'Fresh', address: 'fresh@example.com' })
    expect(listTargets).toHaveBeenCalledOnce()
  })

  it('201 from the empty state’s Add target focuses the new row’s Edit button, the opener being gone', async () => {
    vi.mocked(createTarget).mockResolvedValue(makeEmailTarget({ name: 'First', address: 'first@example.com' }))
    await shown([])
    await user.click(screen.getByRole('button', { name: 'Add target' }))
    await screen.findByRole('dialog')
    await fillEmail('first@example.com', 'First')
    await submit()
    await toastShown('Target added.')
    await waitFor(() => expect(editButton('First')).toHaveFocus())
  })

  it('200 closes, replaces the row in place, toasts and focuses that row’s Edit button; an emptied name sends "" and shows Unnamed (FR-15, FR-80)', async () => {
    const saved = makeEmailTarget({ ...mail, name: undefined })
    vi.mocked(updateTarget).mockResolvedValue(saved)
    await shown(makeTargetList(mail, bare))
    await openEditDialog('Ops mailbox')
    await user.clear(nameInput())
    await submit('Save target')
    await toastShown('Target saved.')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument())
    expect(updateTarget).toHaveBeenCalledWith('s1', mail.id, { type: 'email', name: '', address: 'ops@example.com' })
    expect(rowsText()[0]).toContain('Unnamed email')
    expect(rowsText()).toHaveLength(2)
    await waitFor(() => expect(editButton('ops@example.com')).toHaveFocus())
  })

  it('sends a changed type on edit with the other type’s fields left out', async () => {
    vi.mocked(updateTarget).mockResolvedValue(makeWebhookTarget({ ...bare }))
    await shown(makeTargetList(mail))
    await openEditDialog('Ops mailbox')
    await chooseWebhook()
    await user.type(urlInput(), 'https://swap.example.com')
    await submit('Save target')
    await toastShown('Target saved.')
    expect(vi.mocked(updateTarget).mock.calls[0][2]).toEqual({
      type: 'webhook',
      name: 'Ops mailbox',
      url: 'https://swap.example.com',
      headers: [],
    })
  })

  it('leaves the dialog’s values alone when the list is refreshed with other values for the edited target', async () => {
    const queryClient = new QueryClient()
    vi.mocked(listTargets).mockResolvedValue(makeTargetList(mail))
    renderPage(queryClient)
    await screen.findByRole('list', { name: 'Notification targets' })
    await openEditDialog('Ops mailbox')
    await user.type(nameInput(), ' x')
    act(() => {
      queryClient.setQueryData(['alert-targets', 's1'], [{ ...mail, name: 'Changed elsewhere' }])
    })
    expect(await screen.findByText('Changed elsewhere')).toBeInTheDocument()
    expect(nameInput()).toHaveValue('Ops mailbox x')
    expect(dialog('Edit target')).toBeInTheDocument()
  })
})

describe('failures', () => {
  it('422 shows the summary with the count and each message, focuses it, and shows each field’s message (FR-82, FR-87, FR-89, FR-110, FR-92)', async () => {
    vi.mocked(createTarget).mockRejectedValue(
      validationProblem(
        fieldError('name', 'Name is too long.'),
        fieldError('url', 'Not a URL.'),
        fieldError('headers[0].name', 'Header name is empty.'),
        fieldError('headers[0].name', 'Second message.'),
        fieldError('type', 'Unknown type.'),
      ),
    )
    await shown(makeTargetList(mail))
    await openAddDialog()
    await chooseWebhook()
    await user.type(urlInput(), 'nope')
    await user.click(screen.getByRole('button', { name: 'Add header' }))
    await submit()
    const summary = await inDialog().findByRole('alert')
    expect(summary).toHaveTextContent('5 fields need fixing before this can be saved.')
    await waitFor(() => expect(summary).toHaveFocus())
    expect(summary).toHaveAttribute('tabindex', '-1')
    expect(within(summary).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Name: Name is too long.',
      'Webhook URL: Not a URL.',
      'Header 1 name: Header name is empty.',
      'Header 1 name: Second message.',
      'type: Unknown type.',
    ])
    expect(within(summary).getAllByRole('link')).toHaveLength(4)
    expect(within(summary).queryByRole('link', { name: /type/ })).not.toBeInTheDocument()
    // Each field shows its (first) message, linked by aria-describedby.
    expect(urlInput()).toHaveAttribute('aria-invalid', 'true')
    expect(urlInput()).toHaveAccessibleDescription('Not a URL.')
    expect(screen.getByLabelText('Header 1 name')).toHaveAccessibleDescription('Header name is empty.')
    expect(nameInput()).toHaveAccessibleDescription('Name is too long.')
    // A link moves focus to its input.
    await user.click(within(summary).getByRole('link', { name: 'Webhook URL: Not a URL.' }))
    expect(urlInput()).toHaveFocus()
    // Editing a field clears its message and its entry.
    await user.type(urlInput(), 'x')
    expect(screen.queryByText('Not a URL.')).not.toBeInTheDocument()
    expect(summary).toHaveTextContent('4 fields need fixing')
    // Removing a header row clears the header errors.
    await user.click(screen.getByRole('button', { name: 'Remove header 1' }))
    expect(screen.queryByText('Header name is empty.')).not.toBeInTheDocument()
    expect(within(summary).queryByText(/Header 1 name/)).not.toBeInTheDocument()
    expect(summary).toHaveTextContent('2 fields need fixing')
  })

  describe('switching the type after a 422', () => {
    const rejectWith = (...errors: ReturnType<typeof fieldError>[]) =>
      vi.mocked(createTarget).mockRejectedValue(validationProblem(...errors))
    const emailRadio = () => screen.getByRole('radio', { name: 'Email' })

    it('Email drops the Webhook URL and header entries, keeps Name, retitles, and leaves focus on the radio', async () => {
      rejectWith(fieldError('name', 'Name is too long.'), fieldError('url', 'Not a URL.'), fieldError('headers[0].value', 'Too long.'))
      await shown(makeTargetList(mail))
      await openAddDialog()
      await chooseWebhook()
      await user.type(urlInput(), 'nope')
      await user.click(screen.getByRole('button', { name: 'Add header' }))
      await submit()
      const summary = await inDialog().findByRole('alert')
      expect(summary).toHaveTextContent('3 fields need fixing before this can be saved.')
      await user.click(emailRadio())
      expect(summary).toHaveTextContent('1 field needs fixing before this can be saved.')
      expect(summary).toHaveTextContent('Name: Name is too long.')
      expect(screen.queryByText(/Webhook URL/)).not.toBeInTheDocument()
      expect(screen.queryByText(/Custom headers|Header 1 value/)).not.toBeInTheDocument()
      expect(emailRadio()).toHaveFocus()
      expect(nameInput()).toHaveAccessibleDescription('Name is too long.')
    })

    it('Webhook drops the address entry and keeps Name', async () => {
      rejectWith(fieldError('name', 'Name is too long.'), fieldError('address', 'Not an address.'))
      await shown(makeTargetList(mail))
      await openAddDialog()
      await fillEmail('bad')
      await submit()
      const summary = await inDialog().findByRole('alert')
      await chooseWebhook()
      expect(summary).toHaveTextContent('1 field needs fixing')
      expect(summary).toHaveTextContent('Name: Name is too long.')
      expect(summary).not.toHaveTextContent('Email address')
      expect(screen.getByRole('radio', { name: 'Webhook' })).toHaveFocus()
    })

    it('removes the whole summary when only the other type’s entries were left, and does not bring them back', async () => {
      rejectWith(fieldError('address', 'Not an address.'))
      await shown(makeTargetList(mail))
      await openAddDialog()
      await fillEmail('bad')
      await submit()
      await inDialog().findByRole('alert')
      await chooseWebhook()
      expect(inDialog().queryByRole('alert')).not.toBeInTheDocument()
      await user.click(emailRadio())
      expect(inDialog().queryByRole('alert')).not.toBeInTheDocument()
      expect(addressInput()).not.toHaveAccessibleDescription('Not an address.')
    })
  })

  it('a single error is titled in the singular', async () => {
    vi.mocked(createTarget).mockRejectedValue(validationProblem(fieldError('address', 'Not an address.')))
    await shown(makeTargetList(mail))
    await openAddDialog()
    await fillEmail('bad')
    await submit()
    expect(await inDialog().findByText('1 field needs fixing before this can be saved.')).toBeInTheDocument()
    expect(addressInput()).toHaveAccessibleDescription('Not an address.')
  })

  it('a 422 with the path headers shows it in the summary and under the rows; Add header clears it; removing a row clears every header error', async () => {
    vi.mocked(createTarget).mockRejectedValue(
      validationProblem(fieldError('headers', 'At most 2 headers.', 'too_many'), fieldError('headers[1].value', 'Too long.')),
    )
    await shown(makeTargetList(mail))
    await openAddDialog()
    await chooseWebhook()
    await user.type(urlInput(), 'https://h.example.com')
    const add = screen.getByRole('button', { name: 'Add header' })
    await user.click(add)
    await user.click(add)
    await user.click(add)
    await submit()
    const summary = await inDialog().findByRole('alert')
    expect(summary).toHaveTextContent('Custom headers: At most 2 headers.')
    expect(within(summary).queryByRole('link', { name: /Custom headers/ })).not.toBeInTheDocument()
    expect(document.querySelectorAll('p.error-text')).toHaveLength(2)
    await user.click(add)
    expect(summary).not.toHaveTextContent('Custom headers')
    expect(summary).toHaveTextContent('Header 2 value: Too long.')
    await user.click(screen.getByRole('button', { name: 'Remove header 4' }))
    await waitFor(() => expect(screen.queryByText('Too long.')).not.toBeInTheDocument())
  })

  it.each([
    ['email', 'This address is already in this service’s alert list.'],
    ['webhook', 'This URL is already in this service’s alert list.'],
  ])('409 target_duplicate on an add of %s shows the message on its field, focuses it, no banner; editing clears it (FR-88)', async (type, message) => {
    vi.mocked(createTarget).mockRejectedValue(problem(409, 'target_duplicate'))
    await shown(makeTargetList(mail))
    await openAddDialog()
    if (type === 'email') await fillEmail('ops@example.com')
    else {
      await chooseWebhook()
      await user.type(urlInput(), 'https://hooks.example.com/alerts')
    }
    await submit()
    expect(await screen.findByText(message)).toBeInTheDocument()
    const field = type === 'email' ? addressInput() : urlInput()
    await waitFor(() => expect(field).toHaveFocus())
    expect(field).toHaveAccessibleDescription(message)
    expect(inDialog().queryByRole('alert')).not.toBeInTheDocument()
    await user.type(field, 'x')
    expect(screen.queryByText(message)).not.toBeInTheDocument()
  })

  it('409 target_duplicate on an edit shows the message on the address field', async () => {
    vi.mocked(updateTarget).mockRejectedValue(problem(409, 'target_duplicate'))
    await shown(makeTargetList(mail, makeEmailTarget({ address: 'other@example.com', name: 'Other' })))
    await openEditDialog('Other')
    await user.clear(addressInput())
    await user.type(addressInput(), 'ops@example.com')
    await submit('Save target')
    expect(await screen.findByText('This address is already in this service’s alert list.')).toBeInTheDocument()
    await waitFor(() => expect(addressInput()).toHaveFocus())
  })

  it('409 alert_list_full shows the banner, focuses the primary button, and keeps the values and the dialog (FR-19)', async () => {
    vi.mocked(createTarget).mockRejectedValue(problem(409, 'alert_list_full'))
    await shown(makeTargetList(mail))
    await openAddDialog()
    await fillEmail('a@example.com', 'Keep me')
    await submit()
    expect(await inDialog().findByText('This alert list is full.')).toBeInTheDocument()
    expect(inDialog().getByText('Remove a target before adding another.')).toBeInTheDocument()
    await waitFor(() => expect(primary()).toHaveFocus())
    expect(nameInput()).toHaveValue('Keep me')
    expect(addressInput()).toHaveValue('a@example.com')
  })

  it('404 on an add closes the dialog and fetches the list again; a 404 there shows service not found with its heading focused', async () => {
    vi.mocked(createTarget).mockRejectedValue(problem(404, 'not_found'))
    await shown(makeTargetList(mail))
    vi.mocked(listTargets).mockRejectedValueOnce(problem(404, 'not_found'))
    await openAddDialog()
    await fillEmail()
    await submit()
    const heading = await screen.findByRole('heading', { name: 'This service no longer exists' })
    expect(listTargets).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument()
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('404 on an add whose service remains closes the dialog, fetches again and focuses the opener', async () => {
    vi.mocked(createTarget).mockRejectedValue(problem(404, 'not_found'))
    await shown(makeTargetList(mail))
    await openAddDialog()
    await fillEmail()
    await submit()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument())
    expect(listTargets).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(footAdd()).toHaveFocus())
  })

  it('404 on an edit shows the banner with Close and refresh, keeps Save target enabled; the button closes, fetches again and focuses the row’s Edit button', async () => {
    vi.mocked(updateTarget).mockRejectedValue(problem(404, 'not_found'))
    await shown(makeTargetList(mail, bare))
    await openEditDialog('Ops mailbox')
    await submit('Save target')
    expect(await inDialog('Edit target').findByText('This target no longer exists.')).toBeInTheDocument()
    expect(inDialog('Edit target').getByText('It was removed, perhaps in another tab.')).toBeInTheDocument()
    const refresh = inDialog('Edit target').getByRole('button', { name: 'Close and refresh' })
    await waitFor(() => expect(refresh).toHaveFocus())
    expect(primary('Save target')).toBeEnabled()
    await user.click(refresh)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument())
    expect(listTargets).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(editButton('Ops mailbox')).toHaveFocus())
  })

  it('403 csrf_failed shows the banner with Reload, which reloads once (NFR-8)', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    vi.mocked(createTarget).mockRejectedValue(problem(403, 'csrf_failed'))
    await shown(makeTargetList(mail))
    await openAddDialog()
    await fillEmail()
    await submit()
    expect(await inDialog().findByText('The request wasn’t accepted.')).toBeInTheDocument()
    expect(inDialog().getByText('Reload the page and try again.')).toBeInTheDocument()
    await waitFor(() => expect(primary()).toHaveFocus())
    await user.click(inDialog().getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })

  it.each([
    ['a 500', problem(500, 'internal_error')],
    ['a network error', new TypeError('Failed to fetch')],
  ])('%s shows Something went wrong. with Try again, which sends again with the values still there (NFR-8)', async (_name, error) => {
    vi.mocked(createTarget).mockRejectedValueOnce(error).mockResolvedValueOnce(makeEmailTarget({ address: 'a@example.com' }))
    await shown(makeTargetList(mail))
    await openAddDialog()
    await fillEmail('a@example.com', 'Keep')
    await submit()
    expect(await inDialog().findByText('Something went wrong.')).toBeInTheDocument()
    expect(inDialog().getByText('The server couldn’t be reached or returned an error. Your values are still here.')).toBeInTheDocument()
    await waitFor(() => expect(primary()).toHaveFocus())
    expect(nameInput()).toHaveValue('Keep')
    await user.click(inDialog().getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(createTarget).toHaveBeenCalledTimes(2))
    await toastShown('Target added.')
  })

  it.each([
    ['a 409 with another code', problem(409, 'service_name_taken')],
    ['a 422 with no errors', problem(422, 'validation_failed')],
    ['a 404 with no problem body', new ApiError(404, null, null)],
  ])('%s shows Something went wrong.', async (_name, error) => {
    vi.mocked(createTarget).mockRejectedValue(error)
    await shown(makeTargetList(mail))
    await openAddDialog()
    await fillEmail()
    await submit()
    expect(await inDialog().findByText('Something went wrong.')).toBeInTheDocument()
  })

  it('alert_list_full on an edit shows Something went wrong.', async () => {
    vi.mocked(updateTarget).mockRejectedValue(problem(409, 'alert_list_full'))
    await shown(makeTargetList(mail))
    await openEditDialog('Ops mailbox')
    await submit('Save target')
    expect(await inDialog('Edit target').findByText('Something went wrong.')).toBeInTheDocument()
    expect(screen.queryByText('This alert list is full.')).not.toBeInTheDocument()
  })

  it('the next submit clears the previous banner and summary, and a second failure replaces the first', async () => {
    vi.mocked(createTarget)
      .mockRejectedValueOnce(validationProblem(fieldError('address', 'Not an address.')))
      .mockRejectedValueOnce(problem(500, 'internal_error'))
    await shown(makeTargetList(mail))
    await openAddDialog()
    await fillEmail('bad')
    await submit()
    expect(await inDialog().findByText('1 field needs fixing before this can be saved.')).toBeInTheDocument()
    await submit()
    expect(await inDialog().findByText('Something went wrong.')).toBeInTheDocument()
    expect(screen.queryByText('1 field needs fixing before this can be saved.')).not.toBeInTheDocument()
    expect(inDialog().getAllByRole('alert')).toHaveLength(1)
  })

  it('a 401 shows the sign-in form through the shell, with no toast and no banner', async () => {
    vi.mocked(getSession).mockResolvedValue(sessionInfo)
    vi.mocked(listTargets).mockResolvedValue(makeTargetList(mail))
    vi.mocked(createTarget).mockImplementationOnce(() => {
      const handler = vi.mocked(setUnauthenticatedHandler).mock.calls.filter(([h]) => h !== null).at(-1)?.[0]
      handler?.()
      return Promise.reject(problem(401, 'unauthenticated'))
    })
    renderRoutes(appRoutes, { initialEntries: ['/services/s1/alerts'] })
    await screen.findByRole('list', { name: 'Notification targets' })
    await openAddDialog()
    await fillEmail()
    await submit()
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument()
    expect(screen.queryByText('Target added.')).not.toBeInTheDocument()
  })
})

describe('leaving without saving', () => {
  it.each(['Cancel', 'Close', 'Esc', 'the backdrop'])('an unchanged add dialog closes at once on %s and focus returns to Add target', async (how) => {
    await shown(makeTargetList(mail))
    await openAddDialog()
    if (how === 'Cancel' || how === 'Close') await user.click(inDialog().getByRole('button', { name: how }))
    else if (how === 'Esc') await user.keyboard('{Escape}')
    else clickBackdrop()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument())
    await waitFor(() => expect(footAdd()).toHaveFocus())
    expect(createTarget).not.toHaveBeenCalled()
  })

  it('a changed one asks first with focus on Keep editing; Keep editing, Esc and the backdrop return to the form with its values', async () => {
    await shown(makeTargetList(mail))
    await openAddDialog()
    await fillEmail('a@example.com', 'Typed')
    await user.click(inDialog().getByRole('button', { name: 'Cancel' }))
    const question = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    expect(within(question).getByText('The changes to this target will be lost.')).toBeInTheDocument()
    await waitFor(() => expect(within(question).getByRole('button', { name: 'Keep editing' })).toHaveFocus())
    await user.click(within(question).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard unsaved changes?' })).not.toBeInTheDocument())
    expect(nameInput()).toHaveValue('Typed')

    // Esc on the open question closes only the question.
    await user.click(inDialog().getByRole('button', { name: 'Close' }))
    await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard unsaved changes?' })).not.toBeInTheDocument())
    expect(dialog()).toBeInTheDocument()
    expect(addressInput()).toHaveValue('a@example.com')

    // The backdrop of the question too.
    await user.keyboard('{Escape}')
    await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    clickBackdrop(true)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard unsaved changes?' })).not.toBeInTheDocument())
    expect(dialog()).toBeInTheDocument()
    expect(nameInput()).toHaveValue('Typed')
  })

  it('Discard changes closes both and sends nothing', async () => {
    await shown(makeTargetList(mail))
    await openAddDialog()
    await fillEmail('a@example.com')
    await user.keyboard('{Escape}')
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument())
    expect(createTarget).not.toHaveBeenCalled()
    await waitFor(() => expect(footAdd()).toHaveFocus())
  })

  it('an edit dialog returns focus to its row’s Edit button, and an edit put back to its originals is unchanged again', async () => {
    await shown(makeTargetList(mail, bare))
    await openEditDialog('Ops mailbox')
    await user.type(nameInput(), 'x')
    await user.type(nameInput(), '{Backspace}')
    await user.click(inDialog('Edit target').getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument())
    expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument()
    await waitFor(() => expect(editButton('Ops mailbox')).toHaveFocus())
  })

  it('asks the browser before the tab closes only while the form is changed', async () => {
    await shown(makeTargetList(mail))
    await openAddDialog()
    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(unload()).toBe(false)
    await user.type(nameInput(), 'x')
    expect(unload()).toBe(true)
    await user.keyboard('{Escape}')
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument())
    expect(unload()).toBe(false)
  })
})

describe('limits and odd input', () => {
  it.each([
    [50, 50],
    [51, 50],
  ])('a pasted name of %i characters keeps %i, and the counter agrees', async (pasted, kept) => {
    vi.mocked(createTarget).mockResolvedValue(makeEmailTarget())
    await shown(makeTargetList(mail))
    await openAddDialog()
    await user.click(nameInput())
    await user.paste('n'.repeat(pasted))
    expect(nameInput()).toHaveValue('n'.repeat(kept))
    expect(screen.getByText(`${kept}/50`)).toBeInTheDocument()
    await user.type(addressInput(), 'a@example.com')
    await submit()
    expect(vi.mocked(createTarget).mock.calls[0][1]).toEqual({ type: 'email', name: 'n'.repeat(kept), address: 'a@example.com' })
  })

  it('sends a 2,049-character URL and an address with inner spaces as typed: the length is the server’s to refuse', async () => {
    vi.mocked(createTarget).mockResolvedValue(makeEmailTarget())
    await shown(makeTargetList(mail))
    await openAddDialog()
    await user.click(addressInput())
    await user.paste('a b@example.com')
    await submit()
    expect(vi.mocked(createTarget).mock.calls[0][1]).toEqual({ type: 'email', name: '', address: 'a b@example.com' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument())
    await openAddDialog()
    await chooseWebhook()
    const url = `https://h.example.com/${'p'.repeat(2049 - 'https://h.example.com/'.length)}`
    await user.click(urlInput())
    await user.paste(url)
    await submit()
    const sent = vi.mocked(createTarget).mock.calls[1][1]
    expect(sent.type === 'webhook' && sent.url.length).toBe(2049)
  })

  it('two submits in the same tick send one request', async () => {
    pendingSave()
    await shown(makeTargetList(mail))
    await openAddDialog()
    await fillEmail()
    const form = document.getElementById('target-form') as HTMLFormElement
    fireEvent.submit(form)
    fireEvent.submit(form)
    await waitFor(() => expect(createTarget).toHaveBeenCalledOnce())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(createTarget).toHaveBeenCalledOnce()
  })

  it('a submit that fails the client check drops the previous failure banner', async () => {
    vi.mocked(createTarget).mockRejectedValue(problem(500, 'internal_error'))
    await shown(makeTargetList(mail))
    await openAddDialog()
    await fillEmail('a@example.com')
    await submit()
    expect(await inDialog().findByText('Something went wrong.')).toBeInTheDocument()
    await user.clear(addressInput())
    await submit()
    expect(await screen.findByText('Enter an email address.')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument()
    expect(createTarget).toHaveBeenCalledOnce()
  })

  it('409 target_duplicate on an edit of a webhook shows the URL message and focuses the URL field', async () => {
    vi.mocked(updateTarget).mockRejectedValue(problem(409, 'target_duplicate'))
    await shown(makeTargetList(mail, hook))
    await openEditDialog('Chat hook')
    await submit('Save target')
    expect(await screen.findByText('This URL is already in this service’s alert list.')).toBeInTheDocument()
    await waitFor(() => expect(urlInput()).toHaveFocus())
    expect(inDialog('Edit target').queryByText('Something went wrong.')).not.toBeInTheDocument()
  })
})

describe('the test row', () => {
  const inForm = () => within(screen.getByRole('dialog', { name: FORM_DIALOG }))
  const testButton = () => inForm().getByRole('button', { name: /^(Send test alert|Sending…)$/ })
  const press = () => user.click(testButton())
  const HINT = 'Sends one alert to this target only, using the values above. Nothing is saved.'
  const delivered: TargetTestResult = { delivered: true }
  const failed: TargetTestResult = { delivered: false, failure_reason: 'no SMTP account configured' }
  const form = () => document.getElementById('target-form') as HTMLElement
  const noSideEffects = () => {
    expect(createTarget).not.toHaveBeenCalled()
    expect(updateTarget).not.toHaveBeenCalled()
    expect(listTargets).toHaveBeenCalledTimes(1)
  }

  it.each([
    ['an email add', async () => openAddDialog()],
    ['a webhook add', async () => { await openAddDialog(); await chooseWebhook(); await user.click(inForm().getByRole('button', { name: 'Add header' })) }],
    ['an email edit', async () => openEditDialog('Ops mailbox')],
    ['a webhook edit', async () => openEditDialog('Chat hook')],
  ])('is the last element of the form’s body in %s (FR-107)', async (_name, open) => {
    await shown(makeTargetList(mail, hook))
    await open()
    const last = form().lastElementChild as HTMLElement
    expect(last).toHaveClass('test-row')
    expect(within(last).getByRole('button', { name: 'Send test alert' })).toBeInTheDocument()
    expect(form().querySelectorAll('.test-row')).toHaveLength(1)
  })

  it('comes after the header rows and the warning for a webhook', async () => {
    await shown(makeTargetList(hook))
    await openEditDialog('Chat hook')
    const children = [...form().children]
    const row = children.findIndex((c) => c.classList.contains('test-row'))
    expect(row).toBe(children.length - 1)
    expect(children.findIndex((c) => c.contains(screen.getByLabelText('Header 2 value')))).toBeLessThan(row)
  })

  it('is reached by Tab after the last field, and works with Enter and Space (NFR-4)', async () => {
    vi.mocked(testTarget).mockResolvedValue(delivered)
    await shown(makeTargetList(mail))
    await openAddDialog()
    await user.click(addressInput())
    await user.type(addressInput(), 'a@example.com')
    await user.tab()
    expect(testButton()).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(testTarget).toHaveBeenCalledTimes(1))
    await user.keyboard(' ')
    await waitFor(() => expect(testTarget).toHaveBeenCalledTimes(2))
    await user.tab()
    expect(inForm().getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('sends the email as typed through testTarget, with a pending state, then shows Delivered. and keeps focus (FR-107)', async () => {
    const answer = pendingTest()
    await shown(makeTargetList(mail))
    await openAddDialog()
    await user.type(addressInput(), 'a@example.com')
    await press()
    expect(testTarget).toHaveBeenCalledOnce()
    expect(testTarget).toHaveBeenCalledWith('s1', { type: 'email', name: '', address: 'a@example.com' })
    const button = testButton()
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveTextContent('Sending…')
    expect(inForm().getByText('Sending one test alert…')).toBeInTheDocument()
    await user.click(button)
    expect(testTarget).toHaveBeenCalledOnce()
    // The form stays editable and the footer's button enabled.
    expect(addressInput()).not.toHaveAttribute('readonly')
    await user.type(nameInput(), 'Ops')
    await user.clear(nameInput())
    expect(primary()).toBeEnabled()
    await act(async () => answer.resolve(delivered))
    expect(await inForm().findByText('Delivered.')).toBeInTheDocument()
    expect(testButton()).toHaveTextContent('Send test alert')
  })

  it('shows Failed: and the reason for a failed result', async () => {
    vi.mocked(testTarget).mockResolvedValue(failed)
    await shown(makeTargetList(mail))
    await openAddDialog()
    await fillEmail()
    await press()
    expect(await inForm().findByText('no SMTP account configured')).toBeInTheDocument()
    expect(inForm().getByText(/^Failed:/)).toBeInTheDocument()
    expect(testButton()).toHaveFocus()
  })

  it('sends a webhook as { type, name, url, headers } with the rows in order, and nothing of the email', async () => {
    vi.mocked(testTarget).mockResolvedValue(delivered)
    await shown(makeTargetList(mail, hook))
    await openAddDialog()
    await user.type(addressInput(), 'left@example.com')
    await chooseWebhook()
    await user.type(nameInput(), 'Hook')
    await user.type(urlInput(), 'https://x.example.com')
    await user.click(inForm().getByRole('button', { name: 'Add header' }))
    await user.type(screen.getByLabelText('Header 1 name'), 'A')
    await user.type(screen.getByLabelText('Header 1 value'), '1')
    await user.click(inForm().getByRole('button', { name: 'Add header' }))
    await user.type(screen.getByLabelText('Header 2 name'), 'B')
    await press()
    expect(testTarget).toHaveBeenCalledWith('s1', {
      type: 'webhook',
      name: 'Hook',
      url: 'https://x.example.com',
      headers: [
        { name: 'A', value: '1' },
        { name: 'B', value: '' },
      ],
    })
  })

  it('sends headers: [] with no rows', async () => {
    vi.mocked(testTarget).mockResolvedValue(delivered)
    await shown(makeTargetList(mail))
    await openAddDialog()
    await chooseWebhook()
    await user.type(urlInput(), 'https://x.example.com')
    await press()
    expect(testTarget).toHaveBeenCalledWith('s1', { type: 'webhook', name: '', url: 'https://x.example.com', headers: [] })
  })

  it.each([
    ['email', 'Enter an email address.', addressInput, async () => {}],
    ['webhook', 'Enter a URL that starts with http:// or https://.', urlInput, chooseWebhook],
  ])('a blank %s contact shows the save’s message, focuses the field, sends nothing and clears on edit (FR-108)', async (_t, message, field, prepare) => {
    await shown(makeTargetList(mail))
    await openAddDialog()
    await prepare()
    await user.type(field(), '   ')
    await press()
    expect(await inForm().findByText(message)).toBeInTheDocument()
    expect(field()).toHaveFocus()
    expect(testTarget).not.toHaveBeenCalled()
    await user.type(field(), 'x')
    expect(screen.queryByText(message)).not.toBeInTheDocument()
  })

  it('a blank Name and empty header rows do not stop the test', async () => {
    vi.mocked(testTarget).mockResolvedValue(delivered)
    await shown(makeTargetList(mail))
    await openAddDialog()
    await chooseWebhook()
    await user.type(urlInput(), 'https://x.example.com')
    await user.click(inForm().getByRole('button', { name: 'Add header' }))
    await press()
    expect(testTarget).toHaveBeenCalledOnce()
  })

  it('saves nothing: no create, update, list fetch or toast, and the form, footer and leave guard behave as before (FR-108)', async () => {
    vi.mocked(testTarget).mockResolvedValueOnce(delivered).mockResolvedValueOnce(failed)
    await shown(makeTargetList(mail))
    const before = rowsText()
    await openAddDialog()
    await press()
    // An untouched form with a blank contact does not send; fill and test twice.
    await user.type(addressInput(), 'a@example.com')
    await press()
    await inForm().findByText('Delivered.')
    await press()
    await inForm().findByText(/^Failed:/)
    noSideEffects()
    expect(document.querySelector('.toast, [data-toast]')).toBeNull()
    expect(primary()).toBeEnabled()
    expect(addressInput()).toHaveValue('a@example.com')
    await user.click(inForm().getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument())
    expect(rowsText()).toEqual(before)
  })

  it('leaves an untouched form closable at once after a test', async () => {
    vi.mocked(testTarget).mockResolvedValue(delivered)
    await shown(makeTargetList(mail))
    await openEditDialog('Ops mailbox')
    await press()
    await inForm().findByText('Delivered.')
    await user.click(inForm().getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument())
    noSideEffects()
  })

  it('does not block Cancel, Close or Esc while testing: they open the discard question for a changed form, and close an untouched one', async () => {
    pendingTest()
    pendingTest()
    await shown(makeTargetList(mail))
    await openAddDialog()
    await user.type(addressInput(), 'a@example.com')
    await press()
    await user.click(inForm().getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    await user.click(inForm().getByRole('button', { name: 'Close' }))
    expect(await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    await user.keyboard('{Escape}')
    expect(await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument())
  })

  it('closes an untouched edit form at once on Cancel while a test is pending', async () => {
    pendingTest()
    await shown(makeTargetList(mail))
    await openEditDialog('Ops mailbox')
    await press()
    expect(testButton()).toHaveAttribute('aria-busy', 'true')
    await user.click(inForm().getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument())
  })

  describe('the result and the values', () => {
    it.each([
      ['the name', async () => user.type(nameInput(), 'x'), async () => user.clear(nameInput())],
      ['the contact', async () => user.type(addressInput(), 'x'), async () => user.type(addressInput(), '{Backspace}')],
      [
        'the type',
        async () => user.click(screen.getByRole('radio', { name: 'Webhook' })),
        async () => user.click(screen.getByRole('radio', { name: 'Email' })),
      ],
    ])('hides the result after an edit of %s and shows it again when put back', async (_what, edit, undo) => {
      vi.mocked(testTarget).mockResolvedValue(failed)
      await shown(makeTargetList(mail))
      await openAddDialog()
      await user.type(addressInput(), 'a@example.com')
      await press()
      await inForm().findByText(/^Failed:/)
      await edit()
      expect(inForm().getByText(HINT)).toBeInTheDocument()
      expect(screen.queryByText(/^Failed:/)).not.toBeInTheDocument()
      await undo()
      expect(await inForm().findByText(/^Failed:/)).toBeInTheDocument()
    })

    it('hides the result after an edit of a header row, and shows it again when put back', async () => {
      vi.mocked(testTarget).mockResolvedValue(delivered)
      await shown(makeTargetList(hook))
      await openEditDialog('Chat hook')
      await press()
      await inForm().findByText('Delivered.')
      await user.type(screen.getByLabelText('Header 1 value'), 'x')
      expect(inForm().getByText(HINT)).toBeInTheDocument()
      await user.type(screen.getByLabelText('Header 1 value'), '{Backspace}')
      expect(await inForm().findByText('Delivered.')).toBeInTheDocument()
    })

    it('does not show a result that arrives after an edit, and a new test after the edit shows its own', async () => {
      const first = pendingTest()
      vi.mocked(testTarget).mockResolvedValueOnce(failed)
      await shown(makeTargetList(mail))
      await openAddDialog()
      await user.type(addressInput(), 'a@example.com')
      await press()
      await user.type(addressInput(), 'm')
      await act(async () => first.resolve(delivered))
      await waitFor(() => expect(testButton()).toHaveTextContent('Send test alert'))
      expect(screen.queryByText('Delivered.')).not.toBeInTheDocument()
      expect(inForm().getByText(HINT)).toBeInTheDocument()
      await press()
      expect(await inForm().findByText(/^Failed:/)).toBeInTheDocument()
      expect(testTarget).toHaveBeenLastCalledWith('s1', { type: 'email', name: '', address: 'a@example.comm' })
    })
  })

  describe('a test and a save together', () => {
    it('a test pressed while a save is in flight is sent, and the save still closes the dialog', async () => {
      const save = pendingSave()
      vi.mocked(testTarget).mockResolvedValue(delivered)
      await shown(makeTargetList(mail))
      await openAddDialog()
      await fillEmail()
      await submit()
      expect(testButton()).not.toHaveAttribute('aria-disabled')
      await press()
      expect(testTarget).toHaveBeenCalledWith('s1', { type: 'email', name: '', address: 'new@example.com' })
      await act(async () => save.resolve(makeEmailTarget({ address: 'new@example.com' })))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument())
    })

    it('a save pressed while a test is in flight sends the save', async () => {
      pendingTest()
      vi.mocked(createTarget).mockResolvedValue(makeEmailTarget({ address: 'new@example.com' }))
      await shown(makeTargetList(mail))
      await openAddDialog()
      await fillEmail()
      await press()
      await submit()
      expect(createTarget).toHaveBeenCalledOnce()
      await waitFor(() => expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument())
    })

    it('shows only the failure of the action started last when both fail', async () => {
      const save = pendingSave()
      const test = pendingTest()
      await shown(makeTargetList(mail))
      await openAddDialog()
      await fillEmail()
      await submit()
      await press()
      await act(async () => save.reject(problem(500, 'internal_error')))
      expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument()
      await act(async () => test.reject(problem(403, 'csrf_failed')))
      expect(await inForm().findByText('The request wasn’t accepted.')).toBeInTheDocument()
      expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument()
    })

    it('a failed older save does not show after a test that started later answers', async () => {
      const save = pendingSave()
      const test = pendingTest()
      await shown(makeTargetList(mail))
      await openAddDialog()
      await fillEmail()
      await press()
      await submit()
      await act(async () => test.reject(problem(500, 'internal_error')))
      expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument()
      await act(async () => save.reject(problem(403, 'csrf_failed')))
      expect(await inForm().findByText('The request wasn’t accepted.')).toBeInTheDocument()
    })
  })

  describe('after the dialog has closed', () => {
    it.each([
      ['a result', (t: TestSettle) => t.resolve(delivered)],
      ['a 422', (t: TestSettle) => t.reject(validationProblem(fieldError('address', 'No.')))],
      ['a 500', (t: TestSettle) => t.reject(problem(500, 'internal_error'))],
      ['a 404', (t: TestSettle) => t.reject(problem(404, 'not_found'))],
    ])('drops the late answer: %s shows nothing, calls nothing and fetches no list', async (_what, answer) => {
      const test = pendingTest()
      await shown(makeTargetList(mail))
      await openAddDialog()
      await press()
      // A blank contact does not send; type one first.
      await user.type(addressInput(), 'a@example.com')
      await press()
      expect(testTarget).toHaveBeenCalledOnce()
      await user.click(inForm().getByRole('button', { name: 'Cancel' }))
      await user.click(await screen.findByRole('button', { name: 'Discard changes' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument())
      await act(async () => answer(test))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument()
      noSideEffects()
      expect(rowsText()).toHaveLength(1)
    })
  })

  describe('failures', () => {
    it('a 422 shows the summary and field messages as for a save, focuses the summary, shows the hint, clears on edit, and a good test clears it (FR-82, FR-89, FR-110)', async () => {
      vi.mocked(testTarget)
        .mockRejectedValueOnce(
          validationProblem(fieldError('address', 'Not an address.'), fieldError('name', 'Name is too odd.')),
        )
        .mockResolvedValueOnce(delivered)
      await shown(makeTargetList(mail))
      await openAddDialog()
      await user.type(addressInput(), 'bad')
      await press()
      expect(await inForm().findByText('2 fields need fixing before this can be saved.')).toBeInTheDocument()
      expect(inForm().getAllByRole('link').map((a) => a.textContent)).toEqual([
        'Email address: Not an address.',
        'Name: Name is too odd.',
      ])
      const summary = inForm().getByText('2 fields need fixing before this can be saved.').closest('[role="alert"]')
      await waitFor(() => expect(summary).toHaveFocus())
      expect(addressInput()).toHaveAttribute('aria-invalid', 'true')
      expect(document.getElementById('target-address-error')).toHaveTextContent('Not an address.')
      expect(inForm().getByText(HINT)).toBeInTheDocument()
      await user.type(addressInput(), 'x')
      expect(inForm().getByText('1 field needs fixing before this can be saved.')).toBeInTheDocument()
      await press()
      expect(await inForm().findByText('Delivered.')).toBeInTheDocument()
      expect(screen.queryByText(/needs? fixing/)).not.toBeInTheDocument()
      expect(createTarget).not.toHaveBeenCalled()
    })

    it('a 404 on an add closes the dialog, fetches the list again, and a 404 there shows service not found with its heading focused', async () => {
      vi.mocked(testTarget).mockRejectedValue(problem(404, 'not_found'))
      await shown(makeTargetList(mail))
      vi.mocked(listTargets).mockRejectedValueOnce(problem(404, 'not_found'))
      await openAddDialog()
      await fillEmail()
      await press()
      const heading = await screen.findByRole('heading', { name: 'This service no longer exists' })
      expect(listTargets).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument()
      await waitFor(() => expect(heading).toHaveFocus())
    })

    it('a 404 on an edit closes the dialog and fetches again, with no “no longer exists” banner', async () => {
      vi.mocked(testTarget).mockRejectedValue(problem(404, 'not_found'))
      await shown(makeTargetList(mail))
      await openEditDialog('Ops mailbox')
      await press()
      await waitFor(() => expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument())
      expect(listTargets).toHaveBeenCalledTimes(2)
      expect(screen.queryByText('This target no longer exists.')).not.toBeInTheDocument()
    })

    it('a 403 csrf_failed shows the banner with Reload, which reloads once, and focus stays on the button (NFR-8)', async () => {
      const reload = vi.fn()
      vi.stubGlobal('location', { ...window.location, reload })
      vi.mocked(testTarget).mockRejectedValue(problem(403, 'csrf_failed'))
      await shown(makeTargetList(mail))
      await openAddDialog()
      await fillEmail()
      await press()
      expect(await inForm().findByText('The request wasn’t accepted.')).toBeInTheDocument()
      expect(inForm().getByText('Reload the page and try again.')).toBeInTheDocument()
      expect(testButton()).toHaveFocus()
      await user.click(inForm().getByRole('button', { name: 'Reload' }))
      expect(reload).toHaveBeenCalledOnce()
      vi.unstubAllGlobals()
    })

    it.each([
      ['a 500', problem(500, 'internal_error')],
      ['a network error', new TypeError('Failed to fetch')],
    ])('%s shows Something went wrong. and Try again sends the test again, not a save', async (_name, error) => {
      vi.mocked(testTarget).mockRejectedValueOnce(error).mockResolvedValueOnce(delivered)
      await shown(makeTargetList(mail))
      await openAddDialog()
      await fillEmail('a@example.com', 'Keep')
      await press()
      expect(await inForm().findByText('Something went wrong.')).toBeInTheDocument()
      expect(nameInput()).toHaveValue('Keep')
      expect(testButton()).toHaveFocus()
      await user.click(inForm().getByRole('button', { name: 'Try again' }))
      expect(await inForm().findByText('Delivered.')).toBeInTheDocument()
      expect(testTarget).toHaveBeenCalledTimes(2)
      expect(createTarget).not.toHaveBeenCalled()
      expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument()
    })

    it('a save failure’s Try again still saves; a new test clears it, and a new save clears a test failure', async () => {
      vi.mocked(createTarget).mockRejectedValue(problem(500, 'internal_error'))
      vi.mocked(testTarget).mockRejectedValueOnce(problem(403, 'csrf_failed'))
      await shown(makeTargetList(mail))
      await openAddDialog()
      await fillEmail()
      await submit()
      await inForm().findByText('Something went wrong.')
      await user.click(inForm().getByRole('button', { name: 'Try again' }))
      await waitFor(() => expect(createTarget).toHaveBeenCalledTimes(2))
      expect(testTarget).not.toHaveBeenCalled()
      await inForm().findByText('Something went wrong.')
      await press()
      expect(await inForm().findByText('The request wasn’t accepted.')).toBeInTheDocument()
      expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument()
      await submit()
      expect(await inForm().findByText('Something went wrong.')).toBeInTheDocument()
      expect(screen.queryByText('The request wasn’t accepted.')).not.toBeInTheDocument()
    })

    it('a 401 shows the sign-in form through the shell, with no banner and no result', async () => {
      vi.mocked(getSession).mockResolvedValue(sessionInfo)
      vi.mocked(listTargets).mockResolvedValue(makeTargetList(mail))
      vi.mocked(testTarget).mockImplementationOnce(() => {
        const handler = vi.mocked(setUnauthenticatedHandler).mock.calls.filter(([h]) => h !== null).at(-1)?.[0]
        handler?.()
        return Promise.reject(problem(401, 'unauthenticated'))
      })
      renderRoutes(appRoutes, { initialEntries: ['/services/s1/alerts'] })
      await screen.findByRole('list', { name: 'Notification targets' })
      await openAddDialog()
      await fillEmail()
      await press()
      expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
      expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument()
      expect(screen.queryByText('Delivered.')).not.toBeInTheDocument()
    })
  })
})
