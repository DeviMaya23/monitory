import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../components/ui/Toast'
import { deleteService, listServices, pauseService, resumeService, type Service } from '../../../lib/api/services'
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
import { usePauseService } from '../hooks/usePauseService'
import { useServiceList } from '../hooks/useServiceList'
import { formatTime } from '../../../lib/formatTime'
import { ServiceList } from './ServiceList'

// The real query key is kept (an automock would empty it); only the requests are mocked.
vi.mock('../../../lib/api/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/services')>()),
  listServices: vi.fn(),
  deleteService: vi.fn(),
  pauseService: vi.fn(),
  resumeService: vi.fn(),
}))
const config = vi.hoisted(() => ({ REFRESH_INTERVAL_MS: 5 * 60 * 1000 }))
vi.mock('../../../lib/config', () => config)

const NOW = new Date('2026-11-15T14:35:00Z')

// The composition of DashboardPage.
function Page() {
  return <ServiceList view={useServiceList()} deletion={useDeleteService()} pausing={usePauseService()} />
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

  it('has a Pause or Resume and a Delete button per row, no Edit button, no switch, no Open link; a row’s links are the name link, Alerts and Edit', async () => {
    await loaded(makeServiceList(makeService(), makeUnhealthy({ code: 'timed_out' }, { paused: true })))
    for (const name of [/Alerts/, /Edit/]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Open/ })).not.toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Services' })
    expect(within(list).getAllByRole('link').map((l) => l.getAttribute('aria-label') ?? l.textContent)).toEqual([
      'API gateway',
      'Alerts API gateway',
      'Edit API gateway',
      'Billing webhook',
      'Alerts Billing webhook',
      'Edit Billing webhook',
    ])
    const buttons = within(list).getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Pause API gateway',
      'Delete API gateway',
      'Resume Billing webhook',
      'Delete Billing webhook',
    ])
    expect(screen.getAllByRole('link')).toHaveLength(1 + 2 * 3)
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

  it('shows Alert delivery failed – view alert list as a link, paused or not; otherwise nothing (FR-86)', async () => {
    await loaded(
      makeServiceList(
        makeService({ name: 'a', alert_delivery_failed: true }),
        makePaused({ name: 'b', alert_delivery_failed: true }),
        makeService({ name: 'c' }),
      ),
    )
    const delivery = 'Alert delivery failed – view alert list'
    expect(within(row('a')).getByRole('link', { name: delivery })).toHaveAttribute('href', '/services/id-a/alerts')
    expect(within(row('b')).getByRole('link', { name: delivery })).toHaveAttribute('href', '/services/id-b/alerts')
    expect(row('c')).not.toHaveTextContent('Alert delivery failed')
    expect(within(row('c')).queryByRole('link', { name: delivery })).not.toBeInTheDocument()
    // The name link, the delivery link, Alerts and Edit.
    expect(within(row('a')).getAllByRole('link').map((l) => l.getAttribute('aria-label') ?? l.textContent)).toEqual([
      'a',
      delivery,
      'Alerts a',
      'Edit a',
    ])
  })

  it('every row’s name is a link to its Edit path with the id encoded, healthy, unhealthy, paused or TCP (FR-7)', async () => {
    await loaded(
      makeServiceList(
        makeService({ name: 'web' }),
        makeUnhealthy({ code: 'timed_out' }, { name: 'bad' }),
        makePaused(),
        makeTcp(),
        makeService({ id: 'x/y z', name: 'slash' }),
      ),
    )
    for (const [name, id] of [['web', 'id-web'], ['bad', 'id-bad'], ['Paused one', 'id-Paused%20one'], ['Postgres', 'id-Postgres'], ['slash', 'x%2Fy%20z']]) {
      const link = within(row(name)).getByRole('link', { name })
      expect(link).toHaveAttribute('href', `/services/${id}`)
      expect(link).toHaveClass('svc__name')
      expect(link).toHaveTextContent(name)
    }
  })

  it('every row has an Edit link to the same path with a hidden Edit label, between Alerts and Delete (FR-7)', async () => {
    await loaded(makeServiceList(makeService({ name: 'web' }), makePaused(), makeTcp(), makeService({ id: 'x/y', name: 'slash' })))
    for (const [name, id] of [['web', 'id-web'], ['Paused one', 'id-Paused%20one'], ['Postgres', 'id-Postgres'], ['slash', 'x%2Fy']]) {
      const edit = within(row(name)).getByRole('link', { name: `Edit ${name}` })
      expect(edit).toHaveAttribute('href', `/services/${id}`)
      expect(edit.querySelector('.btn__label')).toHaveAttribute('aria-hidden', 'true')
      expect(edit.querySelector('.btn__label')).toHaveTextContent('Edit')
      expect(within(row(name)).queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument()
      const alerts = within(row(name)).getByRole('link', { name: `Alerts ${name}` })
      const del = within(row(name)).getByRole('button', { name: `Delete ${name}` })
      expect(alerts.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(edit.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('hovering or focusing a name link shows a tooltip with the full 90-character name; markup shows literally (NFR-7, FR-9)', async () => {
    const long = 'L'.repeat(90)
    await loaded(makeServiceList(makeService({ name: long }), makeService({ name: '<b>x</b>' })))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const link = within(screen.getByRole('list', { name: 'Services' })).getByRole('link', { name: long })
    expect(link).toHaveTextContent(long)
    await user.hover(link)
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(within(await screen.findByRole('tooltip')).getByText(long)).toBeInTheDocument()
    await user.unhover(link)
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    link.focus()
    expect(await screen.findByRole('tooltip')).toHaveTextContent(long)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    const markup = screen.getByRole('link', { name: '<b>x</b>' })
    expect(markup).toHaveTextContent('<b>x</b>')
    markup.focus()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('<b>x</b>')
    expect(document.querySelector('b')).toBeNull()
  })

  it('every row has an Alerts link to its alert list, before the Delete button, paused, TCP or not (FR-17)', async () => {
    await loaded(makeServiceList(makeService({ name: 'web' }), makePaused(), makeTcp(), makeService({ id: 'x/y', name: 'slash' })))
    for (const [name, id] of [['web', 'id-web'], ['Paused one', 'id-Paused%20one'], ['Postgres', 'id-Postgres'], ['slash', 'x%2Fy']]) {
      const link = within(row(name)).getByRole('link', { name: `Alerts ${name}` })
      expect(link).toHaveAttribute('href', `/services/${id}/alerts`)
      expect(link.querySelector('.btn__label')).toHaveAttribute('aria-hidden', 'true')
      expect(link.querySelector('.btn__label')).toHaveTextContent('Alerts')
      expect(within(row(name)).queryByRole('button', { name: /Alerts/ })).not.toBeInTheDocument()
      const del = within(row(name)).getByRole('button', { name: `Delete ${name}` })
      expect(link.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
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

describe('Pause and Resume (FR-75, FR-77, FR-78, FR-79)', () => {
  const billing = makeUnhealthy({ code: 'timed_out' }, { name: 'Billing' })
  const other = makeService({ name: 'Other' })
  const sleeper = makePaused({ name: 'Sleeper' })
  const tcp = makeTcp()

  type Settle = { resolve: (service: Service) => void; reject: (error: unknown) => void }
  function pendingToggle(fn: typeof pauseService | typeof resumeService): Settle {
    const settle: Settle = { resolve: () => {}, reject: () => {} }
    vi.mocked(fn).mockReturnValueOnce(
      new Promise<Service>((resolve, reject) => {
        settle.resolve = resolve
        settle.reject = reject
      }),
    )
    return settle
  }
  const button = (label: string) => screen.getByRole('button', { name: label })
  const toast = async (text: string) => (await screen.findAllByText(text))[0]
  const names = () => [...document.querySelectorAll('.svc__name')].map((n) => n.textContent)
  const paused = (service: Service): Service => ({
    ...service,
    paused: true,
    state: { ...service.state, last_checked_at: '2026-11-15T14:33:00Z', last_status_change_at: '2026-11-15T14:20:00Z' },
  })

  it('names every row’s button by its action and service, hides the visible label, and puts it before Alerts and Delete in the Tab order (FR-75, NFR-4)', async () => {
    await loaded(makeServiceList(billing, sleeper, tcp))
    for (const [name, action] of [
      ['Billing', 'Pause'],
      ['Sleeper', 'Resume'],
      ['Postgres', 'Pause'],
    ]) {
      const toggle = button(`${action} ${name}`)
      const label = toggle.querySelector('.btn__label')
      expect(label).toHaveTextContent(action)
      expect(label).toHaveAttribute('aria-hidden', 'true')
      expect(within(row(name)).getAllByRole('button')[0]).toBe(toggle)
    }
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const link = (name: string) => screen.getByRole('link', { name })
    expect(within(row('Sleeper')).getAllByRole('link')[0]).toHaveTextContent('Sleeper')
    link('Sleeper').focus()
    await user.tab()
    expect(button('Resume Sleeper')).toHaveFocus()
    await user.tab()
    expect(link('Alerts Sleeper')).toHaveFocus()
    await user.tab()
    expect(link('Edit Sleeper')).toHaveFocus()
    await user.tab()
    expect(button('Delete Sleeper')).toHaveFocus()
    await user.tab({ shift: true })
    await user.tab({ shift: true })
    await user.tab({ shift: true })
    expect(button('Resume Sleeper')).toHaveFocus()
    await user.tab({ shift: true })
    expect(link('Sleeper')).toHaveFocus()
    await user.tab({ shift: true })
    expect(button('Delete Billing')).toHaveFocus()
    await user.tab({ shift: true })
    await user.tab({ shift: true })
    await user.tab({ shift: true })
    expect(button('Pause Billing')).toHaveFocus()
  })

  it('a pause sends one request with the id and opens no dialog; while pending the button is aria-disabled and ignores a second click and Enter, and another row works', async () => {
    const settle = pendingToggle(pauseService)
    await loaded(makeServiceList(billing, other))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(button('Pause Billing'))
    await waitFor(() => expect(button('Pause Billing')).toHaveAttribute('aria-disabled', 'true'))
    expect(pauseService).toHaveBeenCalledExactlyOnceWith('id-Billing')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(button('Pause Billing')).not.toBeDisabled()
    await user.click(button('Pause Billing'))
    await user.keyboard('{Enter}')
    expect(pauseService).toHaveBeenCalledTimes(1)
    expect(button('Pause Other')).not.toHaveAttribute('aria-disabled')
    const otherSettle = pendingToggle(pauseService)
    await user.click(button('Pause Other'))
    expect(pauseService).toHaveBeenCalledTimes(2)
    expect(pauseService).toHaveBeenLastCalledWith('id-Other')
    await act(async () => {
      settle.resolve(paused(billing))
      otherSettle.resolve(paused(other))
    })
  })

  it('the row keeps its state until the server answers, then shows Paused, no reason, the flag, the answer’s times, Resume, the toast and focus (FR-77, FR-78)', async () => {
    const settle = pendingToggle(pauseService)
    await loaded(makeServiceList(billing, other))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(button('Pause Billing'))
    await waitFor(() => expect(button('Pause Billing')).toHaveAttribute('aria-disabled', 'true'))
    expect(row('Billing')).toHaveTextContent('Unhealthy')
    expect(row('Billing')).not.toHaveClass('svc--paused')
    const answer = paused(billing)
    await act(async () => settle.resolve(answer))
    const after = row('Billing')
    expect(after).toHaveTextContent('Paused')
    expect(after).not.toHaveTextContent('Unhealthy')
    expect(after.querySelector('.svc__reason')).toBeNull()
    expect(after).toHaveTextContent('Paused, hidden from public page')
    expect(after.querySelector('.svc__check time')).toHaveAttribute('dateTime', '2026-11-15T14:33:00Z')
    expect(after.querySelector('.svc__change time')).toHaveAttribute('dateTime', '2026-11-15T14:20:00Z')
    expect(button('Resume Billing')).toHaveFocus()
    expect(button('Resume Billing')).not.toHaveAttribute('aria-disabled')
    expect(await toast('“Billing” paused. Checks and alerts stopped.')).toBeInTheDocument()
    expect(names()).toEqual(['Billing', 'Other'])
  })

  it('a resume sends resumeService, shows the stored status and reason of the answer, Pause again, the toast and focus (FR-79)', async () => {
    const settle = pendingToggle(resumeService)
    await loaded(makeServiceList(other, sleeper))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(button('Resume Sleeper'))
    await waitFor(() => expect(button('Resume Sleeper')).toHaveAttribute('aria-disabled', 'true'))
    expect(resumeService).toHaveBeenCalledExactlyOnceWith('id-Sleeper')
    expect(pauseService).not.toHaveBeenCalled()
    await act(async () => settle.resolve({ ...sleeper, paused: false }))
    const after = row('Sleeper')
    expect(after).toHaveTextContent('Unhealthy')
    expect(after.querySelector('.svc__reason')).not.toBeNull()
    expect(after).not.toHaveClass('svc--paused')
    expect(after).not.toHaveTextContent('Paused, hidden from public page')
    expect(button('Pause Sleeper')).toHaveFocus()
    expect(await toast('“Sleeper” resumed. Checking now.')).toBeInTheDocument()
  })

  it('shows a name with markup as text in the button’s name and in both toasts (NFR-7)', async () => {
    const markup = makeService({ name: '<b>x</b>' })
    await loaded(makeServiceList(markup))
    vi.mocked(pauseService).mockResolvedValueOnce(paused(markup))
    fireEvent.click(button('Pause <b>x</b>'))
    expect(await toast('“<b>x</b>” paused. Checks and alerts stopped.')).toBeInTheDocument()
    vi.mocked(resumeService).mockResolvedValueOnce(markup)
    fireEvent.click(button('Resume <b>x</b>'))
    expect(await toast('“<b>x</b>” resumed. Checking now.')).toBeInTheDocument()
    expect(document.querySelector('b')).toBeNull()
  })

  it('a 403 shows the toast with Reload, keeps the row and unlocks the button', async () => {
    await loaded(makeServiceList(billing, other))
    vi.mocked(pauseService).mockRejectedValueOnce(problem(403, 'csrf_failed'))
    fireEvent.click(button('Pause Billing'))
    expect(await toast('The request wasn’t accepted. Reload and try again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload', hidden: true })).toBeInTheDocument()
    expect(row('Billing')).toHaveTextContent('Unhealthy')
    expect(button('Pause Billing')).not.toHaveAttribute('aria-disabled')
    vi.mocked(pauseService).mockResolvedValueOnce(paused(billing))
    fireEvent.click(button('Pause Billing'))
    await waitFor(() => expect(pauseService).toHaveBeenCalledTimes(2))
  })

  it.each([
    ['a pause', 'Pause Billing', 'Couldn’t pause the service. Try again.'],
    ['a resume', 'Resume Sleeper', 'Couldn’t resume the service. Try again.'],
  ])('a 500 on %s keeps the row and shows the failure toast', async (_n, label, text) => {
    await loaded(makeServiceList(billing, sleeper))
    vi.mocked(pauseService).mockRejectedValueOnce(problem(500, 'internal_error'))
    vi.mocked(resumeService).mockRejectedValueOnce(problem(500, 'internal_error'))
    fireEvent.click(button(label))
    expect(await toast(text)).toBeInTheDocument()
    expect(button(label)).not.toHaveAttribute('aria-disabled')
    expect(row('Billing')).toHaveTextContent('Unhealthy')
    expect(row('Sleeper')).toHaveTextContent('Paused')
  })

  it('a 404 removes the row, cuts the count and says the service was already deleted; the last row’s 404 shows the Empty block', async () => {
    await loaded(makeServiceList(billing, other))
    vi.mocked(pauseService).mockRejectedValueOnce(problem(404, 'not_found'))
    fireEvent.click(button('Pause Billing'))
    expect(await toast('That service was already deleted.')).toBeInTheDocument()
    expect(names()).toEqual(['Other'])
    expect(line()).toBe('1 service · times in your local time')
    vi.mocked(pauseService).mockRejectedValueOnce(problem(404, 'not_found'))
    fireEvent.click(button('Pause Other'))
    expect(await screen.findByText('No services yet')).toBeInTheDocument()
  })

  it('a refresh that arrives while a pause is in flight does not put the old row back (FR-77)', async () => {
    const settle = pendingToggle(pauseService)
    await loaded(makeServiceList(billing, other))
    const refresh = pending()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled())
    fireEvent.click(button('Pause Billing'))
    await act(async () => settle.resolve(paused(billing)))
    await act(async () => refresh(makeServiceList(billing, other)))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(row('Billing')).toHaveTextContent('Paused')
    expect(button('Resume Billing')).toBeInTheDocument()
  })

  it('two rows paused at the same time and answered in the reverse order both end up paused, each with its own toast', async () => {
    const first = pendingToggle(pauseService)
    const second = pendingToggle(pauseService)
    await loaded(makeServiceList(billing, other, sleeper))
    fireEvent.click(button('Pause Billing'))
    fireEvent.click(button('Pause Other'))
    await waitFor(() => expect(pauseService).toHaveBeenCalledTimes(2))
    await act(async () => second.resolve(paused(other)))
    expect(button('Resume Other')).toBeInTheDocument()
    expect(button('Pause Billing')).toHaveAttribute('aria-disabled', 'true')
    await act(async () => first.resolve(paused(billing)))
    expect(button('Resume Billing')).toBeInTheDocument()
    expect(names()).toEqual(['Billing', 'Other', 'Sleeper'])
    expect(await toast('“Billing” paused. Checks and alerts stopped.')).toBeInTheDocument()
    expect(await toast('“Other” paused. Checks and alerts stopped.')).toBeInTheDocument()
  })

  it('Space on a pending button sends nothing, and Space on an idle button sends the pause', async () => {
    const settle = pendingToggle(pauseService)
    await loaded(makeServiceList(billing))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    button('Pause Billing').focus()
    await user.keyboard(' ')
    await waitFor(() => expect(button('Pause Billing')).toHaveAttribute('aria-disabled', 'true'))
    await user.keyboard(' ')
    await user.keyboard('{Enter}')
    expect(pauseService).toHaveBeenCalledTimes(1)
    await act(async () => settle.resolve(paused(billing)))
  })

  it('a name with a quote and 100 characters is shown whole in the button’s name and the toast', async () => {
    const long = makeService({ name: `“q” "${'n'.repeat(95)}` })
    expect(long.name).toHaveLength(100)
    await loaded(makeServiceList(long))
    vi.mocked(pauseService).mockResolvedValueOnce(paused(long))
    fireEvent.click(button(`Pause ${long.name}`))
    expect(await toast(`“${long.name}” paused. Checks and alerts stopped.`)).toBeInTheDocument()
    expect(button(`Resume ${long.name}`)).toBeInTheDocument()
  })

  it('a 401 shows no toast, keeps the row and unlocks the button', async () => {
    await loaded(makeServiceList(billing))
    vi.mocked(pauseService).mockRejectedValueOnce(problem(401, 'unauthenticated'))
    fireEvent.click(button('Pause Billing'))
    await waitFor(() => expect(pauseService).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(screen.queryByText(/Couldn’t pause|wasn’t accepted|already deleted/)).not.toBeInTheDocument()
    expect(row('Billing')).toHaveTextContent('Unhealthy')
    expect(button('Pause Billing')).not.toHaveAttribute('aria-disabled')
  })

  it('a network error on a resume shows the resume failure toast and keeps the row', async () => {
    await loaded(makeServiceList(sleeper))
    vi.mocked(resumeService).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fireEvent.click(button('Resume Sleeper'))
    expect(await toast('Couldn’t resume the service. Try again.')).toBeInTheDocument()
    expect(row('Sleeper')).toHaveTextContent('Paused')
  })
})
