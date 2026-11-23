import { expect, test } from '../support/fixtures'
import { messagesTo, uniqueAddress, waitForMessages } from '../support/mailpit'
import {
  addTarget,
  fillServiceForm,
  openAddService,
  openAlertList,
  saveService,
  serviceName,
  serviceRow,
  serviceState,
  settle,
  signIn,
  waitForCount,
  waitForPaused,
  waitForReason,
  waitForStatus,
} from '../support/helpers'

const timing60 = { interval: 60, timeout: 1, retries: 1, retryInterval: 1 }

test.describe('M3 journey 8: pause and resume', () => {
  test('M3 journey 8 pause stops checks and alerts, resume checks at once (FR-75, FR-76, FR-78, FR-79)', async ({
    page,
    site,
  }) => {
    test.setTimeout(180_000)
    site.route('/', {})
    const name = serviceName()
    const address = uniqueAddress()
    await signIn(page)
    await openAddService(page)
    await fillServiceForm(page, { name, url: site.url(), timing: timing60 })
    await saveService(page)
    await waitForStatus(page, name, 'Healthy')
    await openAlertList(page, name)
    await addTarget(page, { type: 'email', address })
    await page.getByRole('link', { name: 'Services', exact: true }).click()
    await waitForStatus(page, name, 'Healthy')

    const beforePause = site.count()
    await page.getByRole('button', { name: `Pause ${name}`, exact: true }).click()
    await expect(page.getByText(`“${name}” paused. Checks and alerts stopped.`)).toBeVisible()
    await waitForPaused(page, name, true)
    const row = serviceRow(page, name)
    await expect(row.getByText('Paused', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: `Resume ${name}`, exact: true })).toBeVisible()
    const paused = await serviceState(page, name)
    expect(paused.paused).toBe(true)
    expect(paused.state.status).toBe('healthy')

    // The site fails while the service is paused: no check, no mail.
    site.route('/', { status: 503 })
    await settle(page)
    expect(site.count()).toBe(beforePause)
    expect(await messagesTo(address)).toHaveLength(0)

    // Resume checks at once: the interval is 60 s, so no scheduled check could have run.
    await page.getByRole('button', { name: `Resume ${name}`, exact: true }).click()
    await expect(page.getByText(`“${name}” resumed. Checking now.`)).toBeVisible()
    await expect.poll(() => site.count(), { intervals: [250], timeout: 5_000 }).toBeGreaterThan(beforePause)
    await waitForStatus(page, name, 'Unhealthy')
    const mail = await waitForMessages(address, 1)
    expect(mail).toHaveLength(1)
    await waitForPaused(page, name, false)
  })

  test('M3 journey 8 a paused service keeps its state (FR-78)', async ({ page, site }) => {
    test.setTimeout(180_000)
    site.route('/', { status: 503 })
    const name = serviceName()
    await signIn(page)
    await openAddService(page)
    await fillServiceForm(page, { name, url: site.url(), alerts: false })
    await saveService(page)
    await waitForStatus(page, name, 'Unhealthy')
    const before = await serviceState(page, name)
    expect(before.state.last_failure_reason?.code).toBe('non_2xx_status')

    await page.getByRole('button', { name: `Pause ${name}`, exact: true }).click()
    await waitForPaused(page, name, true)
    const afterPause = await serviceState(page, name)
    await settle(page)
    const afterSettle = await serviceState(page, name)
    for (const after of [afterPause, afterSettle]) {
      expect(after.paused).toBe(true)
      expect(after.state.status).toBe('unhealthy')
      expect(after.state.last_failure_reason).toEqual(before.state.last_failure_reason)
      expect(after.state.last_status_change_at).toBe(before.state.last_status_change_at)
    }
    // The row shows Paused instead of the failure (FR-62).
    await waitForReason(page, name, null)
    await expect(serviceRow(page, name).getByText('Paused', { exact: true }).first()).toBeVisible()

    // The site is healthy again, but the service is paused: no check runs.
    site.route('/', {})
    const count = site.count()
    await settle(page)
    expect(site.count()).toBe(count)
    expect((await serviceState(page, name)).state.status).toBe('unhealthy')

    await page.getByRole('button', { name: `Resume ${name}`, exact: true }).click()
    await waitForStatus(page, name, 'Healthy')
  })

  test('M3 journey 8 a restart keeps it paused (FR-111)', async ({ page, site, stub, app }) => {
    test.setTimeout(180_000)
    site.route('/', {})
    const paused = serviceName()
    const live = serviceName()
    await signIn(page)
    await openAddService(page)
    await fillServiceForm(page, { name: paused, url: site.url(), alerts: false })
    await saveService(page)
    await waitForStatus(page, paused, 'Healthy')
    await page.getByRole('button', { name: `Pause ${paused}`, exact: true }).click()
    await waitForPaused(page, paused, true)
    await openAddService(page)
    await fillServiceForm(page, { name: live, url: stub.url, alerts: false })
    await saveService(page)
    await waitForStatus(page, live, 'Healthy')

    const siteCount = site.count()
    const stubCount = stub.count()
    await app.restart()
    await signIn(page)
    await waitForPaused(page, paused, true)
    await waitForCount(() => stub.count(), stubCount + 1)
    await settle(page)
    expect(site.count()).toBe(siteCount)
    await waitForStatus(page, live, 'Healthy')
  })
})
