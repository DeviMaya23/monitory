import { expect, test } from '../support/fixtures'
import {
  createService,
  fillServiceForm,
  openAddService,
  openEditService,
  openStatusPage,
  publicApi,
  publicNames,
  saveService,
  serviceName,
  serviceRow,
  serviceState,
  setPublicView,
  signIn,
  visitorRefresh,
  waitForPaused,
  waitForStatus,
} from '../support/helpers'

test.describe('M4 journeys 1 and 2: the public status page', () => {
  test('M4 journey 1 an anonymous visitor sees the chosen services and nothing else (FR-28, FR-40, FR-63, FR-112, FR-113, NFR-7) @smoke', async ({
    page,
    site,
    visitor,
  }) => {
    const s = serviceName()
    const b = `B-${s}`
    const a = `a-${s}`
    const x = `<b>x</b>-${s}`
    const d = `d-${s}`
    site.route('/b', {})
    site.route('/a', {})
    site.route('/x', { status: 503 })
    site.route('/d', {})
    await signIn(page)
    await setPublicView(page, true)
    await createService(page, { name: b, url: site.url('/b'), alerts: false, shownOnPublic: true })
    await createService(page, { name: a, url: site.url('/a'), alerts: false, shownOnPublic: true })
    await createService(page, { name: x, url: site.url('/x'), alerts: false, shownOnPublic: true })
    await createService(page, { name: d, url: site.url('/d'), alerts: false, shownOnPublic: false })
    await waitForStatus(page, b, 'Healthy')
    await waitForStatus(page, a, 'Healthy')
    await waitForStatus(page, x, 'Unhealthy')
    await waitForStatus(page, d, 'Healthy')

    const v = await visitor.newPage()
    await openStatusPage(v)
    await expect(v.getByRole('heading', { level: 1, name: 'Service status', exact: true })).toBeVisible()
    // Order ignores case; the markup name sorts first ("<" before "a").
    expect(await publicNames(v)).toEqual([x, a, b])
    const list = v.getByRole('list', { name: 'Services' })
    const rows = list.getByRole('listitem')
    await expect(rows).toHaveCount(3)
    // NFR-7: the markup is text, not an element.
    await expect(rows.nth(0).locator('b')).toHaveCount(0)
    await expect(rows.nth(0)).toContainText(x)

    const words = ['Unhealthy', 'Healthy', 'Healthy']
    for (const [i, word] of words.entries()) {
      const row = rows.nth(i)
      await expect(row.getByText(word, { exact: true })).toBeVisible()
      await expect(row.getByText('Last checked', { exact: true })).toBeVisible()
      const iso = await row.locator('time').getAttribute('datetime')
      expect(iso, 'datetime of the row').toBeTruthy()
      const age = Date.now() - new Date(iso!).getTime()
      expect(age).toBeGreaterThanOrEqual(-5_000)
      expect(age).toBeLessThan(60_000)
    }
    await expect(v.getByText('1 of 3 services unhealthy')).toBeVisible()

    // Nothing else: no URL, port, failure reason or admin controls.
    const text = (await list.textContent()) ?? ''
    expect(text).not.toContain('http')
    expect(text).not.toContain(new URL(site.url('/a')).port)
    expect(text).not.toContain('Returned an HTTP error')
    await expect(v.getByRole('link', { name: /^(Edit|Alerts) /i })).toHaveCount(0)
    await expect(v.getByRole('button', { name: /^Pause /i })).toHaveCount(0)
    await expect(v.getByRole('button', { name: 'Sign out' })).toHaveCount(0)
    await expect(v.getByRole('link', { name: /Add service|Services|Settings|Sign out/i })).toHaveCount(0)

    // The raw API.
    const api = await publicApi(visitor.request)
    expect(api.status).toBe(200)
    expect(api.headers['content-type']).toMatch(/^application\/json/)
    const body = api.json as { services: Record<string, unknown>[] }
    expect(Object.keys(body)).toEqual(['services'])
    expect(body.services.map((svc) => svc.name)).toEqual([x, a, b])
    for (const svc of body.services) {
      expect(Object.keys(svc).sort()).toEqual(['last_checked_at', 'name', 'status'])
      expect(['healthy', 'unhealthy']).toContain(svc.status)
    }
    expect(api.text).not.toContain(new URL(site.url('/a')).port)
  })

  test('M4 journey 2 what the public view must not show (FR-27, FR-68, FR-77, FR-78, FR-112, FR-113)', async ({
    page,
    site,
    visitor,
  }) => {
    test.setTimeout(120_000)
    const s = serviceName()
    const n = `new-${s}`
    const p = `pending-${s}`
    site.route('/n', {})
    site.route('/p', { status: 503 })
    await signIn(page)
    await setPublicView(page, true)

    // 1. A new service starts hidden.
    await openAddService(page)
    await fillServiceForm(page, { name: n, url: site.url('/n'), alerts: false })
    await expect(page.getByRole('switch', { name: 'Show on public page', exact: true })).toHaveAttribute('aria-checked', 'false')
    await saveService(page)
    await waitForStatus(page, n, 'Healthy')
    const v = await visitor.newPage()
    await openStatusPage(v)
    await expect(v.getByText('No services to show')).toBeVisible()
    await expect(v.getByText(/services? unhealthy|All services healthy/)).toHaveCount(0)

    // 2. Chosen: it appears.
    await openEditService(page, n)
    await fillServiceForm(page, { shownOnPublic: true, timing: null })
    await saveService(page)
    await visitorRefresh(v)
    expect(await publicNames(v)).toEqual([n])
    await expect(v.getByRole('listitem').filter({ hasText: n }).getByText('Healthy', { exact: true })).toBeVisible()

    // 3. Not yet checked: hidden until its last retry.
    await createService(page, {
      name: p,
      url: site.url('/p'),
      alerts: false,
      shownOnPublic: true,
      timing: { interval: 60, timeout: 1, retries: 3, retryInterval: 10 },
    })
    const unchecked = serviceRow(page, p).getByText('Not checked yet', { exact: true })
    await expect(unchecked).toBeVisible()
    await visitorRefresh(v)
    expect(await publicNames(v)).toEqual([n])
    expect((await publicApi(visitor.request)).text).not.toContain(p)
    // The window was still open after the visitor's read.
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(unchecked).toBeVisible()
    await waitForStatus(page, p, 'Unhealthy', 60_000)
    await visitorRefresh(v)
    expect(await publicNames(v)).toEqual([n, p].sort((l, r) => l.toLowerCase().localeCompare(r.toLowerCase())))
    await expect(v.getByRole('listitem').filter({ hasText: p }).getByText('Unhealthy', { exact: true })).toBeVisible()

    // 4. Paused: hidden, state kept.
    await page.getByRole('button', { name: `Pause ${n}`, exact: true }).click()
    await waitForPaused(page, n, true)
    const paused = await serviceState(page, n)
    expect(paused.paused).toBe(true)
    expect(paused.state.status).toBe('healthy')
    await visitorRefresh(v)
    expect(await publicNames(v)).toEqual([p])
    expect((await publicApi(visitor.request)).text).not.toContain(n)

    // 5. Resumed: it comes back.
    await page.getByRole('button', { name: `Resume ${n}`, exact: true }).click()
    await waitForPaused(page, n, false)
    await waitForStatus(page, n, 'Healthy')
    await visitorRefresh(v)
    expect(await publicNames(v)).toContain(n)
  })
})
