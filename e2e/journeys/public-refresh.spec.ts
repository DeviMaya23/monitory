import { expect, test } from '../support/fixtures'
import {
  createService,
  openStatusPage,
  publicNames,
  serviceName,
  setPublicView,
  signIn,
  visitorRefresh,
  waitForStatus,
} from '../support/helpers'

const UNAVAILABLE = 'This status page isn’t available'

test.describe('M4 journey 4: Refresh and the five-minute update', () => {
  test('M4 journey 4 Refresh and the automatic update pick up changes (FR-29, FR-30, FR-31, FR-112)', async ({
    page,
    site,
    visitor,
    browser,
    app,
  }) => {
    test.setTimeout(120_000)
    const s = serviceName()
    const a = `a-${s}`
    const b = `b-${s}`
    site.route('/a', {})
    site.route('/b', {})
    await signIn(page)
    await setPublicView(page, true)
    await createService(page, { name: a, url: site.url('/a'), alerts: false, shownOnPublic: true })
    await createService(page, { name: b, url: site.url('/b'), alerts: false, shownOnPublic: true })
    await waitForStatus(page, a, 'Healthy')
    await waitForStatus(page, b, 'Healthy')

    // 1. Refresh.
    const v = await visitor.newPage()
    await openStatusPage(v)
    expect(await publicNames(v)).toEqual([a, b])
    await expect(v.getByText('All services healthy')).toBeVisible()
    await expect(v.getByText(/Updated /)).toBeVisible()
    site.route('/a', { status: 503 })
    await waitForStatus(page, a, 'Unhealthy')
    await visitorRefresh(v)
    await expect(v.getByRole('listitem').filter({ hasText: a }).getByText('Unhealthy', { exact: true })).toBeVisible()
    await expect(v.getByText('1 of 2 services unhealthy')).toBeVisible()

    // 2. The five-minute update, on a fresh context with the clock running (never paused).
    const timed = await browser.newContext({ baseURL: app.baseURL })
    try {
      const t = await timed.newPage()
      await t.clock.install()
      await openStatusPage(t)
      const loadedAt = Date.now()
      const rowA = t.getByRole('listitem').filter({ hasText: a })
      expect(await publicNames(t)).toEqual([a, b])
      await expect(rowA.getByText('Unhealthy', { exact: true })).toBeVisible()
      let requests = 0
      t.on('request', (req) => {
        if (new URL(req.url()).pathname === '/api/public/dashboard') requests++
      })
      site.route('/a', {})
      await waitForStatus(page, a, 'Healthy')
      const sinceLoad = Date.now() - loadedAt
      expect(sinceLoad, 'the admin must see /a healthy within a minute of the page load').toBeLessThan(60_000)
      // A moment on the page's own (running) clock, to show that nothing is requested.
      const moment = () => t.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 1_000)))

      await t.clock.fastForward('04:00')
      await moment()
      expect(requests).toBe(0)
      await expect(rowA.getByText('Unhealthy', { exact: true })).toBeVisible()

      await t.clock.fastForward('01:30')
      await expect.poll(() => requests, { message: 'requests after five and a half minutes' }).toBe(1)
      await expect(rowA.getByText('Healthy', { exact: true })).toBeVisible()
      await expect(t.getByText('All services healthy')).toBeVisible()

      // 3. Unavailable replaces the list, and does not come back by itself.
      await setPublicView(page, false)
      await visitorRefresh(t)
      await expect(t.getByText(UNAVAILABLE)).toBeVisible()
      await expect(t.getByRole('button', { name: 'Refresh', exact: true })).toHaveCount(0)
      await expect(t.getByRole('list', { name: 'Services' })).toHaveCount(0)
      const before = requests
      await t.clock.fastForward('10:00')
      await moment()
      expect(requests).toBe(before)
      await setPublicView(page, true)
      await t.goto('/status')
      await expect(t.getByRole('list', { name: 'Services' })).toBeVisible()
      expect(await publicNames(t)).toEqual([a, b])
    } finally {
      await timed.close()
    }
  })
})
