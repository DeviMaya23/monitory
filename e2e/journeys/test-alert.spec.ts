import { expect, test } from '../support/fixtures'
import type { Page } from '@playwright/test'
import { messagesTo, uniqueAddress, utcStampNear, waitForMessages } from '../support/mailpit'
import {
  addService,
  addTarget,
  fillTarget,
  listTargets,
  openAlertList,
  serviceId,
  serviceName,
  settle,
  signIn,
  targetDialog,
  waitForStatus,
} from '../support/helpers'

async function openList(page: Page, name: string, stubUrl: string): Promise<void> {
  await signIn(page)
  await addService(page, name, stubUrl)
  await waitForStatus(page, name, 'Healthy')
  await openAlertList(page, name)
}

async function openAddDialog(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add target' }).click()
  await expect(targetDialog(page)).toBeVisible()
}

async function cancelAndDiscard(page: Page): Promise<void> {
  await targetDialog(page).getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('dialog', { name: 'Discard unsaved changes?' }).getByRole('button', { name: 'Discard changes' }).click()
  await expect(targetDialog(page)).toBeHidden()
}

test.describe('M2 journey 6: the test alert', () => {
  test('email, delivered (FR-107, FR-93, FR-108)', async ({ page, stub }) => {
    const name = serviceName()
    const address = uniqueAddress()
    await openList(page, name, stub.url)
    const id = await serviceId(page, name)
    await openAddDialog(page)
    await fillTarget(page, { type: 'email', address })
    const dialog = targetDialog(page)
    await dialog.getByRole('button', { name: 'Send test alert' }).click()
    await expect(dialog.getByText('Delivered.')).toBeVisible()

    const mails = await waitForMessages(address, 1)
    expect(mails).toHaveLength(1)
    expect(mails[0].subject).toBe(`Test alert for ${name}`)
    const lines = mails[0].text.replace(/\n$/, '').split('\n')
    expect(lines[0]).toBe(`Service: ${name}`)
    expect(lines[1]).toBe('Status: Test')
    expect(lines[2]).toMatch(/^Time: .+ UTC$/)
    expect(utcStampNear(lines[2].replace('Time: ', ''))).toBe(true)
    expect(lines[3]).toBe('This is a test alert from Monitory. No service has changed status.')

    await cancelAndDiscard(page)
    await expect(page.getByText('No notification targets')).toBeVisible()
    await expect(page.getByText('Target added.')).toHaveCount(0)
    expect(await listTargets(page, id)).toHaveLength(0)
  })

  test('webhook, delivered and failed (FR-107, FR-85, FR-108)', async ({ page, stub, receiver }) => {
    test.setTimeout(120_000)
    const name = serviceName()
    await openList(page, name, stub.url)
    await openAddDialog(page)
    await fillTarget(page, {
      type: 'webhook',
      url: receiver.hookUrl,
      headers: [{ name: 'X-E2E-Token', value: 'abc123' }],
    })
    const dialog = targetDialog(page)
    receiver.setDelay(500)
    await dialog.getByRole('button', { name: 'Send test alert' }).click()
    await expect(dialog.getByText('Sending one test alert…')).toBeVisible()
    await expect(dialog.getByText('Delivered.')).toBeVisible()
    expect(receiver.hookCount()).toBe(1)
    const sent = receiver.hookRequests()[0]
    expect(sent.json?.status).toBe('test')
    expect(Object.keys(sent.json ?? {}).sort()).toEqual(['changed_at', 'message', 'service_name', 'status'])
    expect(sent.headers['x-e2e-token']).toBe('abc123')

    receiver.setDelay(0)
    receiver.setStatus(500)
    await dialog.getByRole('button', { name: 'Send test alert' }).click()
    await expect(dialog.getByText('Failed: the webhook answered with status 500')).toBeVisible()
    await settle(page)
    expect(receiver.hookCount()).toBe(2)

    await cancelAndDiscard(page)
    await expect(page.getByText('No notification targets')).toBeVisible()
    expect(await listTargets(page, await serviceId(page, name))).toHaveLength(0)
    await page.getByRole('link', { name: 'Services', exact: true }).click()
    await waitForStatus(page, name, 'Healthy')
  })

  test('only the target in the form (FR-107, FR-108)', async ({ page, stub }) => {
    test.setTimeout(120_000)
    const name = serviceName()
    const a = uniqueAddress()
    const b = uniqueAddress()
    await openList(page, name, stub.url)
    await addTarget(page, { type: 'email', address: a })
    await addTarget(page, { type: 'email', address: b })
    await page.getByRole('button', { name: `Edit ${a}` }).click()
    const dialog = targetDialog(page)
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Send test alert' }).click()
    await expect(dialog.getByText('Delivered.')).toBeVisible()
    await waitForMessages(a, 1)
    await settle(page)
    expect(await messagesTo(a)).toHaveLength(1)
    expect(await messagesTo(b)).toHaveLength(0)
    await expect(page.getByText('Last delivery failed.')).toHaveCount(0)
    // The form is unchanged, so Cancel closes at once.
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toHaveCount(0)
  })

  test.describe('without an SMTP account', () => {
    test.use({ appOverrides: { SMTP_HOST: '' } })

    test('no SMTP account (FR-107)', async ({ page, stub }) => {
      const name = serviceName()
      await openList(page, name, stub.url)
      await openAddDialog(page)
      await fillTarget(page, { type: 'email', address: uniqueAddress() })
      const dialog = targetDialog(page)
      await dialog.getByRole('button', { name: 'Send test alert' }).click()
      await expect(dialog.getByText('Failed: no SMTP account configured')).toBeVisible()
    })
  })

  test('invalid settings send nothing (FR-108, FR-89)', async ({ page, stub, receiver }) => {
    const name = serviceName()
    await openList(page, name, stub.url)
    await openAddDialog(page)
    const dialog = targetDialog(page)
    const send = dialog.getByRole('button', { name: 'Send test alert' })

    await send.click()
    await expect(dialog.getByText('Enter an email address.')).toBeVisible()
    await expect(dialog.getByLabel('Email address')).toBeFocused()

    await dialog.getByRole('radio', { name: 'Webhook' }).check()
    await send.click()
    await expect(dialog.getByText('Enter a URL that starts with http:// or https://.')).toBeVisible()
    await expect(dialog.getByLabel('Webhook URL')).toBeFocused()
    expect(receiver.count()).toBe(0)

    await dialog.getByLabel('Webhook URL').fill('ftp://x.test')
    await send.click()
    await expect(dialog.getByText('1 field needs fixing before this can be saved.')).toBeVisible()
    await expect(dialog.getByLabel('Webhook URL')).toHaveAttribute('aria-invalid', 'true')
    expect(receiver.count()).toBe(0)
  })
})
