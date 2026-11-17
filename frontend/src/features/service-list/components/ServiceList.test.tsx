import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../components/ui/Toast'
import { deleteService, listServices } from '../../../lib/api/services'
import {
  makePaused,
  makeService,
  makeServiceList,
  makeTcp,
  makeUnchecked,
  makeUnhealthy,
  problem,
} from '../../../test/fixtures'
import { useDeleteService } from '../hooks/useDeleteService'
import { useServiceList } from '../hooks/useServiceList'
import { formatTime } from '../lib/formatTime'
import { ServiceList } from './ServiceList'

// The real query key is kept (an automock would empty it); only the requests are mocked.
vi.mock('../../../lib/api/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/services')>()),
  listServices: vi.fn(),
  deleteService: vi.fn(),
}))
const config = vi.hoisted(() => ({ REFRESH_INTERVAL_MS: 5 * 60 * 1000 }))
vi.mock('../../../lib/config', () => config)

const NOW = new Date('2026-11-15T14:35:00Z')

// The composition of DashboardPage.
function Page() {
  return <ServiceList view={useServiceList()} deletion={useDeleteService()} />
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter>
          <Page />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

type Answer = (list: ReturnType<typeof makeServiceList>) => void
const pending = (): Answer => {
  let answer: Answer = () => {}
  vi.mocked(listServices).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
  return (list) => answer(list)
}

async function loaded(list: ReturnType<typeof makeServiceList>) {
  vi.mocked(listServices).mockResolvedValueOnce(list)
  const view = renderPage()
  await screen.findByRole('heading', { name: 'Services' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled())
  return view
}

const row = (name: string) => screen.getByText(name).closest('li') as HTMLElement
const line = () => document.querySelector('.page-sub')?.textContent
const meta = () => document.querySelector('.refresh-meta')?.textContent

beforeEach(() => {
  vi.resetAllMocks()
  config.REFRESH_INTERVAL_MS = 5 * 60 * 1000
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('Loading', () => {
  it('shows five skeleton rows in a busy list, the status, and a disabled busy Refresh', () => {
    pending()
    renderPage()
    const frame = document.querySelector('.svc-list')
    expect(frame).toHaveAttribute('aria-busy', 'true')
    expect(frame?.querySelectorAll('li.loading-row')).toHaveLength(5)
    expect(frame?.querySelectorAll('li[aria-hidden="true"]')).toHaveLength(5)
    expect(screen.getByRole('status')).toHaveTextContent('Loading services…')
    expect(screen.getByRole('link', { name: 'Add service' })).toBeInTheDocument()
    const refresh = screen.getByRole('button', { name: 'Refresh' })
    expect(refresh).toBeDisabled()
    expect(refresh).toHaveAttribute('aria-busy', 'true')
    expect(refresh.querySelector('.spinner')).not.toBeNull()
    expect(line()).toBe('Loading · times in your local time')
    expect(meta()).toBe('Loading…')
  })
})

describe('Could not load', () => {
  it('shows the heading line, the meta and the banner without rows or an empty block', async () => {
    vi.mocked(listServices).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderPage()
    const banner = await screen.findByText('Couldn’t load services.')
    expect(line()).toBe('Not loaded · times in your local time')
    expect(meta()).toBe('Not loaded yet · auto every 5 min')
    const status = banner.closest('[role="status"]') as HTMLElement
    expect(status).not.toHaveTextContent('Showing data from')
    expect(within(status).getByRole('button', { name: 'Retry' })).toBeEnabled()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByText('No services yet')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add service' })).toBeInTheDocument()
  })

  it('Retry fetches again, is disabled with Refresh while in flight, and shows the list on success', async () => {
    vi.mocked(listServices).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderPage()
    await screen.findByText('Couldn’t load services.')
    const answer = pending()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled()
    expect(screen.getByText('Couldn’t load services.')).toBeInTheDocument()
    await act(async () => answer(makeServiceList(makeService())))
    expect(await screen.findByText('API gateway')).toBeInTheDocument()
    expect(screen.queryByText('Couldn’t load services.')).not.toBeInTheDocument()
  })
})

describe('List', () => {
  it('shows one row per service in the order given, with badge words and type chips (FR-9, FR-62)', async () => {
    await loaded(
      makeServiceList(
        makeTcp({ name: 'zeta' }),
        makeService({ name: 'alpha' }),
        makeUnhealthy({ code: 'timed_out' }, { name: 'mid' }),
        makeUnchecked({ name: 'fresh' }),
        makePaused({ name: 'sleeper' }),
      ),
    )
    const rows = within(screen.getByRole('list', { name: 'Services' })).getAllByRole('listitem')
    expect(rows).toHaveLength(5)
    const names = rows.map((r) => r.querySelector('.svc__name')?.textContent)
    expect(names).toEqual(['zeta', 'alpha', 'mid', 'fresh', 'sleeper'])
    expect(rows[0]).toHaveTextContent('TCP')
    expect(rows[0]).toHaveTextContent('Healthy')
    expect(rows[1]).toHaveTextContent('HTTP')
    expect(rows[2]).toHaveTextContent('Unhealthy')
    expect(rows[3]).toHaveTextContent('Not checked yet')
    expect(rows[4]).toHaveTextContent('Paused')
    expect(rows[4]).toHaveClass('svc--paused')
    expect(rows[0]).not.toHaveClass('svc--paused')
  })

  it.each([
    [1, '1 service'],
    [7, '7 services'],
  ])('the heading line for %i services reads %s', async (count, text) => {
    await loaded(makeServiceList(...Array.from({ length: count }, (_, i) => makeService({ name: `svc ${i}` }))))
    expect(line()).toBe(`${text} · times in your local time`)
  })

  it('has one Delete button per row, no other row button, no switch, Open link or row links; only the Add service link is a link', async () => {
    await loaded(makeServiceList(makeService(), makeUnhealthy({ code: 'timed_out' })))
    for (const name of [/Pause/, /Resume/, /Alerts/, /Edit/]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Open/ })).not.toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Services' })
    expect(within(list).queryByRole('link')).not.toBeInTheDocument()
    const buttons = within(list).getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Delete API gateway', 'Delete Billing webhook'])
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('lists the six column header words and Actions', async () => {
    await loaded(makeServiceList(makeService()))
    const words = [...document.querySelectorAll('.svc-head span')].map((s) => s.textContent)
    expect(words).toEqual(['Status', 'Service', 'Last check', 'Last change', 'Alerts', 'Public', 'Actions'])
  })

  it('renders names and failure fields as text, not HTML (NFR-7)', async () => {
    await loaded(
      makeServiceList(
        makeUnhealthy({ code: 'json_rule_matched', json_rule_field: '<i>f</i>' }, { name: '<b>x</b>' }),
      ),
    )
    expect(screen.getByText('<b>x</b>')).toBeInTheDocument()
    expect(screen.getByText('JSON rule matched: <i>f</i>')).toBeInTheDocument()
    expect(document.querySelector('b, i')).toBeNull()
  })
})

describe('A row', () => {
  it('a paused service shows Paused, not its status, no reason, and a Paused public flag (FR-77, FR-112)', async () => {
    await loaded(makeServiceList(makePaused()))
    const r = row('Paused one')
    expect(within(r).getByText('Paused', { selector: '.status' })).toBeInTheDocument()
    expect(r).not.toHaveTextContent('Unhealthy')
    expect(r).not.toHaveTextContent('Timed out')
    const flag = r.querySelector('.svc__public') as HTMLElement
    expect(flag).toHaveTextContent('Paused, hidden from public page')
  })

  it('an unhealthy unpaused service shows its reason; healthy and null-reason ones show none (FR-61)', async () => {
    await loaded(
      makeServiceList(
        makeUnhealthy({ code: 'non_2xx_status', http_status: 503 }, { name: 'bad' }),
        makeService({ name: 'good' }),
        makeUnhealthy(null, { name: 'noreason' }),
      ),
    )
    expect(row('bad')).toHaveTextContent('Returned HTTP 503 (expected 2xx)')
    expect(row('good').querySelector('.svc__reason')).toBeNull()
    expect(row('noreason').querySelector('.svc__reason')).toBeNull()
  })

  it('shows Alert delivery failed, paused or not, as plain text; otherwise nothing (FR-86)', async () => {
    await loaded(
      makeServiceList(
        makeService({ name: 'a', alert_delivery_failed: true }),
        makePaused({ name: 'b', alert_delivery_failed: true }),
        makeService({ name: 'c' }),
      ),
    )
    expect(row('a')).toHaveTextContent('Alert delivery failed')
    expect(row('b')).toHaveTextContent('Alert delivery failed')
    expect(row('c')).not.toHaveTextContent('Alert delivery failed')
    expect(within(row('a')).queryByRole('link')).not.toBeInTheDocument()
  })

  it('shows Never and — for null times, and a time element with the received ISO string otherwise (FR-62, FR-94)', async () => {
    const checked = '2026-11-15T14:31:52Z'
    const changed = '2026-11-12T08:14:03Z'
    await loaded(
      makeServiceList(
        makeService({
          name: 'timed',
          state: { status: 'healthy', last_checked_at: checked, last_status_change_at: changed, last_failure_reason: null },
        }),
        makeUnchecked({ name: 'never' }),
      ),
    )
    const times = row('timed').querySelectorAll('time')
    expect(times).toHaveLength(2)
    expect(times[0]).toHaveAttribute('datetime', checked)
    expect(times[0]).toHaveTextContent(formatTime(checked, NOW))
    expect(times[1]).toHaveAttribute('datetime', changed)
    expect(times[1]).toHaveTextContent(formatTime(changed, NOW))
    expect(row('never').querySelector('time')).toBeNull()
    expect(row('never')).toHaveTextContent('Never')
    expect(screen.getByLabelText('None')).toHaveTextContent('—')
  })

  it('shows the Alerts and Public flags with hidden text, defaulting to On and Hidden when left out (FR-62)', async () => {
    const bare = makeService({ name: 'bare' })
    delete bare.alerts_enabled
    delete bare.shown_on_public_view
    await loaded(
      makeServiceList(
        makeService({ name: 'on', alerts_enabled: true, shown_on_public_view: true }),
        makeService({ name: 'off', alerts_enabled: false, shown_on_public_view: false }),
        bare,
      ),
    )
    expect(row('on').querySelector('.svc__alerts')).toHaveTextContent('On alerts')
    expect(row('on').querySelector('.svc__public')).toHaveTextContent('Shown on public page')
    expect(row('off').querySelector('.svc__alerts')).toHaveTextContent('Off alerts')
    expect(row('off').querySelector('.svc__public')).toHaveTextContent('Hidden from public page')
    expect(row('bare').querySelector('.svc__alerts')).toHaveTextContent('On alerts')
    expect(row('bare').querySelector('.svc__public')).toHaveTextContent('Hidden from public page')
  })
})

describe('The toolbar meta (FR-95)', () => {
  it('shows Updated with the last success time and auto every 5 min', async () => {
    await loaded(makeServiceList(makeService()))
    const time = document.querySelector('.refresh-meta time') as HTMLElement
    expect(time).toHaveAttribute('datetime', NOW.toISOString())
    expect(time).toHaveTextContent(formatTime(NOW.toISOString(), NOW))
    expect(meta()).toMatch(/^Updated .* · auto every 5 min$/)
  })

  it.each([
    [90_000, '2'],
    [80_000, '1'],
    [120_000, '2'],
  ])('with the interval at %i ms reads auto every %s min', async (ms, minutes) => {
    config.REFRESH_INTERVAL_MS = ms
    await loaded(makeServiceList(makeService()))
    expect(meta()).toContain(`auto every ${minutes} min`)
  })
})

describe('Empty', () => {
  it('shows the title, the text, the heading line and two Add service links to /services/new', async () => {
    await loaded([])
    expect(line()).toBe('No services · times in your local time')
    expect(screen.getByRole('heading', { name: 'No services yet' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'Add a web endpoint or a TCP port. Monitory checks it in the background and alerts you when it goes down or recovers.',
      ),
    ).toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: 'Add service' })
    expect(links).toHaveLength(2)
    links.forEach((l) => expect(l).toHaveAttribute('href', '/services/new'))
  })
})

describe('Refresh and Retry (FR-95)', () => {
  it('Refresh calls listServices once, is disabled and busy in flight, keeps the rows, then is enabled', async () => {
    await loaded(makeServiceList(makeService()))
    expect(listServices).toHaveBeenCalledTimes(1)
    const answer = pending()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled())
    const refresh = screen.getByRole('button', { name: 'Refresh' })
    expect(refresh).toHaveAttribute('aria-busy', 'true')
    expect(refresh.querySelector('.spinner')).not.toBeNull()
    expect(listServices).toHaveBeenCalledTimes(2)
    expect(screen.getByText('API gateway')).toBeInTheDocument()

    await act(async () => answer(makeServiceList(makeService())))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled())
    expect(screen.getByRole('button', { name: 'Refresh' })).not.toHaveAttribute('aria-busy')
    expect(screen.getByText('API gateway')).toBeInTheDocument()
  })

  it('a failed refresh shows the banner with the last success time and keeps every row; Retry then clears it', async () => {
    await loaded(makeServiceList(makeService({ name: 'one' }), makeService({ name: 'two' })))
    vi.setSystemTime(new Date('2026-11-15T14:40:00Z'))
    vi.mocked(listServices).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    const title = await screen.findByText('Couldn’t refresh.')
    const banner = title.closest('[role="status"]') as HTMLElement
    expect(banner).toHaveTextContent(`Showing data from ${formatTime(NOW.toISOString(), NOW)}.`)
    expect(screen.getByText('one')).toBeInTheDocument()
    expect(screen.getByText('two')).toBeInTheDocument()

    const answer = pending()
    fireEvent.click(within(banner).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(within(banner).getByRole('button', { name: 'Retry' })).toBeDisabled())
    expect(screen.getByText('Couldn’t refresh.')).toBeInTheDocument()
    await act(async () => answer(makeServiceList(makeService({ name: 'one' }))))
    await waitFor(() => expect(screen.queryByText('Couldn’t refresh.')).not.toBeInTheDocument())
    expect(screen.queryByText('two')).not.toBeInTheDocument()
  })

  it('shows the banner over an empty list too', async () => {
    await loaded([])
    vi.mocked(listServices).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText('Couldn’t refresh.')).toBeInTheDocument()
    expect(screen.getByText('No services yet')).toBeInTheDocument()
  })
})

describe('Delete (FR-8, FR-72)', () => {
  const x = makeService({ name: 'x', target_count: 2 })
  const y = makeService({ name: 'y', target_count: 1 })
  const z = makeService({ name: 'z', target_count: 0 })

  type Settle = { resolve: () => void; reject: (error: unknown) => void }
  function pendingDelete(): Settle {
    const settle: Settle = { resolve: () => {}, reject: () => {} }
    vi.mocked(deleteService).mockReturnValueOnce(
      new Promise<void>((resolve, reject) => {
        settle.resolve = resolve
        settle.reject = reject
      }),
    )
    return settle
  }
  const deleteButton = (name: string) => screen.getByRole('button', { name: `Delete ${name}` })
  /** A real click focuses the button first; `fireEvent` does not. */
  const openFor = (name: string) => {
    deleteButton(name).focus()
    fireEvent.click(deleteButton(name))
  }
  const toast = async (text: string) => (await screen.findAllByText(text))[0]
  const dialog = () => screen.findByRole('alertdialog')
  const gone = () => waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  const names = () => [...document.querySelectorAll('.svc__name')].map((n) => n.textContent)
  const pressEsc = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
  function clickBackdrop() {
    const backdrop = document.querySelector('.dialog-backdrop') as Element
    fireEvent.pointerDown(backdrop)
    fireEvent.mouseDown(backdrop)
    fireEvent.pointerUp(backdrop)
    fireEvent.mouseUp(backdrop)
    fireEvent.click(backdrop)
  }
  async function confirmWith(settle: Settle, outcome: 'ok' | unknown, target = 'y') {
    await loaded(makeServiceList(x, y, z))
    openFor(target)
    await dialog()
    fireEvent.click(screen.getByRole('button', { name: 'Delete service' }))
    await act(async () => {
      if (outcome === 'ok') settle.resolve()
      else settle.reject(outcome)
    })
    await gone()
  }

  it('gives paused and TCP rows a Delete button whose visible label is hidden from assistive technology', async () => {
    await loaded(makeServiceList(makePaused(), makeTcp()))
    for (const name of ['Paused one', 'Postgres']) {
      const label = deleteButton(name).querySelector('.btn__label')
      expect(label).toHaveTextContent('Delete')
      expect(label).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('opens the dialog of the clicked row without a request, each with its own name and count', async () => {
    await loaded(makeServiceList(x, y))
    openFor('x')
    expect(await dialog()).toHaveAccessibleName('Delete “x”?')
    expect(await dialog()).toHaveTextContent('2 notification targets')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await gone()
    openFor('y')
    expect(await dialog()).toHaveAccessibleName('Delete “y”?')
    expect(await dialog()).toHaveTextContent('1 notification target')
    expect(deleteService).not.toHaveBeenCalled()
  })

  it('Cancel and Esc close it with no request and focus goes back to that row’s button; the backdrop does not close it (NFR-4)', async () => {
    await loaded(makeServiceList(x, y))
    openFor('y')
    await dialog()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus())
    clickBackdrop()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await gone()
    await waitFor(() => expect(deleteButton('y')).toHaveFocus())

    openFor('x')
    await dialog()
    pressEsc()
    await gone()
    await waitFor(() => expect(deleteButton('x')).toHaveFocus())
    expect(deleteService).not.toHaveBeenCalled()
  })

  it('sends one request with the id; while pending both buttons are disabled, Esc and a second click do nothing', async () => {
    const settle = pendingDelete()
    await loaded(makeServiceList(x, y))
    openFor('y')
    await dialog()
    const confirm = screen.getByRole('button', { name: 'Delete service' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    const busy = await screen.findByRole('button', { name: 'Deleting…' })
    expect(busy).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    pressEsc()
    clickBackdrop()
    fireEvent.click(busy)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(deleteService).toHaveBeenCalledTimes(1)
    expect(deleteService).toHaveBeenCalledWith(y.id)
    await act(async () => settle.resolve())
    await gone()
  })

  it('a 204 removes the row, keeps the order, updates the count, shows the toast and focuses the heading', async () => {
    const settle = pendingDelete()
    await confirmWith(settle, 'ok')
    expect(names()).toEqual(['x', 'z'])
    expect(line()).toBe('2 services · times in your local time')
    expect(await screen.findByText('Service deleted.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Services', level: 1 })).toHaveFocus())
    expect(listServices).toHaveBeenCalledTimes(1)
  })

  it('shows 1 service after 2 are cut to 1, and the Empty block after the last one', async () => {
    const settle = pendingDelete()
    await loaded(makeServiceList(x, y))
    openFor('x')
    await dialog()
    fireEvent.click(screen.getByRole('button', { name: 'Delete service' }))
    await act(async () => settle.resolve())
    await gone()
    expect(line()).toBe('1 service · times in your local time')

    const again = pendingDelete()
    openFor('y')
    await dialog()
    fireEvent.click(screen.getByRole('button', { name: 'Delete service' }))
    await act(async () => again.resolve())
    await gone()
    expect(screen.getByText('No services yet')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Add service' })).toHaveLength(2)
  })

  it('a 404 not_found removes the row the same way, with the already-deleted toast', async () => {
    await confirmWith(pendingDelete(), problem(404, 'not_found'))
    expect(names()).toEqual(['x', 'z'])
    expect(await toast('That service was already deleted.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Services', level: 1 })).toHaveFocus())
  })

  it.each([
    ['a 403 csrf_failed', problem(403, 'csrf_failed'), 'The request wasn’t accepted. Reload and try again.', true],
    ['a 500', problem(500, 'internal_error'), 'Couldn’t delete the service. Try again.', false],
    ['a network error', new TypeError('Failed to fetch'), 'Couldn’t delete the service. Try again.', false],
  ])('%s closes the dialog, keeps every row, shows the toast and returns focus to the button', async (_n, error, text, reload) => {
    await confirmWith(pendingDelete(), error)
    expect(names()).toEqual(['x', 'y', 'z'])
    expect(await toast(text)).toBeInTheDocument()
    // An error toast is hidden from the tree until it is focused, so look for the action with `hidden`.
    const reloadButton = screen.queryByRole('button', { name: 'Reload', hidden: true })
    expect(reloadButton !== null).toBe(reload)
    await waitFor(() => expect(deleteButton('y')).toHaveFocus())
  })

  it('keeps the text of the dialog when a refresh changes the count, and a refresh that removes the service leaves it open until a 404 answers', async () => {
    await loaded(makeServiceList(x, y))
    openFor('y')
    await dialog()
    const refreshed = pending()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh', hidden: true }))
    await act(async () => refreshed(makeServiceList(x, { ...y, target_count: 5 })))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('1 notification target')
    expect(screen.getByRole('alertdialog')).not.toHaveTextContent('5 notification')

    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh', hidden: true })).toBeEnabled())
    const second = pending()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh', hidden: true }))
    await act(async () => second(makeServiceList(x)))
    await waitFor(() => expect(names()).toEqual(['x']))
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('Delete “y”?')

    vi.mocked(deleteService).mockRejectedValueOnce(problem(404, 'not_found'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete service' }))
    expect(await toast('That service was already deleted.')).toBeInTheDocument()
    await gone()
  })

  it.each([0, 1, 2, 5])('verifier: a 100-character name without spaces and %i targets goes into the title as text', async (count) => {
    const long = 'n'.repeat(100)
    await loaded(makeServiceList(makeService({ name: long, target_count: count })))
    openFor(long)
    const dlg = await dialog()
    expect(dlg).toHaveAccessibleName(`Delete “${long}”?`)
    const word = count === 1 ? '1 notification target' : `${count} notification targets`
    if (count === 0) expect(dlg).toHaveTextContent('It has no notification targets.')
    else expect(dlg).toHaveTextContent(`Its alert list goes with it: ${word}.`)
    expect(dlg.querySelector('strong')?.textContent ?? '').toBe(count === 0 ? '' : word)
  })

  it('keeps the time of the last real response after a removal', async () => {
    const settle = pendingDelete()
    await loaded(makeServiceList(x, y))
    const before = meta()
    vi.setSystemTime(new Date('2026-11-15T16:10:00Z'))
    openFor('y')
    await dialog()
    fireEvent.click(screen.getByRole('button', { name: 'Delete service' }))
    await act(async () => settle.resolve())
    await gone()
    expect(names()).toEqual(['x'])
    expect(meta()).toBe(before)
  })
})
