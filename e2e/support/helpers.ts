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

export interface AddServiceOptions {
  /** `false` turns the `Send alerts` switch off. On by default. */
  alerts?: boolean
  unhealthyMessage?: string
  recoveryMessage?: string
}

export async function addService(page: Page, name: string, url: string, options: AddServiceOptions = {}): Promise<void> {
  await page.getByRole('link', { name: 'Add service' }).first().click()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('URL').fill(url)
  // The Timing group, when the form has one: the values the harness's environment gives, sent explicitly.
  const interval = page.getByLabel('Check interval')
  if ((await interval.count()) > 0) {
    await interval.fill('6')
    await page.getByLabel('Timeout', { exact: true }).fill('1')
    await page.getByLabel('Retries', { exact: true }).fill('1')
    await page.getByLabel('Retry interval', { exact: true }).fill('1')
  }
  if (options.alerts === false) await page.getByRole('switch', { name: 'Send alerts' }).click()
  if (options.unhealthyMessage !== undefined) await page.getByLabel('Unhealthy message').fill(options.unhealthyMessage)
  if (options.recoveryMessage !== undefined) await page.getByLabel('Recovery message').fill(options.recoveryMessage)
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

export async function openAlertList(page: Page, serviceName: string): Promise<void> {
  await page.getByRole('link', { name: `Alerts ${serviceName}` }).click()
  await expect(page.getByRole('heading', { level: 1, name: `Alert list: ${serviceName}` })).toBeVisible()
}

export interface TargetInput {
  type: 'email' | 'webhook'
  address?: string
  url?: string
  name?: string
  headers?: { name: string; value: string }[]
}

/** The target dialog (toasts have the role `dialog` too, so the name tells them apart). */
export function targetDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: /^(Add|Edit) target$/ })
}

/** Fills the open target dialog, without pressing its primary button. */
export async function fillTarget(page: Page, target: TargetInput): Promise<void> {
  const dialog = targetDialog(page)
  if (target.name !== undefined) await dialog.getByLabel('Name').fill(target.name)
  if (target.type === 'webhook') {
    await dialog.getByRole('radio', { name: 'Webhook' }).check()
    if (target.url !== undefined) await dialog.getByLabel('Webhook URL').fill(target.url)
    const headers = target.headers ?? []
    for (let i = 0; i < headers.length; i++) {
      await dialog.getByRole('button', { name: 'Add header' }).click()
      await dialog.getByLabel(`Header ${i + 1} name`).fill(headers[i].name)
      await dialog.getByLabel(`Header ${i + 1} value`).fill(headers[i].value)
    }
  } else if (target.address !== undefined) {
    await dialog.getByLabel('Email address').fill(target.address)
  }
}

/** Presses `Add target`, fills the dialog, saves, and waits for the toast. */
export async function addTarget(page: Page, target: TargetInput): Promise<void> {
  await page.getByRole('button', { name: 'Add target' }).click()
  await fillTarget(page, target)
  await targetDialog(page).getByRole('button', { name: 'Add target' }).click()
  await expect(page.getByText('Target added.')).toBeVisible()
  await expect(targetDialog(page)).toBeHidden()
}

/** A target row is the list item of the list named Notification targets whose text holds the label. */
export function targetRow(page: Page, label: string): Locator {
  return page.getByRole('list', { name: 'Notification targets' }).getByRole('listitem').filter({ hasText: label })
}

/** Polls a count (every 250 ms, 30 seconds) until it is at least `n`. */
export async function waitForCount(read: () => number | Promise<number>, n: number): Promise<void> {
  let last = -1
  await expect
    .poll(async () => (last = await read()), { intervals: [250], timeout: 30_000, message: `count: expected at least ${n}` })
    .toBeGreaterThanOrEqual(n)
  void last
}

const DELIVERY_LINK = 'Alert delivery failed – view alert list'
const TARGET_NOTICE = 'Last delivery failed. Shown until a later delivery succeeds.'

/** Presses Refresh and re-reads the dashboard row until it shows (or no longer shows) the delivery notice. */
export async function waitForDeliveryNotice(page: Page, serviceName: string, shown: boolean): Promise<void> {
  const refresh = page.getByRole('button', { name: 'Refresh', exact: true })
  await expect
    .poll(
      async () => {
        await refresh.click()
        await expect(refresh).toBeEnabled()
        return (await serviceRow(page, serviceName).getByRole('link', { name: DELIVERY_LINK }).count()) > 0
      },
      { intervals: [500], timeout: 30_000, message: `delivery notice of ${serviceName}: expected ${shown ? 'shown' : 'hidden'}` },
    )
    .toBe(shown)
}

/** Reloads the alert list and re-reads the row until it shows (or no longer shows) the delivery notice. */
export async function waitForTargetNotice(page: Page, label: string, shown: boolean): Promise<void> {
  await expect
    .poll(
      async () => {
        await page.reload()
        await expect(page.getByRole('list', { name: 'Notification targets' })).toBeVisible()
        return (await targetRow(page, label).getByText(TARGET_NOTICE).count()) > 0
      },
      { intervals: [500], timeout: 30_000, message: `target notice of ${label}: expected ${shown ? 'shown' : 'hidden'}` },
    )
    .toBe(shown)
}

/** The one fixed wait of the M2 journeys: 10 seconds, used only to show that something does not happen. */
export async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(10_000)
}

/** The service's id, read from `GET /api/services` with the page's own session. */
export async function serviceId(page: Page, name: string): Promise<string> {
  const body = (await (await page.request.get('/api/services')).json()) as { items?: { id: string; name: string }[] }
  const found = (body.items ?? []).find((s) => s.name === name)
  expect(found, `service ${name} in the list`).toBeTruthy()
  return found!.id
}

export interface TargetBody {
  id: string
  type: string
  last_delivery_failed?: boolean
}

export async function listTargets(page: Page, id: string): Promise<TargetBody[]> {
  const res = await page.request.get(`/api/services/${id}/targets`)
  expect(res.ok()).toBe(true)
  const body = (await res.json()) as { items?: TargetBody[] } | TargetBody[]
  return Array.isArray(body) ? body : (body.items ?? [])
}
