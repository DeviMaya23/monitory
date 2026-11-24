import { expect, test } from '../support/fixtures'
import { createService, openStatusPage, publicApi, publicNames, serviceName, setPublicView, signIn, waitForStatus } from '../support/helpers'

// The limit is 3 a minute for these journeys only; the app's environment stays explicit.
test.use({ appOverrides: { PUBLIC_RATE_LIMIT_PER_MINUTE: '3' } })

test.describe('M4 journeys 5 and 6: the rate limit', () => {
  test('M4 journey 5 the rate limit refuses with a countdown and recovers by itself (FR-32, FR-99, FR-96, FR-4)', async ({
    page,
    site,
    visitor,
  }) => {
    test.setTimeout(180_000)
    const name = `r-${serviceName()}`
    site.route('/r', {})
    await signIn(page)
    await setPublicView(page, true)
    await createService(page, { name, url: site.url('/r'), alerts: false, shownOnPublic: true })
    await waitForStatus(page, name, 'Healthy')

    // 2. Three requests pass, the fourth and fifth are refused.
    for (let i = 1; i <= 3; i++) expect((await publicApi(visitor.request)).status, `request ${i}`).toBe(200)
    const retryAfter = (headers: Record<string, string>) => {
      const value = headers['retry-after']
      expect(value, 'Retry-After').toMatch(/^\d+$/)
      return Number(value)
    }
    const fourth = await publicApi(visitor.request)
    expect(fourth.status).toBe(429)
    expect(fourth.headers['content-type']).toMatch(/^application\/problem\+json/)
    expect(fourth.json).toEqual({ title: 'Too many requests', status: 429, code: 'rate_limited' })
    const first = retryAfter(fourth.headers)
    expect(first).toBeGreaterThanOrEqual(1)
    expect(first).toBeLessThanOrEqual(60)
    const fifth = await publicApi(visitor.request)
    expect(fifth.status).toBe(429)
    const second = retryAfter(fifth.headers)
    expect(second).toBeGreaterThanOrEqual(1)
    expect(second).toBeLessThanOrEqual(first)
    // A refused request does not extend the window: with the same window running, the header falls
    // (right after the window starts it reads 60, so two reads in a row cannot tell the difference).
    await expect
      .poll(async () => retryAfter((await publicApi(visitor.request)).headers), {
        intervals: [500],
        timeout: 10_000,
        message: 'Retry-After falls while the visitor keeps being refused',
      })
      .toBeLessThan(first)

    // 3. The page shows the refusal and a falling countdown.
    const v = await visitor.newPage()
    await openStatusPage(v)
    await expect(v.getByText('Too many requests.')).toBeVisible()
    await expect(v.getByRole('list', { name: 'Services' })).toHaveCount(0)
    await expect(v.getByText(/services? unhealthy|All services healthy/)).toHaveCount(0)
    await expect(v.getByRole('button', { name: 'Refresh', exact: true })).toBeDisabled()
    const seconds = async () => {
      const text = (await v.getByText(/^Try again in \d+ seconds?\.$/).textContent()) ?? ''
      return Number(/\d+/.exec(text)![0])
    }
    const n1 = await seconds()
    expect(n1).toBeGreaterThanOrEqual(1)
    expect(n1).toBeLessThanOrEqual(second)
    await expect.poll(seconds, { intervals: [500], timeout: 10_000, message: 'the countdown goes down' }).toBeLessThan(n1)

    // 4. Health and the admin's API are not limited.
    expect((await visitor.request.get('/health')).status()).toBe(200)
    const services = await page.request.get('/api/services')
    expect(services.status()).toBe(200)
    expect(((await services.json()) as { name: string }[]).map((s) => s.name)).toEqual([name])

    // 5. At the end of the window the page lists the service by itself.
    await expect(v.getByRole('list', { name: 'Services' })).toBeVisible({ timeout: 75_000 })
    expect(await publicNames(v)).toEqual([name])
    await expect(v.getByText('Too many requests.')).toHaveCount(0)
    await expect(v.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()

    // 6. A new window: the page's refresh was its first request.
    expect((await publicApi(visitor.request)).status).toBe(200)
    expect((await publicApi(visitor.request)).status).toBe(200)
    expect((await publicApi(visitor.request)).status).toBe(429)
  })

  test('M4 journey 6 the counters are not stored (FR-32, CONVENTIONS rule 12)', async ({ page, site, visitor, app }) => {
    const name = serviceName()
    site.route('/r', {})
    await signIn(page)
    await setPublicView(page, true)
    await createService(page, { name, url: site.url('/r'), alerts: false, shownOnPublic: true })
    await waitForStatus(page, name, 'Healthy')

    const statuses = async (n: number) => {
      const out: number[] = []
      for (let i = 0; i < n; i++) out.push((await publicApi(visitor.request)).status)
      return out
    }
    expect(await statuses(4)).toEqual([200, 200, 200, 429])
    await app.restart()
    // A fresh window, and the setting (the view on) is stored.
    expect(await statuses(4)).toEqual([200, 200, 200, 429])
  })
})
