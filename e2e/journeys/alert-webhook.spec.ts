import { randomBytes } from 'node:crypto'
import { expect, test } from '../support/fixtures'
import { messagesTo, uniqueAddress, waitForMessages } from '../support/mailpit'
import {
  addService,
  addTarget,
  openAlertList,
  serviceName,
  serviceRow,
  settle,
  signIn,
  waitForCount,
  waitForStatus,
} from '../support/helpers'

const KEYS = ['changed_at', 'message', 'service_name', 'status']

test('M2 journey 2: the webhook chain and a mixed list (FR-23, FR-83, FR-90, FR-92, FR-93, NFR-7) @smoke', async ({
  page,
  stub,
  receiver,
}) => {
  test.setTimeout(120_000)
  const name = `<b>E2E</b> hook ${randomBytes(4).toString('hex')}`
  const address = uniqueAddress()
  await signIn(page)
  await addService(page, name, stub.url)
  await waitForStatus(page, name, 'Healthy')
  await openAlertList(page, name)
  await addTarget(page, {
    type: 'webhook',
    url: receiver.hookUrl,
    headers: [{ name: 'X-E2E-Token', value: 'abc123' }],
  })
  await addTarget(page, { type: 'email', address })
  // The name is text: the angle brackets show and no element is made of it (NFR-7).
  await expect(page.getByRole('heading', { level: 1, name: `Alert list: ${name}` })).toBeVisible()
  await expect(page.locator('h1 b')).toHaveCount(0)
  await page.getByRole('link', { name: 'Services', exact: true }).click()
  await expect(serviceRow(page, name)).toContainText(name)
  await expect(page.locator('main b')).toHaveCount(0)

  stub.setStatus(503)
  await waitForStatus(page, name, 'Unhealthy')
  await waitForCount(() => receiver.hookCount(), 1)
  const first = receiver.hookRequests()
  expect(first).toHaveLength(1)
  expect(first[0].method).toBe('POST')
  expect(first[0].headers['content-type']).toMatch(/^application\/json/)
  expect(first[0].headers['x-e2e-token']).toBe('abc123')
  expect(Object.keys(first[0].json ?? {}).sort()).toEqual(KEYS)
  expect(first[0].json?.service_name).toBe(name)
  expect(first[0].json?.status).toBe('unhealthy')
  const changedAt = String(first[0].json?.changed_at)
  expect(changedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/)
  expect(Math.abs(Date.now() - Date.parse(changedAt))).toBeLessThan(3 * 60_000)
  expect(first[0].json?.message).toBe('The service failed its check.')
  const down = await waitForMessages(address, 1)
  expect(down[0].subject).toBe(`${name} is unhealthy`)

  stub.setStatus(200)
  await waitForStatus(page, name, 'Healthy')
  await waitForCount(() => receiver.hookCount(), 2)
  const second = receiver.hookRequests()[1]
  expect(second.json?.status).toBe('healthy')
  expect(second.json?.message).toBe('The service is healthy again.')
  expect(Object.keys(second.json ?? {}).sort()).toEqual(KEYS)
  const mails = await waitForMessages(address, 2)
  expect(mails[1].subject).toBe(`${name} is healthy again`)
})

test.describe('M2 journey 3: messages and alerts off', () => {
  test('custom messages (FR-65, FR-23, NFR-7)', async ({ page, stub, receiver }) => {
    test.setTimeout(120_000)
    const name = serviceName()
    const address = uniqueAddress()
    await signIn(page)
    await addService(page, name, stub.url, { unhealthyMessage: 'Disk <b>full</b>', recoveryMessage: 'Disk ok again' })
    await waitForStatus(page, name, 'Healthy')
    await openAlertList(page, name)
    await addTarget(page, { type: 'email', address })
    await addTarget(page, { type: 'webhook', url: receiver.hookUrl })
    await page.getByRole('link', { name: 'Services', exact: true }).click()

    stub.setStatus(503)
    await waitForStatus(page, name, 'Unhealthy')
    const down = await waitForMessages(address, 1)
    expect(down[0].text.replace(/\n$/, '').split('\n')[3]).toBe('Disk <b>full</b>')
    expect(down[0].html).toBe('')
    await waitForCount(() => receiver.hookCount(), 1)
    expect(receiver.hookRequests()[0].json?.message).toBe('Disk <b>full</b>')

    stub.setStatus(200)
    await waitForStatus(page, name, 'Healthy')
    const up = await waitForMessages(address, 2)
    expect(up[1].text.replace(/\n$/, '').split('\n')[3]).toBe('Disk ok again')
    expect(up[1].html).toBe('')
    await waitForCount(() => receiver.hookCount(), 2)
    expect(receiver.hookRequests()[1].json?.message).toBe('Disk ok again')
  })

  test('alerts off sends nothing (FR-20)', async ({ page, stub }) => {
    test.setTimeout(120_000)
    const name = serviceName()
    const address = uniqueAddress()
    await signIn(page)
    await addService(page, name, stub.url, { alerts: false })
    await waitForStatus(page, name, 'Healthy')
    await openAlertList(page, name)
    await addTarget(page, { type: 'email', address })
    await expect(page.getByText('Alerts are off for this service.')).toBeVisible()
    await page.getByRole('link', { name: 'Services', exact: true }).click()

    stub.setStatus(503)
    await waitForStatus(page, name, 'Unhealthy')
    await settle(page)
    expect(await messagesTo(address)).toHaveLength(0)

    stub.setStatus(200)
    await waitForStatus(page, name, 'Healthy')
    await settle(page)
    expect(await messagesTo(address)).toHaveLength(0)
  })
})
