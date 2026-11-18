import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'
import { ToastProvider } from '../../../components/ui/Toast'
import { setUnauthenticatedHandler } from '../../../lib/api/request'
import { listServices } from '../../../lib/api/services'
import { getSession } from '../../../lib/api/session'
import { deleteTarget, listTargets, updateTarget, type Target, type TargetList } from '../../../lib/api/targets'
import AlertListPage from '../../../pages/AlertListPage'
import {
  makeEmailTarget,
  makeService,
  makeServiceList,
  makeTargetList,
  makeWebhookTarget,
  problem,
  sessionInfo,
} from '../../../test/fixtures'

vi.mock('../../../lib/api/session')
vi.mock('../../../lib/api/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/services')>()),
  listServices: vi.fn(),
}))
vi.mock('../../../lib/api/targets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/targets')>()),
  listTargets: vi.fn(),
  deleteTarget: vi.fn(),
  updateTarget: vi.fn(),
}))
vi.mock('../../../lib/api/request', () => ({ setCsrfToken: vi.fn(), setUnauthenticatedHandler: vi.fn() }))

const service = makeService({ id: 's1', name: 'Search API' })
const mail = makeEmailTarget({ name: 'Ops mailbox', address: 'ops@example.com' })
const bare = makeWebhookTarget({ name: undefined, url: 'https://hooks.example.com/bare' })
const LONG_NAME = 'N'.repeat(50)
const LONG_URL = `https://hooks.example.com/${'p'.repeat(200)}`
const longHook = makeWebhookTarget({ name: LONG_NAME, url: LONG_URL })
const three = makeTargetList(mail, bare, longHook)

function client() {
  return new QueryClient()
}

function renderPage(queryClient = client()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/services/s1/alerts']}>
          <Routes>
            <Route path="/services/:serviceId/alerts" element={<AlertListPage />} />
            <Route path="/" element={<p>Dashboard</p>} />
            <Route path="/services/:serviceId" element={<p>Edit page</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

async function shown(list: TargetList, services = makeServiceList(service)) {
  vi.mocked(listServices).mockResolvedValue(services)
  vi.mocked(listTargets).mockResolvedValue(list)
  renderPage()
  if (list.length > 0) await screen.findByRole('list', { name: 'Notification targets' })
  else await screen.findByRole('heading', { name: 'No notification targets' })
}

type Settle = { resolve: () => void; reject: (error: unknown) => void }
function pendingRemoval(): Settle {
  const settle: Settle = { resolve: () => {}, reject: () => {} }
  vi.mocked(deleteTarget).mockReturnValueOnce(
    new Promise<void>((resolve, reject) => {
      settle.resolve = resolve
      settle.reject = reject
    }),
  )
  return settle
}

/** A toast's text is also in a live region, so it can match more than once. */
const toastShown = async (text: string) => expect((await screen.findAllByText(text)).length).toBeGreaterThan(0)
const editButton = (name: string) => screen.getByRole('button', { name: `Edit ${name}` })
const removeButton = (name: string) => screen.getByRole('button', { name: `Remove ${name}` })
const confirming = () => screen.getByRole('group', { name: 'Confirm removal' })
const confirmRemove = () => within(confirming()).getByRole('button', { name: /Remove|Removing/ })
const rowsText = () => screen.getAllByRole('listitem').map((li) => li.textContent)

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listServices).mockResolvedValue(makeServiceList(service))
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('loading', () => {
  it('shows a status, three hidden skeleton rows, the title with the name once known, and a back link', async () => {
    vi.mocked(listTargets).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading targets…')
    const skeleton = document.querySelector('ul.target-list') as HTMLElement
    expect(skeleton).toHaveAttribute('aria-hidden', 'true')
    expect(skeleton.querySelectorAll('li.target')).toHaveLength(3)
    expect(screen.getByRole('link', { name: 'Services' })).toHaveAttribute('href', '/')
    expect(document.querySelector('.page-sub')).toBeNull()
    expect(await screen.findByRole('heading', { level: 1, name: 'Alert list: Search API' })).toBeInTheDocument()
  })
})

describe('the list', () => {
  it('shows rows in server order with type, chip, name or fallback, and the full address (FR-17, FR-80, FR-81)', async () => {
    await shown(three)
    expect(screen.getByText('3 targets · in the order added')).toBeInTheDocument()
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Email')
    expect(rows[0]).toHaveTextContent('EMAIL')
    expect(rows[0]).toHaveTextContent('Ops mailbox')
    expect(rows[0]).toHaveTextContent('ops@example.com')
    expect(rows[1]).toHaveTextContent('Webhook')
    expect(rows[1]).toHaveTextContent('WEBHOOK')
    expect(rows[1]).toHaveTextContent('Unnamed webhook')
    expect(rows[1]).toHaveTextContent('https://hooks.example.com/bare')
    expect(rows[2].querySelector('.target__name')?.textContent).toBe(LONG_NAME)
    expect(rows[2].querySelector('.target__addr')?.textContent).toBe(LONG_URL)
  })

  it('says 1 target for one', async () => {
    await shown(makeTargetList(mail))
    expect(screen.getByText('1 target · in the order added')).toBeInTheDocument()
  })

  it('shows an unnamed email as Unnamed email, and a name of spaces only as the fallback named after the URL', async () => {
    const spaces = makeWebhookTarget({ name: '   ', url: 'https://spaces.example.com' })
    const noName = makeEmailTarget({ name: '', address: 'blank@example.com' })
    await shown(makeTargetList(spaces, noName))
    expect(screen.getByText('Unnamed webhook')).toBeInTheDocument()
    expect(screen.getByText('Unnamed email')).toBeInTheDocument()
    expect(removeButton('https://spaces.example.com')).toBeInTheDocument()
    expect(removeButton('blank@example.com')).toBeInTheDocument()
  })

  it('renders names and the service name as text, not HTML (NFR-7)', async () => {
    await shown(
      makeTargetList(makeEmailTarget({ name: '<b>x</b>' })),
      makeServiceList(makeService({ id: 's1', name: '<i>y</i>' })),
    )
    expect(screen.getByText('<b>x</b>')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Alert list: <i>y</i>' })).toBeInTheDocument()
    expect(document.querySelector('b, i')).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove <b>x</b>' })).toBeInTheDocument()
  })

  it('has an Edit and a Remove button per row, named by name or address, and the footer with Add target and its hint (FR-14, FR-15)', async () => {
    await shown(three)
    expect(screen.getAllByRole('button')).toHaveLength(3 * 2 + 1)
    expect(editButton('Ops mailbox')).toHaveTextContent('Edit')
    expect(editButton('https://hooks.example.com/bare')).toBeInTheDocument()
    expect(removeButton('Ops mailbox')).toBeInTheDocument()
    expect(removeButton('https://hooks.example.com/bare')).toBeInTheDocument()
    const foot = document.querySelector('.list-foot') as HTMLElement
    expect(within(foot).getByRole('button', { name: 'Add target' })).toBeInTheDocument()
    expect(foot).toHaveTextContent('Email or webhook. Alerts go to every target when the service goes down or recovers.')
    // Edit comes before Remove in each row.
    const buttons = within(screen.getAllByRole('listitem')[0]).getAllByRole('button')
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['Edit Ops mailbox', 'Remove Ops mailbox'])
    expect(screen.queryByRole('link', { name: /Add|Edit target/ })).not.toBeInTheDocument()
  })

  it('has no Add target while loading, when the list could not be loaded, or when the service is not found', async () => {
    vi.mocked(listTargets).mockReturnValue(new Promise(() => {}))
    const loading = renderPage()
    expect(screen.queryByRole('button', { name: 'Add target' })).not.toBeInTheDocument()
    loading.unmount()
    vi.mocked(listTargets).mockRejectedValue(problem(500, 'internal_error'))
    const failed = renderPage()
    await screen.findByText('Something went wrong.')
    expect(screen.queryByRole('button', { name: 'Add target' })).not.toBeInTheDocument()
    failed.unmount()
    vi.mocked(listTargets).mockRejectedValue(problem(404, 'not_found'))
    renderPage()
    await screen.findByRole('heading', { name: 'This service no longer exists' })
    expect(screen.queryByRole('button', { name: 'Add target' })).not.toBeInTheDocument()
  })

  it('shows five targets (the most the server sends) and a 2,048-character URL in full', async () => {
    const huge = `https://hooks.example.com/${'q'.repeat(2048 - 'https://hooks.example.com/'.length)}`
    expect(huge).toHaveLength(2048)
    const five = makeTargetList(
      makeEmailTarget({ name: 'one', address: 'one@example.com' }),
      makeEmailTarget({ name: 'two', address: 'two@example.com' }),
      makeEmailTarget({ name: 'three', address: 'three@example.com' }),
      makeEmailTarget({ name: 'four', address: 'four@example.com' }),
      makeWebhookTarget({ name: undefined, url: huge }),
    )
    await shown(five)
    expect(screen.getByText('5 targets · in the order added')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(document.querySelectorAll('.target__addr')[4].textContent).toBe(huge)
    expect(removeButton(huge)).toBeInTheDocument()
  })

  it('asks for the targets of the service in the address (FR-18)', async () => {
    await shown(three)
    expect(listTargets).toHaveBeenCalledWith('s1')
  })

  it('shows the targets with no name in the title when the service list lacks the service; only listTargets decides not found', async () => {
    await shown(three, makeServiceList(makeService({ id: 'other', name: 'Other' })))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Alert list$/)
    expect(screen.queryByText('This service no longer exists')).not.toBeInTheDocument()
  })
})

describe('empty', () => {
  it('shows the heading, the text, Add target under it and the sub line', async () => {
    await shown([])
    expect(screen.getByText('No alerts will be sent for this service until you add an email address or a webhook.')).toBeInTheDocument()
    expect(screen.getByText('No targets · in the order added')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Add target' })).toBeInTheDocument()
  })
})

describe('alerts off', () => {
  it.each([
    ['the list', three],
    ['the empty state', [] as TargetList],
  ])('shows the banner and an Edit service link over %s', async (_name, list) => {
    await shown(list, makeServiceList(makeService({ id: 's1', name: 'Search API', alerts_enabled: false })))
    expect(await screen.findByText('Alerts are off for this service.')).toBeInTheDocument()
    expect(screen.getByText('These targets receive nothing until alerts are turned on.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit service' })).toHaveAttribute('href', '/services/s1')
  })

  it('shows nothing for true, absent, an unknown service or an unloaded service list', async () => {
    const absent = makeService({ id: 's1', name: 'Search API' })
    delete absent.alerts_enabled
    for (const services of [makeServiceList(service), makeServiceList(absent), makeServiceList()]) {
      vi.mocked(listServices).mockResolvedValue(services)
      vi.mocked(listTargets).mockResolvedValue(three)
      const view = renderPage()
      await screen.findByRole('list', { name: 'Notification targets' })
      await waitFor(() => expect(listServices).toHaveBeenCalled())
      expect(screen.queryByText('Alerts are off for this service.')).not.toBeInTheDocument()
      view.unmount()
    }
    vi.mocked(listServices).mockRejectedValue(problem(500, 'internal_error'))
    renderPage()
    await screen.findByRole('list', { name: 'Notification targets' })
    expect(screen.queryByText('Alerts are off for this service.')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Alert list$/)
  })
})

describe('something went wrong', () => {
  it('shows the banner and no list for a 500; Try again is disabled while in flight and then shows the list', async () => {
    vi.mocked(listTargets).mockRejectedValueOnce(problem(500, 'internal_error'))
    renderPage()
    expect(await screen.findByText('Something went wrong.')).toBeInTheDocument()
    expect(screen.getByText('The server couldn’t be reached or returned an error.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Notification targets' })).not.toBeInTheDocument()
    expect(document.querySelector('.page-sub')).toBeNull()

    let answer: (list: TargetList) => void = () => {}
    vi.mocked(listTargets).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled())
    await act(async () => answer(three))
    expect(await screen.findByRole('list', { name: 'Notification targets' })).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument()
  })

  it('keeps the rows under the banner when a reload fails with the list on screen, and shows both banners, Something went wrong first, when alerts are off and a reload failed; with no data only the first', async () => {
    const off = makeServiceList(makeService({ id: 's1', name: 'Search API', alerts_enabled: false }))
    vi.mocked(listServices).mockResolvedValue(off)
    vi.mocked(listTargets).mockResolvedValueOnce(three)
    renderPage()
    await screen.findByText('Alerts are off for this service.')
    vi.mocked(listTargets).mockRejectedValueOnce(problem(500, 'internal_error'))
    // Fail the reload through the removal's 404 refetch path is not needed: remove a row with a 404 then fail the refetch.
    vi.mocked(deleteTarget).mockRejectedValueOnce(problem(404, 'not_found'))
    await userEvent.click(removeButton('Ops mailbox'))
    await userEvent.click(confirmRemove())
    await screen.findByText('Something went wrong.')
    const region = document.querySelector('.alerts-banners') as HTMLElement
    expect(region).toHaveAttribute('aria-live', 'polite')
    const titles = [...region.querySelectorAll('.banner__title')].map((t) => t.textContent)
    expect(titles).toEqual(['Something went wrong.', 'Alerts are off for this service.'])
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('shows only Something went wrong with no data even when alerts are off', async () => {
    vi.mocked(listServices).mockResolvedValue(
      makeServiceList(makeService({ id: 's1', name: 'Search API', alerts_enabled: false })),
    )
    vi.mocked(listTargets).mockRejectedValue(problem(500, 'internal_error'))
    renderPage()
    await screen.findByText('Something went wrong.')
    await waitFor(() => expect(listServices).toHaveBeenCalled())
    expect(screen.queryByText('Alerts are off for this service.')).not.toBeInTheDocument()
  })
})

describe('service not found', () => {
  it('replaces the page with the block and focuses its heading', async () => {
    vi.mocked(listTargets).mockRejectedValue(problem(404, 'not_found'))
    renderPage()
    const heading = await screen.findByRole('heading', { name: 'This service no longer exists' })
    expect(screen.getByText('It was deleted, so its alert list is gone too.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to services' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('link', { name: 'Services' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(heading).toHaveFocus()
  })
})

describe('removing a target', () => {
  it('opens the question in that row only, focuses the confirming Remove, and sends nothing', async () => {
    await shown(three)
    await userEvent.click(removeButton('Ops mailbox'))
    expect(screen.getAllByRole('group', { name: 'Confirm removal' })).toHaveLength(1)
    expect(within(confirming()).getByText('Remove this target?')).toBeInTheDocument()
    expect(within(confirming()).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(confirmRemove()).toHaveFocus()
    expect(screen.getAllByRole('listitem')[0]).toContainElement(confirming())
    expect(deleteTarget).not.toHaveBeenCalled()
  })

  it('closes the first question when a second row asks', async () => {
    await shown(three)
    await userEvent.click(removeButton('Ops mailbox'))
    await userEvent.click(removeButton('https://hooks.example.com/bare'))
    expect(screen.getAllByRole('group', { name: 'Confirm removal' })).toHaveLength(1)
    expect(screen.getAllByRole('listitem')[1]).toContainElement(confirming())
    expect(removeButton('Ops mailbox')).toBeInTheDocument()
  })

  it('Cancel and Esc restore the row and focus its Remove button, sending nothing (NFR-4)', async () => {
    await shown(three)
    await userEvent.click(removeButton('Ops mailbox'))
    await userEvent.click(within(confirming()).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(removeButton('Ops mailbox')).toHaveFocus()

    await userEvent.click(removeButton('Ops mailbox'))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(removeButton('Ops mailbox')).toHaveFocus()
    expect(deleteTarget).not.toHaveBeenCalled()
  })

  it('while pending: Cancel and other Removes are disabled, the confirming Remove is busy and keeps focus; Esc, a click and Enter do nothing', async () => {
    await shown(three)
    const settle = pendingRemoval()
    await userEvent.click(removeButton('Ops mailbox'))
    await userEvent.click(confirmRemove())
    await waitFor(() => expect(confirmRemove()).toHaveAttribute('aria-busy', 'true'))
    expect(deleteTarget).toHaveBeenCalledOnce()
    expect(deleteTarget).toHaveBeenCalledWith('s1', mail.id)
    const button = confirmRemove()
    expect(button).toHaveTextContent('Removing…')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    expect(button).toHaveFocus()
    expect(within(confirming()).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(removeButton('https://hooks.example.com/bare')).toBeDisabled()
    expect(removeButton(LONG_NAME)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add target' })).toBeDisabled()
    expect(editButton('https://hooks.example.com/bare')).toBeDisabled()
    expect(editButton(LONG_NAME)).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(button)
    await userEvent.keyboard('{Enter}')
    expect(confirming()).toBeInTheDocument()
    expect(deleteTarget).toHaveBeenCalledOnce()
    await act(async () => settle.resolve())
  })

  describe('after a 204', () => {
    it.each([
      ['the first row', 0, 'https://hooks.example.com/bare'],
      ['the middle row', 1, LONG_NAME],
    ])('removes %s and focuses the next row’s Edit button', async (_name, index, nextName) => {
      await shown(three)
      const names = ['Ops mailbox', 'https://hooks.example.com/bare', LONG_NAME]
      vi.mocked(deleteTarget).mockResolvedValueOnce(undefined)
      await userEvent.click(removeButton(names[index]))
      await userEvent.click(confirmRemove())
      await waitFor(() => expect(editButton(nextName)).toHaveFocus())
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
      expect(screen.queryByRole('button', { name: `Remove ${names[index]}` })).not.toBeInTheDocument()
      expect(screen.getByText('2 targets · in the order added')).toBeInTheDocument()
      await toastShown('Target removed.')
      expect(listTargets).toHaveBeenCalledOnce()
    })

    it('keeps the other rows in order and moves focus to Add target when the last row goes', async () => {
      await shown(three)
      vi.mocked(deleteTarget).mockResolvedValueOnce(undefined)
      await userEvent.click(removeButton(LONG_NAME))
      await userEvent.click(confirmRemove())
      await waitFor(() => expect(screen.getByRole('button', { name: 'Add target' })).toHaveFocus())
      expect(rowsText()[0]).toContain('Ops mailbox')
      expect(rowsText()[1]).toContain('Unnamed webhook')
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
    })

    it('shows the empty state and focuses its Add target when the only target goes', async () => {
      await shown(makeTargetList(mail))
      vi.mocked(deleteTarget).mockResolvedValueOnce(undefined)
      await userEvent.click(removeButton('Ops mailbox'))
      await userEvent.click(confirmRemove())
      expect(await screen.findByRole('heading', { name: 'No notification targets' })).toBeInTheDocument()
      await waitFor(() => expect(screen.getByRole('button', { name: 'Add target' })).toHaveFocus())
      expect(screen.getByText('No targets · in the order added')).toBeInTheDocument()
    })
  })

  describe('after a 404 not_found', () => {
    it('removes the row, toasts, fetches again and focuses the next row’s Edit button', async () => {
      await shown(three)
      vi.mocked(deleteTarget).mockRejectedValueOnce(problem(404, 'not_found'))
      vi.mocked(listTargets).mockResolvedValueOnce(makeTargetList(bare, longHook))
      await userEvent.click(removeButton('Ops mailbox'))
      await userEvent.click(confirmRemove())
      await toastShown('That target was already removed.')
      await waitFor(() => expect(editButton('https://hooks.example.com/bare')).toHaveFocus())
      expect(listTargets).toHaveBeenCalledTimes(2)
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
    })

    it('shows service not found with the heading focused when the refetch answers 404', async () => {
      await shown(three)
      vi.mocked(deleteTarget).mockRejectedValueOnce(problem(404, 'not_found'))
      vi.mocked(listTargets).mockRejectedValueOnce(problem(404, 'not_found'))
      await userEvent.click(removeButton('Ops mailbox'))
      await userEvent.click(confirmRemove())
      const heading = await screen.findByRole('heading', { name: 'This service no longer exists' })
      await waitFor(() => expect(heading).toHaveFocus())
      await toastShown('That target was already removed.')
    })
  })

  describe('after a failure', () => {
    it.each([
      ['a 403 csrf_failed', problem(403, 'csrf_failed'), 'The request wasn’t accepted. Reload and try again.', true],
      ['a 500', problem(500, 'internal_error'), 'Couldn’t remove the target. Try again.', false],
      ['a network error', new TypeError('Failed to fetch'), 'Couldn’t remove the target. Try again.', false],
    ])('%s restores the row, keeps every row, toasts and focuses its Remove button', async (_name, error, text, reload) => {
      await shown(three)
      vi.mocked(deleteTarget).mockRejectedValueOnce(error)
      await userEvent.click(removeButton('Ops mailbox'))
      await userEvent.click(confirmRemove())
      await toastShown(text)
      await waitFor(() => expect(removeButton('Ops mailbox')).toHaveFocus())
      expect(screen.queryByRole('group')).not.toBeInTheDocument()
      expect(screen.getAllByRole('listitem')).toHaveLength(3)
      expect(screen.queryAllByText('Reload', { selector: 'button' }).length > 0).toBe(reload)
    })
  })

  it('two failures in a row each restore the row, toast again and refocus its Remove button', async () => {
    await shown(three)
    for (const error of [problem(500, 'internal_error'), new TypeError('Failed to fetch')]) {
      vi.mocked(deleteTarget).mockRejectedValueOnce(error)
      await userEvent.click(removeButton('Ops mailbox'))
      await userEvent.click(confirmRemove())
      await toastShown('Couldn’t remove the target. Try again.')
      await waitFor(() => expect(removeButton('Ops mailbox')).toHaveFocus())
      await userEvent.click(removeButton('https://hooks.example.com/bare'))
      await userEvent.keyboard('{Escape}')
      expect(removeButton('https://hooks.example.com/bare')).toHaveFocus()
    }
    expect(deleteTarget).toHaveBeenCalledTimes(2)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('a 401 shows the sign-in form through the shell, no toast, and not the cached list', async () => {
    vi.mocked(getSession).mockResolvedValue(sessionInfo)
    vi.mocked(listTargets).mockResolvedValue(three)
    vi.mocked(deleteTarget).mockImplementationOnce(() => {
      const handler = vi.mocked(setUnauthenticatedHandler).mock.calls.filter(([h]) => h !== null).at(-1)?.[0]
      handler?.()
      return Promise.reject(problem(401, 'unauthenticated'))
    })
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={['/services/s1/alerts']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await screen.findByRole('list', { name: 'Notification targets' })
    await userEvent.click(removeButton('Ops mailbox'))
    await userEvent.click(confirmRemove())
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Notification targets' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Couldn’t remove|already removed|Target removed/)).not.toBeInTheDocument()
  })
})

describe('the delivery-failed notice (FR-86)', () => {
  const TEXT = 'Last delivery failed. Shown until a later delivery succeeds.'
  const first = makeEmailTarget({ name: 'First', address: 'first@example.com' })
  const second = makeWebhookTarget({ name: 'Second', url: 'https://second.example.com' })
  const third = makeEmailTarget({ name: 'Third', address: 'third@example.com' })
  const flagged = (target: Target, value = true): Target => ({ ...target, last_delivery_failed: value })
  const notices = () => document.querySelectorAll('.notice')
  const rowOf = (name: string) => screen.getByText(name).closest('li') as HTMLElement
  const noticeIn = (name: string) => rowOf(name).querySelector('.notice')

  /** Removes `name` through a 404 and makes the refetch reject, so the rows stay under the banner. */
  async function failReloadByRemoving(name: string) {
    vi.mocked(deleteTarget).mockRejectedValueOnce(problem(404, 'not_found'))
    vi.mocked(listTargets).mockRejectedValueOnce(problem(500, 'internal_error'))
    await userEvent.click(removeButton(name))
    await userEvent.click(confirmRemove())
    await screen.findByText('Something went wrong.')
  }

  it('shows the notice only in the flagged row, in server order, with the sub line unchanged (FR-17)', async () => {
    await shown(makeTargetList(first, flagged(second), third))
    expect(notices()).toHaveLength(1)
    expect(noticeIn('Second')?.textContent).toBe(TEXT)
    expect(noticeIn('First')).toBeNull()
    expect(noticeIn('Third')).toBeNull()
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((li) => li.querySelector('.target__name')?.textContent)).toEqual(['First', 'Second', 'Third'])
    expect(screen.getByText('3 targets · in the order added')).toBeInTheDocument()
  })

  it('shows none when none is flagged and three when all are', async () => {
    const none = renderPage
    vi.mocked(listServices).mockResolvedValue(makeServiceList(service))
    vi.mocked(listTargets).mockResolvedValue(makeTargetList(first, second, third))
    const view = none()
    await screen.findByRole('list', { name: 'Notification targets' })
    expect(notices()).toHaveLength(0)
    view.unmount()
    vi.mocked(listTargets).mockResolvedValue(makeTargetList(flagged(first), flagged(second), flagged(third)))
    renderPage()
    await screen.findByRole('list', { name: 'Notification targets' })
    expect(notices()).toHaveLength(3)
  })

  it('keeps the rows under the banner when a reload fails after a 404 removal', async () => {
    await shown(makeTargetList(flagged(first), flagged(second)))
    await failReloadByRemoving('First')
    expect(listTargets).toHaveBeenCalledTimes(2)
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(noticeIn('Second')).not.toBeNull()
  })

  it('drops the notice when a reload says false for that target', async () => {
    await shown(makeTargetList(flagged(first), flagged(second)))
    await failReloadByRemoving('First')
    expect(noticeIn('Second')?.textContent).toBe(TEXT)
    vi.mocked(listTargets).mockResolvedValueOnce(makeTargetList(flagged(second, false)))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument())
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(rowOf('Second')).toBeInTheDocument()
    expect(notices()).toHaveLength(0)
  })

  it('shows the notice when a reload says true for a target that showed none', async () => {
    await shown(makeTargetList(first, second))
    await failReloadByRemoving('Second')
    expect(notices()).toHaveLength(0)
    vi.mocked(listTargets).mockResolvedValueOnce(makeTargetList(flagged(first)))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(noticeIn('First')).not.toBeNull())
    expect(notices()).toHaveLength(1)
  })

  describe.each([
    ['true', true],
    ['false', false],
  ])('edit through the dialog on a flagged row, answered with %s', (_name, answer) => {
    it(answer ? 'keeps the notice' : 'drops the notice', async () => {
      await shown(makeTargetList(first, flagged(second), flagged(third)))
      vi.mocked(updateTarget).mockResolvedValue(flagged(second, answer))
      await userEvent.click(editButton('Second'))
      const dialog = await screen.findByRole('dialog', { name: 'Edit target' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save target' }))
      await toastShown('Target saved.')
      await waitFor(() => expect(screen.queryByRole('dialog', { name: /^(Add|Edit) target$/ })).not.toBeInTheDocument())
      expect(updateTarget).toHaveBeenCalledOnce()
      expect(noticeIn('Second') !== null).toBe(answer)
      expect(noticeIn('First')).toBeNull()
      expect(noticeIn('Third')).not.toBeNull()
    })
  })

  it('removing a flagged target (204) removes its notice and adds none elsewhere', async () => {
    await shown(makeTargetList(first, flagged(second), third))
    vi.mocked(deleteTarget).mockResolvedValueOnce(undefined)
    await userEvent.click(removeButton('Second'))
    await userEvent.click(confirmRemove())
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    expect(screen.queryByText('Second')).not.toBeInTheDocument()
    expect(notices()).toHaveLength(0)
  })

  it('keeps the notice while the removal question is open and after Cancel', async () => {
    await shown(makeTargetList(first, flagged(second)))
    await userEvent.click(removeButton('Second'))
    expect(noticeIn('Second')?.textContent).toBe(TEXT)
    await userEvent.click(within(confirming()).getByRole('button', { name: 'Cancel' }))
    expect(noticeIn('Second')?.textContent).toBe(TEXT)
    expect(notices()).toHaveLength(1)
  })

  it('follows the data on a reload while another row\'s removal question is open (verifier)', async () => {
    await shown(makeTargetList(first, flagged(second), flagged(third)))
    await failReloadByRemoving('First')
    await userEvent.click(removeButton('Third'))
    expect(noticeIn('Third')).not.toBeNull()
    vi.mocked(listTargets).mockResolvedValueOnce(makeTargetList(flagged(second, false), flagged(third)))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument())
    expect(confirming()).toBeInTheDocument()
    expect(noticeIn('Second')).toBeNull()
    expect(noticeIn('Third')?.textContent).toBe(TEXT)
    expect(notices()).toHaveLength(1)
  })

  it('shows five notices for five flagged targets (verifier)', async () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((n) => flagged(makeEmailTarget({ name: n, address: `${n}@example.com` })))
    await shown(makeTargetList(...five))
    expect(notices()).toHaveLength(5)
  })
})
