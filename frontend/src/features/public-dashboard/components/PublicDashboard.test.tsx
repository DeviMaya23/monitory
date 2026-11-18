import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import { getPublicDashboard } from '../../../lib/api/publicDashboard'
import { formatTime } from '../../../lib/formatTime'
import { makePublicDashboard, makePublicService, problem } from '../../../test/fixtures'
import { usePublicDashboard } from '../hooks/usePublicDashboard'
import { PublicDashboard } from './PublicDashboard'

vi.mock('../../../lib/api/publicDashboard')

const config = vi.hoisted(() => ({ REFRESH_INTERVAL_MS: 5 * 60 * 1000 }))
vi.mock('../../../lib/config', () => config)

const NOW = new Date('2026-11-15T14:35:00Z')
const INTERVAL = 5 * 60 * 1000

function Harness() {
  return <PublicDashboard view={usePublicDashboard()} />
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const rateLimited = (retryAfter: number | null) =>
  new ApiError(429, { title: 'Problem', status: 429, code: 'rate_limited' }, retryAfter)
const unavailable = () => problem(404, 'public_view_unavailable')

const refreshButton = () => screen.getByRole('button', { name: /^Refresh/ })
const banner = (name: string) => screen.getByText(name).closest('.banner') as HTMLElement

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  config.REFRESH_INTERVAL_MS = INTERVAL
})
afterEach(() => {
  vi.useRealTimers()
})

describe('Loading', () => {
  it('shows four hidden skeleton rows, the status text, a busy Refresh, the meta and the foot line', () => {
    vi.mocked(getPublicDashboard).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Service status' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading service status…')
    const rows = document.querySelectorAll('.pub-row')
    expect(rows).toHaveLength(4)
    rows.forEach((row) => expect(row).toHaveAttribute('aria-hidden', 'true'))
    const button = refreshButton()
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveTextContent('Refreshing…')
    expect(button.querySelector('.spinner')).not.toBeNull()
    expect(screen.getByText('Refreshes every 5 min')).toBeInTheDocument()
    expect(screen.getByText('Times are shown in your local time.')).toBeInTheDocument()
    expect(document.querySelector('.pub-summary')).toBeNull()
  })
})

describe('List', () => {
  const sent = makePublicDashboard(
    makePublicService({ name: 'zeta', status: 'unhealthy', last_checked_at: '2026-11-15T14:31:40Z' }),
    makePublicService({ name: 'Alpha', last_checked_at: '2025-03-02T08:00:00Z' }),
    makePublicService({ name: 'mid' }),
    makePublicService({ name: 'beta', status: 'unhealthy' }),
    makePublicService({ name: 'Omega' }),
  )

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(NOW)
  })

  it('shows one row per service in the order given, with status, label and time (FR-28, FR-63, FR-94)', async () => {
    vi.mocked(getPublicDashboard).mockResolvedValue(sent)
    renderPage()
    const list = await screen.findByRole('list', { name: 'Services' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((r) => r.querySelector('.pub-row__name')?.textContent)).toEqual(['zeta', 'Alpha', 'mid', 'beta', 'Omega'])
    expect(within(rows[0]).getByText('Unhealthy')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Healthy')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Last checked')).toBeInTheDocument()
    const time = rows[0].querySelector('time')
    expect(time).toHaveAttribute('datetime', '2026-11-15T14:31:40Z')
    expect(time).toHaveTextContent(formatTime('2026-11-15T14:31:40Z', NOW))
    // Another year: the format carries the year.
    const other = rows[1].querySelector('time')
    expect(other).toHaveAttribute('datetime', '2025-03-02T08:00:00Z')
    expect(other).toHaveTextContent(formatTime('2025-03-02T08:00:00Z', NOW))
    expect(other?.textContent).toContain('2025')
    expect(screen.getByText('2 of 5 services unhealthy')).toBeInTheDocument()
    expect(screen.getByText('Times are shown in your local time.')).toBeInTheDocument()
    const meta = screen.getByText(/^Updated/)
    expect(meta).toHaveTextContent('· every 5 min')
    expect(meta.querySelector('time')).toHaveAttribute('datetime', NOW.toISOString())
    expect(meta.querySelector('time')).toHaveTextContent(formatTime(NOW.toISOString(), NOW))
  })

  it.each([
    ['1 of 1 service unhealthy', [makePublicService({ status: 'unhealthy' })]],
    ['All services healthy', [makePublicService({ name: 'a' }), makePublicService({ name: 'b' })]],
  ])('reads "%s" in the summary', async (text, services) => {
    vi.mocked(getPublicDashboard).mockResolvedValue(makePublicDashboard(...services))
    renderPage()
    expect(await screen.findByText(text)).toBeInTheDocument()
  })

  it.each([
    [2 * 60 * 1000, 2],
    [90_000, 2],
    [80_000, 1],
  ])('with the interval at %d ms the meta says every %d min (FR-31)', async (ms, minutes) => {
    config.REFRESH_INTERVAL_MS = ms
    vi.mocked(getPublicDashboard).mockResolvedValueOnce(sent).mockRejectedValue(new TypeError('x'))
    renderPage()
    expect(screen.getByText(`Refreshes every ${minutes} min`)).toBeInTheDocument()
    expect(await screen.findByText(new RegExp(`· every ${minutes} min`))).toBeInTheDocument()
  })

  it('renders nothing but name, status and last check, with no link, button or heading in a row (FR-40, FR-63)', async () => {
    const extra = {
      ...makePublicService({ name: 'Visible name' }),
      url: 'https://secret.example/health',
      check: { type: 'http' },
      last_failure_reason: 'SECRET-REASON',
      type: 'SECRET-TYPE',
    }
    vi.mocked(getPublicDashboard).mockResolvedValue({ services: [extra] })
    renderPage()
    const row = (await screen.findByRole('list', { name: 'Services' })).querySelector('li') as HTMLElement
    expect(document.body.textContent).not.toMatch(/secret|SECRET/)
    expect(within(row).queryByRole('link')).toBeNull()
    expect(within(row).queryByRole('button')).toBeNull()
    expect(within(row).queryByRole('heading')).toBeNull()
  })

  it('renders names as text and shows a 100-character name in full (NFR-7)', async () => {
    const long = 'x'.repeat(100)
    vi.mocked(getPublicDashboard).mockResolvedValue(
      makePublicDashboard(makePublicService({ name: '<b>x</b>' }), makePublicService({ name: long })),
    )
    renderPage()
    expect(await screen.findByText('<b>x</b>')).toBeInTheDocument()
    expect(document.querySelector('.pub-row b')).toBeNull()
    expect(screen.getByText(long)).toBeInTheDocument()
  })
})

describe('Empty', () => {
  it('shows the empty block, the refresh block and the foot line, no summary and no rows (FR-28)', async () => {
    vi.mocked(getPublicDashboard).mockResolvedValue(makePublicDashboard())
    renderPage()
    expect(await screen.findByText('No services to show')).toBeInTheDocument()
    expect(screen.getByText('This status page is on, but no services have been added to it yet.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Service status' })).toBeInTheDocument()
    expect(refreshButton()).toBeEnabled()
    expect(screen.getByText('Times are shown in your local time.')).toBeInTheDocument()
    expect(document.querySelector('.pub-summary')).toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
  })
})

describe('Unavailable', () => {
  it('shows only the message, with no controls, meta, summary, foot line or live region, and never refetches (FR-29)', async () => {
    vi.useFakeTimers()
    vi.mocked(getPublicDashboard).mockRejectedValue(unavailable())
    renderPage()
    await advance(0)
    expect(screen.getByRole('heading', { level: 1, name: 'Service status' })).toBeInTheDocument()
    expect(screen.getByText('This status page isn’t available')).toBeInTheDocument()
    expect(screen.getByText('It has been turned off.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(/every \d+ min/)).toBeNull()
    expect(screen.queryByText('Times are shown in your local time.')).toBeNull()
    expect(document.querySelector('[aria-live]')).toBeNull()
    expect(document.querySelector('.banner, .pub-summary')).toBeNull()
    await advance(INTERVAL * 2)
    expect(getPublicDashboard).toHaveBeenCalledTimes(1)
  })

  it('replaces a list when a refresh is answered 404 public_view_unavailable (FR-29)', async () => {
    const user = userEvent.setup()
    vi.mocked(getPublicDashboard).mockResolvedValueOnce(makePublicDashboard(makePublicService({ status: 'unhealthy' })))
    renderPage()
    expect(await screen.findByRole('list', { name: 'Services' })).toBeInTheDocument()
    vi.mocked(getPublicDashboard).mockRejectedValueOnce(unavailable())
    await user.click(refreshButton())
    expect(await screen.findByText('This status page isn’t available')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByText('1 of 1 service unhealthy')).toBeNull()
    expect(screen.queryByText('API gateway')).toBeNull()
  })
})

describe('Refresh and failures', () => {
  it('Refresh requests once, is disabled and busy while in flight, keeps the rows, then is enabled again (FR-30)', async () => {
    const user = userEvent.setup()
    vi.mocked(getPublicDashboard).mockResolvedValueOnce(makePublicDashboard(makePublicService()))
    renderPage()
    await screen.findByText('API gateway')
    await waitFor(() => expect(refreshButton()).toBeEnabled())
    let answer: (d: ReturnType<typeof makePublicDashboard>) => void = () => {}
    vi.mocked(getPublicDashboard).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    await user.click(refreshButton())
    expect(getPublicDashboard).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(refreshButton()).toHaveTextContent('Refreshing…'))
    expect(refreshButton()).toBeDisabled()
    expect(refreshButton()).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('API gateway')).toBeInTheDocument()
    await act(async () => answer(makePublicDashboard(makePublicService())))
    await waitFor(() => expect(refreshButton()).toHaveTextContent(/^Refresh$/))
    expect(refreshButton()).toBeEnabled()
    expect(refreshButton()).not.toHaveAttribute('aria-busy')
  })

  it('a failed refresh shows the banner in the live region, keeps rows, Retry recovers (FR-30)', async () => {
    const user = userEvent.setup()
    vi.mocked(getPublicDashboard).mockResolvedValueOnce(
      makePublicDashboard(makePublicService({ name: 'One' }), makePublicService({ name: 'Two', status: 'unhealthy' })),
    )
    renderPage()
    await screen.findByText('One')
    vi.mocked(getPublicDashboard).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await user.click(refreshButton())
    const alert = banner('Couldn’t refresh.')
    expect(alert.closest('[aria-live="polite"]')).not.toBeNull()
    expect(alert).toHaveAttribute('role', 'status')
    expect(within(alert).getByText(/^Showing status from /)).toBeInTheDocument()
    expect(screen.getByText('One')).toBeInTheDocument()
    expect(screen.getByText('1 of 2 services unhealthy')).toBeInTheDocument()

    let answer: (d: ReturnType<typeof makePublicDashboard>) => void = () => {}
    vi.mocked(getPublicDashboard).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(within(banner('Couldn’t refresh.')).getByRole('button', { name: 'Retry' })).toBeDisabled())
    await act(async () => answer(makePublicDashboard(makePublicService({ name: 'One' }))))
    await waitFor(() => expect(screen.queryByText('Couldn’t refresh.')).toBeNull())
  })

  it('a failed first load shows the banner with Retry and nothing else, and Retry loads the list', async () => {
    const user = userEvent.setup()
    vi.mocked(getPublicDashboard).mockRejectedValueOnce(problem(500, 'internal_error'))
    renderPage()
    const alert = await waitFor(() => banner('Couldn’t load service status.'))
    expect(alert.querySelectorAll('.banner__body > span')).toHaveLength(1)
    expect(screen.getByText('Refreshes every 5 min')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByText('No services to show')).toBeNull()
    expect(screen.queryByText('Times are shown in your local time.')).toBeNull()
    expect(document.querySelector('.pub-summary')).toBeNull()

    vi.mocked(getPublicDashboard).mockResolvedValueOnce(makePublicDashboard(makePublicService()))
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('list', { name: 'Services' })).toBeInTheDocument()
    expect(screen.queryByText('Couldn’t load service status.')).toBeNull()
  })
})

describe('Too many requests (FR-32)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW })
  })

  it('over rows: counts down, disables Refresh without busy, and refreshes once at zero', async () => {
    vi.mocked(getPublicDashboard).mockResolvedValueOnce(
      makePublicDashboard(makePublicService({ status: 'unhealthy' })),
    )
    renderPage()
    await advance(0)
    vi.mocked(getPublicDashboard).mockRejectedValueOnce(rateLimited(23))
    fireEvent.click(refreshButton())
    await advance(0)
    const alert = banner('Too many requests.')
    expect(alert).toHaveTextContent('Try again in 23 seconds.')
    expect(alert.querySelector('span.tabular')).toHaveTextContent('23')
    expect(alert.querySelector('button')).toBeNull()
    expect(refreshButton()).toBeDisabled()
    expect(refreshButton()).not.toHaveAttribute('aria-busy')
    expect(screen.getByText('1 of 1 service unhealthy')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Services' })).toBeInTheDocument()
    expect(screen.getByText('Times are shown in your local time.')).toBeInTheDocument()

    await advance(1000)
    expect(banner('Too many requests.')).toHaveTextContent('Try again in 22 seconds.')

    vi.mocked(getPublicDashboard).mockResolvedValueOnce(makePublicDashboard(makePublicService()))
    await advance(21_999)
    expect(getPublicDashboard).toHaveBeenCalledTimes(2)
    await advance(1)
    expect(getPublicDashboard).toHaveBeenCalledTimes(3)
    await advance(0)
    expect(screen.queryByText('Too many requests.')).toBeNull()
    expect(refreshButton()).toBeEnabled()
  })

  it('says "1 second" for a Retry-After of 1', async () => {
    vi.mocked(getPublicDashboard).mockRejectedValueOnce(rateLimited(1))
    renderPage()
    await advance(0)
    expect(banner('Too many requests.')).toHaveTextContent('Try again in 1 second.')
  })

  it('over nothing: shows the banner alone, keeps it at 0 while refetching, and clears on success', async () => {
    vi.mocked(getPublicDashboard).mockRejectedValueOnce(rateLimited(23))
    renderPage()
    await advance(0)
    expect(banner('Too many requests.')).toHaveTextContent('Try again in 23 seconds.')
    expect(screen.queryByRole('list')).toBeNull()
    expect(document.querySelector('.pub-summary')).toBeNull()
    expect(screen.queryByText('No services to show')).toBeNull()
    expect(screen.queryByText('Times are shown in your local time.')).toBeNull()
    expect(screen.getByText('Refreshes every 5 min')).toBeInTheDocument()
    expect(refreshButton()).toBeDisabled()

    let answer: (d: ReturnType<typeof makePublicDashboard>) => void = () => {}
    vi.mocked(getPublicDashboard).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    await advance(23_000)
    expect(banner('Too many requests.')).toHaveTextContent('Try again in 0 seconds.')
    await act(async () => answer(makePublicDashboard(makePublicService())))
    await advance(0)
    expect(screen.queryByText('Too many requests.')).toBeNull()
    expect(screen.getByRole('list', { name: 'Services' })).toBeInTheDocument()
  })

  it('without a usable header: says "in a moment", keeps Refresh enabled, makes no call by itself, and a click requests once', async () => {
    vi.mocked(getPublicDashboard).mockRejectedValueOnce(rateLimited(null))
    renderPage()
    await advance(0)
    expect(banner('Too many requests.')).toHaveTextContent('Try again in a moment.')
    expect(refreshButton()).toBeEnabled()
    await advance(23_000)
    await advance(37_000)
    expect(getPublicDashboard).toHaveBeenCalledTimes(1)
    vi.mocked(getPublicDashboard).mockResolvedValueOnce(makePublicDashboard(makePublicService()))
    fireEvent.click(refreshButton())
    await advance(0)
    expect(getPublicDashboard).toHaveBeenCalledTimes(2)
  })
})

describe('No admin chrome', () => {
  it.each([
    ['loading', () => vi.mocked(getPublicDashboard).mockReturnValue(new Promise(() => {}))],
    ['list', () => vi.mocked(getPublicDashboard).mockResolvedValue(makePublicDashboard(makePublicService()))],
    ['empty', () => vi.mocked(getPublicDashboard).mockResolvedValue(makePublicDashboard())],
    ['unavailable', () => vi.mocked(getPublicDashboard).mockRejectedValue(unavailable())],
    ['could not load', () => vi.mocked(getPublicDashboard).mockRejectedValue(problem(500, 'internal_error'))],
  ])('has no sign-out, brand link, top bar or Add service link when %s', async (_name, arrange) => {
    arrange()
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Service status' })
    await waitFor(() => expect(document.querySelector('.pub')).not.toBeNull())
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
