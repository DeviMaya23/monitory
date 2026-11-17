import { randomBytes } from 'node:crypto'
import { expect, type Locator, type Page } from '@playwright/test'
import { ADMIN_PASSWORD, ADMIN_USERNAME } from './app'

export type StatusWord = 'Healthy' | 'Unhealthy' | 'Not checked yet'

/** `e2e-` plus 8 letters and digits: unique per test, never holding a status word. */
export function serviceName(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = randomBytes(8)
  return 'e2e-' + Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

export function servicesHeading(page: Page): Locator {
  return page.getByRole('heading', { level: 1, name: 'Services', exact: true })
}

export async function signIn(page: Page, username = ADMIN_USERNAME, password = ADMIN_PASSWORD): Promise<void> {
  await page.goto('/sign-in')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(servicesHeading(page)).toBeVisible()
}

/** A row is the list item of the list named Services whose text holds the name. */
export function serviceRow(page: Page, name: string): Locator {
  return page.getByRole('list', { name: 'Services' }).getByRole('listitem').filter({ hasText: name })
}

export async function addService(page: Page, name: string, url: string): Promise<void> {
  await page.getByRole('link', { name: 'Add service' }).first().click()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('URL').fill(url)
  await page.getByRole('button', { name: 'Save service' }).click()
  await expect(servicesHeading(page)).toBeVisible()
}

async function readStatus(page: Page, name: string): Promise<string> {
  const row = serviceRow(page, name)
  if ((await row.count()) === 0) return '(no row)'
  const badge = row.locator('xpath=.//*[normalize-space(text())="Healthy" or normalize-space(text())="Unhealthy" or normalize-space(text())="Not checked yet"]')
  const texts = await badge.allTextContents()
  return texts.length === 1 ? texts[0].trim() : `(${texts.length} badges)`
}

/** Presses Refresh and re-reads until the row's status is exactly `status`. */
export async function waitForStatus(page: Page, name: string, status: StatusWord): Promise<void> {
  let last = '(not read)'
  const refresh = page.getByRole('button', { name: 'Refresh', exact: true })
  await expect
    .poll(
      async () => {
        last = await readStatus(page, name)
        if (last !== status) {
          await refresh.click()
          await expect(refresh).toBeEnabled()
          last = await readStatus(page, name)
        }
        return last
      },
      { intervals: [500], timeout: 30_000, message: `status of ${name}: expected ${status}` },
    )
    .toBe(status)
}
