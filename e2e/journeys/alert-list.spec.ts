import { expect, test } from '../support/fixtures'
import { uniqueAddress } from '../support/mailpit'
import {
  addService,
  addTarget,
  fillTarget,
  openAlertList,
  serviceName,
  signIn,
  targetDialog,
  targetRow,
  waitForStatus,
} from '../support/helpers'

test('M2 journey 7: the alert list screen (FR-14, FR-15, FR-16, FR-17, FR-19, FR-80, FR-81, FR-88, FR-100)', async ({
  page,
  stub,
  receiver,
}) => {
  const name = serviceName()
  const opsAddress = uniqueAddress()
  const plainAddress = uniqueAddress()
  await signIn(page)
  await addService(page, name, stub.url)
  await waitForStatus(page, name, 'Healthy')
  await openAlertList(page, name)
  const items = page.getByRole('list', { name: 'Notification targets' }).getByRole('listitem')

  // 1. Add three targets: a named email, an unnamed email, an http:// webhook with a warning.
  await addTarget(page, { type: 'email', name: 'Ops inbox', address: opsAddress })
  await addTarget(page, { type: 'email', address: plainAddress })
  await page.getByRole('button', { name: 'Add target' }).click()
  await fillTarget(page, { type: 'webhook', url: receiver.hookUrl })
  const dialog = targetDialog(page)
  await expect(
    dialog.getByText('This URL uses http://, so the URL and headers are sent unencrypted. You can still save it.'),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Add target' }).click()
  await expect(dialog).toBeHidden()
  await expect(items).toHaveCount(3)
  await expect(items.nth(0)).toContainText('Ops inbox')
  await expect(items.nth(0)).toContainText(opsAddress)
  await expect(items.nth(1)).toContainText('Unnamed email')
  await expect(items.nth(1)).toContainText(plainAddress)
  await expect(items.nth(2)).toContainText(receiver.hookUrl)
  await expect(page.getByText('3 targets · in the order added')).toBeVisible()

  // 2. Duplicates, an address ignoring case, a URL exactly.
  await page.getByRole('button', { name: 'Add target' }).click()
  await fillTarget(page, { type: 'email', address: plainAddress.toUpperCase() })
  await dialog.getByRole('button', { name: 'Add target' }).click()
  await expect(dialog.getByText('This address is already in this service’s alert list.')).toBeVisible()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('radio', { name: 'Webhook' }).check()
  await dialog.getByLabel('Webhook URL').fill(receiver.hookUrl)
  await dialog.getByRole('button', { name: 'Add target' }).click()
  await expect(dialog.getByText('This URL is already in this service’s alert list.')).toBeVisible()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('dialog', { name: 'Discard unsaved changes?' }).getByRole('button', { name: 'Discard changes' }).click()
  await expect(dialog).toBeHidden()
  await expect(items).toHaveCount(3)

  // 3. Edit the named email.
  await page.getByRole('button', { name: 'Edit Ops inbox' }).click()
  await dialog.getByLabel('Name').fill('Night inbox')
  await dialog.getByRole('button', { name: 'Save target' }).click()
  await expect(page.getByText('Target saved.')).toBeVisible()
  await expect(dialog).toBeHidden()
  await expect(items.nth(0)).toContainText('Night inbox')
  await expect(items.nth(0)).not.toContainText('Ops inbox')
  await expect(items).toHaveCount(3)

  // 4. Five in all, then a sixth is refused with what was typed kept.
  await addTarget(page, { type: 'email', address: uniqueAddress() })
  await addTarget(page, { type: 'email', address: uniqueAddress() })
  await expect(items).toHaveCount(5)
  const sixth = uniqueAddress()
  await page.getByRole('button', { name: 'Add target' }).click()
  await fillTarget(page, { type: 'email', address: sixth })
  await dialog.getByRole('button', { name: 'Add target' }).click()
  await expect(dialog.getByText('This alert list is full.')).toBeVisible()
  await expect(dialog.getByText('Remove a target before adding another.')).toBeVisible()
  await expect(dialog.getByLabel('Email address')).toHaveValue(sixth)
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('dialog', { name: 'Discard unsaved changes?' }).getByRole('button', { name: 'Discard changes' }).click()
  await expect(dialog).toBeHidden()
  await expect(items).toHaveCount(5)

  // 5. Remove one, with the inline confirmation.
  await page.getByRole('button', { name: `Remove ${plainAddress}` }).click()
  await expect(items.nth(1).getByText('Remove this target?')).toBeVisible()
  await items.nth(1).getByRole('button', { name: 'Cancel' }).click()
  await expect(items).toHaveCount(5)
  await expect(targetRow(page, plainAddress)).toBeVisible()
  await page.getByRole('button', { name: `Remove ${plainAddress}` }).click()
  await items.nth(1).getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.getByText('Target removed.')).toBeVisible()
  await expect(items).toHaveCount(4)
  await expect(targetRow(page, plainAddress)).toHaveCount(0)
  await page.reload()
  await expect(items).toHaveCount(4)
  await expect(page.getByText('4 targets · in the order added')).toBeVisible()
  await addTarget(page, { type: 'email', address: sixth })
  await expect(items).toHaveCount(5)
})
