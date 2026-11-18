import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'
import { ToastProvider } from '../../../components/ui/Toast'
import { setUnauthenticatedHandler } from '../../../lib/api/request'
import { listServices } from '../../../lib/api/services'
import { getSession } from '../../../lib/api/session'
import {
  createTarget,
  listTargets,
  updateTarget,
  type Target,
  type TargetList,
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

const toastShown = async (text: string) => expect((await screen.findAllByText(text)).length).toBeGreaterThan(0)
const FORM_DIALOG = /^(Add|Edit) target$/
const dialog = (name = 'Add target') => screen.getByRole('dialog', { name })
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
  await userEvent.click(footAdd())
  await screen.findByRole('dialog', { name: 'Add target' })
}
async function openEditDialog(label: string) {
  await userEvent.click(editButton(label))
  await screen.findByRole('dialog', { name: 'Edit target' })
}
async function chooseWebhook() {
  await userEvent.click(screen.getByRole('radio', { name: 'Webhook' }))
}
/** Types a valid email target and submits it. */
async function fillEmail(address = 'new@example.com', name?: string) {
  if (name) await userEvent.type(nameInput(), name)
  await userEvent.type(addressInput(), address)
}
const submit = (name = 'Add target') => userEvent.click(primary(name))

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

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listServices).mockResolvedValue(makeServiceList(service))
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('opening the add dialog', () => {
  it('shows the board’s form: Email chosen, Name focused, counter, label, no rows, footer, Close, no test row (FR-14, FR-80, FR-81)', async () => {
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
    expect(screen.queryByText(/Send test alert/)).not.toBeInTheDocument()
    expect(document.querySelector('.dialog--wide.dialog--sheet')).not.toBeNull()
  })

  it('counts the typed characters', async () => {
    await shown(makeTargetList(mail))
    await openAddDialog()
    await userEvent.type(nameInput(), 'abcdefghijkl')
    expect(inDialog().getByText('12/50')).toBeInTheDocument()
  })

  it('opens from the empty state’s Add target as well', async () => {
    await shown([])
    await userEvent.click(screen.getByRole('button', { name: 'Add target' }))
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
  it('shows the webhook fields on Webhook, keeps what was typed per type, and sends only the active type’s fields', async () => {
    vi.mocked(createTarget).mockResolvedValue(makeWebhookTarget())
    await shown(makeTargetList(mail))
    await openAddDialog()
    await userEvent.type(addressInput(), 'kept@example.com')
    await chooseWebhook()
    expect(addressInput).toThrow()
    expect(screen.getByText('Starts with http:// or https://.')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /Custom headers/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add header' })).toBeInTheDocument()
    await userEvent.type(urlInput(), 'https://hook.example.com/x')
    await userEvent.click(screen.getByRole('radio', { name: 'Email' }))
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
    await userEvent.type(urlInput(), 'https://unsent.example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Add header' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Email' }))
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
    if (url) await userEvent.type(urlInput(), url)
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
    await userEvent.click(screen.getByRole('button', { name: 'Add header' }))
    expect(screen.queryByText('No custom headers.')).not.toBeInTheDocument()
  })

  it('adds a header row and focuses its name; names the inputs by number; renumbers and moves focus on removal; sends rows in order, empty ones too; has no limit (FR-92)', async () => {
    vi.mocked(createTarget).mockResolvedValue(makeWebhookTarget())
    await shown(makeTargetList(mail))
    await openAddDialog()
    await chooseWebhook()
    await userEvent.type(urlInput(), 'https://h.example.com')
    const add = screen.getByRole('button', { name: 'Add header' })
    await userEvent.click(add)
    expect(screen.getByLabelText('Header 1 name')).toHaveFocus()
    await userEvent.type(screen.getByLabelText('Header 1 name'), 'A')
    await userEvent.click(add)
    await userEvent.type(screen.getByLabelText('Header 2 name'), 'B')
    await userEvent.type(screen.getByLabelText('Header 2 value'), 'two')
    await userEvent.click(add)
    await userEvent.type(screen.getByLabelText('Header 3 name'), 'C')
    for (let i = 4; i <= 21; i++) await userEvent.click(add)
    expect(screen.getAllByRole('button', { name: /^Remove header/ })).toHaveLength(21)
    for (let i = 21; i > 3; i--) await userEvent.click(screen.getByRole('button', { name: `Remove header ${i}` }))
    // Removing row 2 of 3 renumbers the rest and focuses the next row's name input.
    await userEvent.click(screen.getByRole('button', { name: 'Remove header 2' }))
    expect(screen.queryByLabelText('Header 3 name')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Header 2 name')).toHaveValue('C')
    expect(screen.getByLabelText('Header 2 name')).toHaveFocus()
    await userEvent.click(add)
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

  it('focuses the previous row when the last row goes, and Add header when the only row goes', async () => {
    await shown(makeTargetList(mail))
    await openAddDialog()
    await chooseWebhook()
    const add = screen.getByRole('button', { name: 'Add header' })
    await userEvent.click(add)
    await userEvent.click(add)
    await userEvent.click(screen.getByRole('button', { name: 'Remove header 2' }))
    expect(screen.getByLabelText('Header 1 name')).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Remove header 1' }))
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
    await userEvent.type(addressInput(), '   ')
    await submit()
    expect(await screen.findByText('Enter an email address.')).toBeInTheDocument()
    expect(addressInput()).toHaveFocus()
    expect(addressInput()).toHaveAttribute('aria-invalid', 'true')
    expect(createTarget).not.toHaveBeenCalled()
    await userEvent.type(addressInput(), 'a')
    expect(screen.queryByText('Enter an email address.')).not.toBeInTheDocument()
    await userEvent.clear(addressInput())
    await chooseWebhook()
    await submit()
    expect(await screen.findByText('Enter a URL that starts with http:// or https://.')).toBeInTheDocument()
    expect(urlInput()).toHaveFocus()
    expect(createTarget).not.toHaveBeenCalled()
    await userEvent.type(urlInput(), 'h')
    expect(screen.queryByText('Enter a URL that starts with http:// or https://.')).not.toBeInTheDocument()
  })

  it('submits once on Enter in Name, and sends nothing on Enter while saving (NFR-4)', async () => {
    const settle = pendingSave()
    await shown(makeTargetList(mail))
    await openAddDialog()
    await userEvent.type(addressInput(), 'a@example.com')
    await userEvent.type(nameInput(), 'N{Enter}')
    await waitFor(() => expect(createTarget).toHaveBeenCalledOnce())
    await userEvent.type(nameInput(), '{Enter}')
    fireEvent.submit(document.getElementById('target-form') as HTMLFormElement)
    expect(createTarget).toHaveBeenCalledOnce()
    await act(async () => settle.resolve(makeEmailTarget({ address: 'a@example.com' })))
  })
})

describe('opening while a removal question is open', () => {
  it.each(['add', 'edit'])('%s closes the question and sends nothing', async (which) => {
    await shown(makeTargetList(mail, bare))
    await userEvent.click(removeButton('Ops mailbox'))
    expect(screen.getByText('Remove this target?')).toBeInTheDocument()
    if (which === 'add') await userEvent.click(footAdd())
    else await userEvent.click(editButton('https://hooks.example.com/bare'))
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
    await userEvent.click(inDialog().getByRole('button', { name: 'Close' }))
    await userEvent.keyboard('{Escape}')
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
    await userEvent.click(screen.getByRole('button', { name: 'Add target' }))
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
    await userEvent.clear(nameInput())
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
    await userEvent.type(urlInput(), 'https://swap.example.com')
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
    await userEvent.type(nameInput(), ' x')
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
    await userEvent.type(urlInput(), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Add header' }))
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
    await userEvent.click(within(summary).getByRole('link', { name: 'Webhook URL: Not a URL.' }))
    expect(urlInput()).toHaveFocus()
    // Editing a field clears its message and its entry.
    await userEvent.type(urlInput(), 'x')
    expect(screen.queryByText('Not a URL.')).not.toBeInTheDocument()
    expect(summary).toHaveTextContent('4 fields need fixing')
    // Removing a header row clears the header errors.
    await userEvent.click(screen.getByRole('button', { name: 'Remove header 1' }))
    expect(screen.queryByText('Header name is empty.')).not.toBeInTheDocument()
    expect(within(summary).queryByText(/Header 1 name/)).not.toBeInTheDocument()
    expect(summary).toHaveTextContent('2 fields need fixing')
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
    await userEvent.type(urlInput(), 'https://h.example.com')
    const add = screen.getByRole('button', { name: 'Add header' })
    await userEvent.click(add)
    await userEvent.click(add)
    await userEvent.click(add)
    await submit()
    const summary = await inDialog().findByRole('alert')
    expect(summary).toHaveTextContent('Custom headers: At most 2 headers.')
    expect(within(summary).queryByRole('link', { name: /Custom headers/ })).not.toBeInTheDocument()
    expect(document.querySelectorAll('p.error-text')).toHaveLength(2)
    await userEvent.click(add)
    expect(summary).not.toHaveTextContent('Custom headers')
    expect(summary).toHaveTextContent('Header 2 value: Too long.')
    await userEvent.click(screen.getByRole('button', { name: 'Remove header 4' }))
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
      await userEvent.type(urlInput(), 'https://hooks.example.com/alerts')
    }
    await submit()
    expect(await screen.findByText(message)).toBeInTheDocument()
    const field = type === 'email' ? addressInput() : urlInput()
    await waitFor(() => expect(field).toHaveFocus())
    expect(field).toHaveAccessibleDescription(message)
    expect(inDialog().queryByRole('alert')).not.toBeInTheDocument()
    await userEvent.type(field, 'x')
    expect(screen.queryByText(message)).not.toBeInTheDocument()
  })

  it('409 target_duplicate on an edit shows the message on the address field', async () => {
    vi.mocked(updateTarget).mockRejectedValue(problem(409, 'target_duplicate'))
    await shown(makeTargetList(mail, makeEmailTarget({ address: 'other@example.com', name: 'Other' })))
    await openEditDialog('Other')
    await userEvent.clear(addressInput())
    await userEvent.type(addressInput(), 'ops@example.com')
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
    await userEvent.click(refresh)
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
    await userEvent.click(inDialog().getByRole('button', { name: 'Reload' }))
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
    await userEvent.click(inDialog().getByRole('button', { name: 'Try again' }))
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
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/services/s1/alerts']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    )
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
    if (how === 'Cancel' || how === 'Close') await userEvent.click(inDialog().getByRole('button', { name: how }))
    else if (how === 'Esc') await userEvent.keyboard('{Escape}')
    else clickBackdrop()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument())
    await waitFor(() => expect(footAdd()).toHaveFocus())
    expect(createTarget).not.toHaveBeenCalled()
  })

  it('a changed one asks first with focus on Keep editing; Keep editing, Esc and the backdrop return to the form with its values', async () => {
    await shown(makeTargetList(mail))
    await openAddDialog()
    await fillEmail('a@example.com', 'Typed')
    await userEvent.click(inDialog().getByRole('button', { name: 'Cancel' }))
    const question = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    expect(within(question).getByText('The changes to this target will be lost.')).toBeInTheDocument()
    await waitFor(() => expect(within(question).getByRole('button', { name: 'Keep editing' })).toHaveFocus())
    await userEvent.click(within(question).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard unsaved changes?' })).not.toBeInTheDocument())
    expect(nameInput()).toHaveValue('Typed')

    // Esc on the open question closes only the question.
    await userEvent.click(inDialog().getByRole('button', { name: 'Close' }))
    await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard unsaved changes?' })).not.toBeInTheDocument())
    expect(dialog()).toBeInTheDocument()
    expect(addressInput()).toHaveValue('a@example.com')

    // The backdrop of the question too.
    await userEvent.keyboard('{Escape}')
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
    await userEvent.keyboard('{Escape}')
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument())
    expect(createTarget).not.toHaveBeenCalled()
    await waitFor(() => expect(footAdd()).toHaveFocus())
  })

  it('an edit dialog returns focus to its row’s Edit button, and an edit put back to its originals is unchanged again', async () => {
    await shown(makeTargetList(mail, bare))
    await openEditDialog('Ops mailbox')
    await userEvent.type(nameInput(), 'x')
    await userEvent.type(nameInput(), '{Backspace}')
    await userEvent.click(inDialog('Edit target').getByRole('button', { name: 'Cancel' }))
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
    await userEvent.type(nameInput(), 'x')
    expect(unload()).toBe(true)
    await userEvent.keyboard('{Escape}')
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: FORM_DIALOG })).not.toBeInTheDocument())
    expect(unload()).toBe(false)
  })
})
