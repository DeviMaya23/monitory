import { expect, test } from '../support/fixtures'
import { messagesTo, uniqueAddress, utcStampNear, waitForMessages } from '../support/mailpit'
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

test('M2 journey 1: the email chain (FR-14, FR-21, FR-22, FR-23, FR-25, FR-81, FR-93, NFR-7) @smoke', async ({
  page,
  stub,
}) => {
  test.setTimeout(120_000)
  const name = serviceName()
  const address = uniqueAddress()
  await signIn(page)
  await addService(page, name, stub.url)
  await waitForStatus(page, name, 'Healthy')

  await openAlertList(page, name)
  await expect(page.getByText('No notification targets')).toBeVisible()
  await addTarget(page, { type: 'email', address })
  await expect(page.getByText('Target added.')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Notification targets' }).getByText(address)).toBeVisible()
  await page.getByRole('link', { name: 'Services', exact: true }).click()

  stub.setStatus(503)
  await waitForStatus(page, name, 'Unhealthy')
  const down = await waitForMessages(address, 1)
  expect(down).toHaveLength(1)
  expect(down[0].from).toBe('monitory@e2e.test')
  expect(down[0].to).toEqual([address])
  expect(down[0].subject).toBe(`${name} is unhealthy`)
  const lines = down[0].text.replace(/\n$/, '').split('\n')
  expect(lines).toHaveLength(4)
  expect(lines[0]).toBe(`Service: ${name}`)
  expect(lines[1]).toBe('Status: Unhealthy')
  expect(lines[2]).toMatch(/^Time: \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/)
  expect(utcStampNear(lines[2].replace('Time: ', ''))).toBe(true)
  expect(lines[3]).toBe('The service failed its check.')
  expect(down[0].html).toBe('')

  await settle(page)
  expect(await messagesTo(address)).toHaveLength(1)

  stub.setStatus(200)
  await waitForStatus(page, name, 'Healthy')
  const up = await waitForMessages(address, 2)
  expect(up).toHaveLength(2)
  expect(up[1].subject).toBe(`${name} is healthy again`)
  const upLines = up[1].text.replace(/\n$/, '').split('\n')
  expect(upLines[0]).toBe(`Service: ${name}`)
  expect(upLines[1]).toBe('Status: Healthy')
  expect(upLines[3]).toBe('The service is healthy again.')
  expect(up[1].html).toBe('')

  await settle(page)
  expect(await messagesTo(address)).toHaveLength(2)
})

test('M2 journey 8: a restart sends no duplicate alert (FR-111)', async ({ page, app, stub }) => {
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
  await waitForMessages(address, 1)

  await app.restart()
  await signIn(page)
  await expect(serviceRow(page, name)).toBeVisible()
  await waitForStatus(page, name, 'Unhealthy')
  const before = stub.count()
  await waitForCount(() => stub.count(), before + 2)
  await waitForStatus(page, name, 'Unhealthy')
  expect(await messagesTo(address)).toHaveLength(1)

  stub.setStatus(200)
  await waitForStatus(page, name, 'Healthy')
  const mails = await waitForMessages(address, 2)
  expect(mails[1].subject).toBe(`${name} is healthy again`)
})
