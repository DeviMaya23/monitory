import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listServices } from '../../../lib/api/services'
import {
  makePaused,
  makeService,
  makeServiceList,
  makeTcp,
  makeUnchecked,
  makeUnhealthy,
} from '../../../test/fixtures'
import { useServiceList } from '../hooks/useServiceList'
import { formatTime } from '../lib/formatTime'
import { ServiceList } from './ServiceList'

vi.mock('../../../lib/api/services')
const config = vi.hoisted(() => ({ REFRESH_INTERVAL_MS: 5 * 60 * 1000 }))
vi.mock('../../../lib/config', () => config)

const NOW = new Date('2026-11-15T14:35:00Z')

function Page() {
  return <ServiceList view={useServiceList()} />
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Page />
      </MemoryRouter>
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

  it('has no row buttons, switch, Open link or row links; only the two Add service links are links', async () => {
    await loaded(makeServiceList(makeService(), makeUnhealthy({ code: 'timed_out' })))
    for (const name of [/Pause/, /Resume/, /Alerts/, /Edit/, /Delete/]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Open/ })).not.toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Services' })
    expect(within(list).queryByRole('link')).not.toBeInTheDocument()
    expect(within(list).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(1)
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
