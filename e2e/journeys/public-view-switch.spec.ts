import { expect, test } from '../support/fixtures'
import {
  createService,
  openStatusPage,
  publicApi,
  publicNames,
  serviceName,
  setPublicView,
  signIn,
  waitForStatus,
} from '../support/helpers'

const UNAVAILABLE = 'This status page isn’t available'

test.describe('M4 journey 3: the admin’s switch and the unavailable page', () => {
  test('M4 journey 3 the public view is off until the admin turns it on, and the switch works both ways (FR-26, FR-29, NFR-1) @smoke', async ({
    page,
    site,
    visitor,
    app,
  }) => {
    test.setTimeout(90_000)
    const name = serviceName()
    site.route('/c', {})

    // 1. Off by default.
    const v = await visitor.newPage()
    await openStatusPage(v)
    await expect(v.getByText(UNAVAILABLE)).toBeVisible()
    await expect(v.getByText('It has been turned off.')).toBeVisible()
    await expect(v.getByRole('button', { name: 'Refresh', exact: true })).toHaveCount(0)
    await expect(v.getByRole('list', { name: 'Services' })).toHaveCount(0)
    await expect(v.getByText(/services? unhealthy|All services healthy/)).toHaveCount(0)
    const off = await publicApi(visitor.request)
    expect(off.status).toBe(404)
    expect(off.headers['content-type']).toMatch(/^application\/problem\+json/)
    expect(off.json).toEqual({ title: 'Public view unavailable', status: 404, code: 'public_view_unavailable' })

    // 2. On.
    await signIn(page)
    const toggle = page.getByRole('switch', { name: 'Public page', exact: true })
    await expect(toggle).toBeEnabled()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    // The state word is in the switch's label, beside the switch.
    const switchRow = page.locator('label').filter({ has: toggle })
    await expect(switchRow).toContainText('Off')
    await setPublicView(page, true)
    await expect(switchRow).toContainText('On')
    await createService(page, { name, url: site.url('/c'), alerts: false, shownOnPublic: true })
    await waitForStatus(page, name, 'Healthy')
    await v.reload()
    await expect(v.getByRole('list', { name: 'Services' })).toBeVisible()
    expect(await publicNames(v)).toEqual([name])

    // 3. Off again.
    await setPublicView(page, false)
    await v.reload()
    await expect(v.getByText(UNAVAILABLE)).toBeVisible()
    await expect(v.getByText(name)).toHaveCount(0)
    const offAgain = await publicApi(visitor.request)
    expect(offAgain.status).toBe(404)
    expect(offAgain.text).not.toContain(name)
    // The setting is stored: on, restart, still on.
    await setPublicView(page, true)
    await app.restart()
    await signIn(page)
    const after = page.getByRole('switch', { name: 'Public page', exact: true })
    await expect(after).toBeEnabled()
    await expect(after).toHaveAttribute('aria-checked', 'true')
    await v.reload()
    expect(await publicNames(v)).toEqual([name])

    // 4. The Open link.
    const link = page.getByRole('link', { name: 'Open public page (new tab)', exact: true })
    await expect(link).toHaveAttribute('href', '/status')
    await expect(link).toHaveAttribute('target', '_blank')
    const [opened] = await Promise.all([page.context().waitForEvent('page'), link.click()])
    await expect(opened).toHaveURL(/\/status$/)
    await expect(opened.getByRole('heading', { level: 1, name: 'Service status', exact: true })).toBeVisible()
    await expect(opened.getByRole('list', { name: 'Services' }).getByText(name)).toBeVisible()
    await expect(opened.getByRole('button', { name: 'Sign out' })).toHaveCount(0)
    await expect(opened.getByRole('banner')).toHaveCount(0)
  })
})
