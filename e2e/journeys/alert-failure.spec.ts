import { expect, test } from '../support/fixtures'
import { messagesTo, uniqueAddress, waitForMessages } from '../support/mailpit'
import {
  addService,
  addTarget,
  listTargets,
  openAlertList,
  serviceId,
  serviceName,
  settle,
  signIn,
  targetRow,
  waitForCount,
  waitForDeliveryNotice,
  waitForStatus,
  waitForTargetNotice,
} from '../support/helpers'

const NOTICE = 'Last delivery failed. Shown until a later delivery succeeds.'

test.describe('M2 journey 4: a failed webhook, its retries and the notice', () => {
  test('retries, the notice and recovery (FR-83, FR-84, FR-85, FR-86)', async ({ page, stub, receiver }) => {
    test.setTimeout(120_000)
    const name = serviceName()
    const address = uniqueAddress()
    await signIn(page)
    await addService(page, name, stub.url)
    await waitForStatus(page, name, 'Healthy')
    await openAlertList(page, name)
    await addTarget(page, { type: 'webhook', url: receiver.hookUrl })
    await addTarget(page, { type: 'email', address })
    await page.getByRole('link', { name: 'Services', exact: true }).click()

    receiver.setStatus(500)
    stub.setStatus(503)
    await waitForStatus(page, name, 'Unhealthy')
    // One failing target does not hold up the other (FR-83).
    await waitForMessages(address, 1)

    await waitForCount(() => receiver.hookCount(), 3)
    const hooks = receiver.hookRequests()
    expect(hooks).toHaveLength(3)
    for (const hook of hooks) {
      expect(hook.json?.status).toBe('unhealthy')
      expect(hook.json?.service_name).toBe(name)
    }
    for (const i of [1, 2]) {
      const gap = hooks[i].at - hooks[i - 1].at
      expect(gap).toBeGreaterThanOrEqual(1_500)
      expect(gap).toBeLessThanOrEqual(6_000)
    }

    await waitForDeliveryNotice(page, name, true)
    await waitForStatus(page, name, 'Unhealthy')
    const id = await serviceId(page, name)
    await openAlertList(page, name)
    await waitForTargetNotice(page, receiver.hookUrl, true)
    await expect(targetRow(page, address).getByText(NOTICE)).toHaveCount(0)
    const targets = await listTargets(page, id)
    expect(targets.find((t) => t.type === 'webhook')?.last_delivery_failed).toBe(true)
    expect(targets.find((t) => t.type === 'email')?.last_delivery_failed).toBeFalsy()
    await settle(page)
    expect(receiver.hookCount()).toBe(3)
    await page.reload()
    await expect(targetRow(page, receiver.hookUrl).getByText(NOTICE)).toBeVisible()

    receiver.setStatus(200)
    stub.setStatus(200)
    await page.getByRole('link', { name: 'Services', exact: true }).click()
    await waitForStatus(page, name, 'Healthy')
    await waitForCount(() => receiver.hookCount(), 4)
    expect(receiver.hookRequests()[3].json?.status).toBe('healthy')
    await waitForDeliveryNotice(page, name, false)
    await openAlertList(page, name)
    await waitForTargetNotice(page, receiver.hookUrl, false)
    const after = await listTargets(page, id)
    expect(after.find((t) => t.type === 'webhook')?.last_delivery_failed).toBeFalsy()
  })

  test('a redirect is not followed (FR-115)', async ({ page, stub, receiver }) => {
    test.setTimeout(120_000)
    const name = serviceName()
    await signIn(page)
    await addService(page, name, stub.url)
    await waitForStatus(page, name, 'Healthy')
    await openAlertList(page, name)
    await addTarget(page, { type: 'webhook', url: receiver.hookUrl })
    await page.getByRole('link', { name: 'Services', exact: true }).click()

    receiver.setRedirect(true)
    stub.setStatus(503)
    await waitForStatus(page, name, 'Unhealthy')
    await waitForCount(() => receiver.hookCount(), 3)
    await openAlertList(page, name)
    await waitForTargetNotice(page, receiver.hookUrl, true)
    expect(receiver.hookCount()).toBe(3)
    expect(receiver.requests().filter((r) => r.path === '/elsewhere')).toHaveLength(0)
  })
})

test.describe('M2 journey 5: no SMTP account', () => {
  test.use({ appOverrides: { SMTP_HOST: '' } })

  test('a missing account is a failed delivery (FR-84, FR-85, FR-86)', async ({ page, stub }) => {
    test.setTimeout(120_000)
    const name = serviceName()
    const address = uniqueAddress()
    await signIn(page)
    await addService(page, name, stub.url)
    await waitForStatus(page, name, 'Healthy')
    await openAlertList(page, name)
    await addTarget(page, { type: 'email', address })
    await page.getByRole('link', { name: 'Services', exact: true }).click()

    stub.setStatus(503)
    await waitForStatus(page, name, 'Unhealthy')
    await waitForDeliveryNotice(page, name, true)
    await openAlertList(page, name)
    await waitForTargetNotice(page, address, true)
    expect(await messagesTo(address)).toHaveLength(0)
    await page.getByRole('link', { name: 'Services', exact: true }).click()
    await waitForStatus(page, name, 'Unhealthy')
  })
})
