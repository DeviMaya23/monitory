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
  await page.getByLabel('Name', { exact: true }).fill(name)
  await page.getByLabel('URL', { exact: true }).fill(url)
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
  // An earlier toast may still be up, so more than one can match; the dialog closes only when the save worked.
  await expect(page.getByText('Target added.').first()).toBeVisible()
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
  const body = (await (await page.request.get('/api/services')).json()) as { id: string; name: string }[]
  const found = body.find((s) => s.name === name)
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
  return (await res.json()) as TargetBody[]
}

// ---- Milestone 3 ----

export interface Row {
  name: string
  value: string
}

export interface JsonRuleSpec {
  field: string
  kind: 'text' | 'true' | 'false'
  text?: string
}

export interface Timing {
  interval: number
  timeout: number
  retries: number
  retryInterval: number
}

/** The values M2's `addService` fills: a 6-second interval unless a journey says otherwise. */
export const defaultTiming: Timing = { interval: 6, timeout: 1, retries: 1, retryInterval: 1 }

export interface ServiceSpec {
  name?: string
  type?: 'http' | 'tcp'
  method?: string
  url?: string
  host?: string
  port?: string | number
  queryParams?: Row[]
  headers?: Row[]
  bodyType?: 'None' | 'JSON' | 'Plain text' | 'Form (URL-encoded)'
  body?: string
  jsonRules?: JsonRuleSpec[]
  jsonRuleMode?: 'any' | 'all'
  certCheck?: { days: string | number }
  ignoreCert?: boolean
  /** The four timing inputs. Left out: `defaultTiming`. `null`: the Timing group is not touched (for an Edit form). */
  timing?: Timing | null
  alerts?: boolean
  unhealthyMessage?: string
  recoveryMessage?: string
}

async function setSwitch(page: Page, name: string, on: boolean): Promise<void> {
  const toggle = page.getByRole('switch', { name, exact: true })
  if (((await toggle.getAttribute('aria-checked')) === 'true') !== on) await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', on ? 'true' : 'false')
}

/** Fills what `spec` gives on the open Add or Edit form, without pressing Save. */
export async function fillServiceForm(page: Page, spec: ServiceSpec): Promise<void> {
  if (spec.name !== undefined) await page.getByLabel('Name', { exact: true }).fill(spec.name)
  if (spec.type !== undefined) {
    await page.getByRole('radiogroup', { name: 'Type' }).getByRole('radio', { name: spec.type === 'tcp' ? 'TCP port' : 'HTTP(S)', exact: true }).check()
  }
  if (spec.host !== undefined) await page.getByLabel('Host', { exact: true }).fill(spec.host)
  if (spec.port !== undefined) await page.getByLabel('Port', { exact: true }).fill(String(spec.port))
  if (spec.method !== undefined) {
    await page.getByLabel('Method', { exact: true }).click()
    await page.getByRole('option', { name: spec.method, exact: true }).click()
  }
  if (spec.url !== undefined) await page.getByLabel('URL', { exact: true }).fill(spec.url)
  const rows = async (list: Row[] | undefined, add: string, item: string) => {
    for (const [i, row] of (list ?? []).entries()) {
      await page.getByRole('button', { name: add, exact: true }).click()
      await page.getByLabel(`${item} ${i + 1} name`, { exact: true }).fill(row.name)
      await page.getByLabel(`${item} ${i + 1} value`, { exact: true }).fill(row.value)
    }
  }
  await rows(spec.queryParams, 'Add parameter', 'Query parameter')
  await rows(spec.headers, 'Add header', 'Header')
  if (spec.bodyType !== undefined) {
    await page.getByRole('radiogroup', { name: 'Body type' }).getByRole('radio', { name: spec.bodyType, exact: true }).check()
  }
  if (spec.body !== undefined) await page.getByLabel('Body', { exact: true }).fill(spec.body)
  for (const [i, rule] of (spec.jsonRules ?? []).entries()) {
    await page.getByRole('button', { name: 'Add rule', exact: true }).click()
    await page.getByLabel(`Rule ${i + 1} field path`, { exact: true }).fill(rule.field)
    if (rule.kind !== 'text') {
      await page.getByLabel(`Rule ${i + 1} failing value type`, { exact: true }).click()
      await page.getByRole('option', { name: rule.kind, exact: true }).click()
    }
    if (rule.kind === 'text') await page.getByLabel(`Rule ${i + 1} failing text`, { exact: true }).fill(rule.text ?? '')
  }
  if (spec.jsonRuleMode !== undefined) {
    await page
      .getByRole('radiogroup', { name: 'Mark unhealthy when' })
      .getByRole('radio', { name: spec.jsonRuleMode === 'any' ? 'Any rule matches' : 'All rules match', exact: true })
      .check()
  }
  if (spec.certCheck !== undefined) {
    await setSwitch(page, 'Check certificate expiry', true)
    await page.getByLabel('Minimum days left', { exact: true }).fill(String(spec.certCheck.days))
  }
  if (spec.ignoreCert !== undefined) await setSwitch(page, 'Ignore certificate errors', spec.ignoreCert)
  if (spec.timing !== null) {
    const t = spec.timing ?? defaultTiming
    await page.getByLabel('Check interval', { exact: true }).fill(String(t.interval))
    await page.getByLabel('Timeout', { exact: true }).fill(String(t.timeout))
    await page.getByLabel('Retries', { exact: true }).fill(String(t.retries))
    await page.getByLabel('Retry interval', { exact: true }).fill(String(t.retryInterval))
  }
  if (spec.alerts !== undefined) await setSwitch(page, 'Send alerts', spec.alerts)
  if (spec.unhealthyMessage !== undefined) await page.getByLabel('Unhealthy message').fill(spec.unhealthyMessage)
  if (spec.recoveryMessage !== undefined) await page.getByLabel('Recovery message').fill(spec.recoveryMessage)
}

/** Opens the Add service form from the dashboard. */
export async function openAddService(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Add service' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Add service', exact: true })).toBeVisible()
}

/** Opens the Edit screen of a service from the dashboard. */
export async function openEditService(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name: `Edit ${name}`, exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Edit service', exact: true })).toBeVisible()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(name)
}

/** Presses `Save service` and waits for the dashboard. */
export async function saveService(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save service', exact: true }).click()
  await expect(servicesHeading(page)).toBeVisible()
}

/** Presses `Cancel` and, when the form has changes, `Discard changes`; waits for the dashboard. */
export async function cancelForm(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  const discard = page.getByRole('button', { name: 'Discard changes', exact: true })
  await discard.click()
  await expect(servicesHeading(page)).toBeVisible()
}

export function testPanel(page: Page): Locator {
  return page.getByRole('complementary', { name: 'Test check' })
}

/** Presses `Run test` and returns the result area once it shows `Healthy` or `Failed` (of this run, not an earlier one). */
export async function runTest(page: Page): Promise<Locator> {
  // The old result stays up until the new run starts: note when the running notice has been on the page.
  await page.evaluate(() => {
    const w = window as unknown as { __e2eRunSeen: boolean; __e2eObserver?: MutationObserver }
    w.__e2eRunSeen = false
    w.__e2eObserver?.disconnect()
    const observer = new MutationObserver(() => {
      if (document.body.textContent?.includes('Running one attempt')) w.__e2eRunSeen = true
    })
    observer.observe(document.body, { subtree: true, childList: true, characterData: true })
    w.__e2eObserver = observer
  })
  await page.getByRole('button', { name: 'Run test', exact: true }).click()
  await page.waitForFunction(() => (window as unknown as { __e2eRunSeen: boolean }).__e2eRunSeen)
  const area = testPanel(page).getByRole('status')
  await expect(area.getByText(/^(Healthy|Failed)$/)).toBeVisible()
  return area
}

export interface TestResultView {
  outcome: 'Healthy' | 'Failed'
  reason: string | null
  tookMs: number
  httpStatus: number | null
  body: string | null
}

/** Reads the open result area. */
export async function testResult(page: Page): Promise<TestResultView> {
  const area = testPanel(page).getByRole('status')
  const verdict = area.locator(':scope > div').first().locator('span')
  const outcome = ((await verdict.first().textContent()) ?? '').trim() as 'Healthy' | 'Failed'
  const reason = outcome === 'Failed' ? ((await verdict.nth(1).textContent()) ?? '').trim() : null
  const meta = async (label: string) => {
    const dd = area.locator('dl > div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd')
    return (await dd.count()) === 0 ? null : ((await dd.first().textContent()) ?? '').trim()
  }
  const took = await meta('Took')
  const http = await meta('HTTP')
  const bodyBlock = area.getByLabel('Response body')
  return {
    outcome,
    reason,
    tookMs: Number((took ?? '').replace(/[^\d]/g, '')),
    httpStatus: http === null ? null : Number(http),
    body: (await bodyBlock.count()) === 0 ? null : await bodyBlock.textContent(),
  }
}

/** The failure text of a dashboard row (the paragraph beside the status badge), or null. */
async function readReason(page: Page, name: string): Promise<string | null> {
  const p = serviceRow(page, name).locator('p')
  return (await p.count()) === 0 ? null : ((await p.first().textContent()) ?? '').trim()
}

/** Presses Refresh and re-reads (every 500 ms, 30 seconds) until the row shows exactly `text` as its failure reason. */
export async function waitForReason(page: Page, name: string, text: string | null): Promise<void> {
  const refresh = page.getByRole('button', { name: 'Refresh', exact: true })
  await expect
    .poll(
      async () => {
        await refresh.click()
        await expect(refresh).toBeEnabled()
        return readReason(page, name)
      },
      { intervals: [500], timeout: 30_000, message: `failure reason of ${name}: expected ${text}` },
    )
    .toBe(text)
}

/** Presses Refresh and re-reads until the row has `Resume <name>` (paused) or `Pause <name>` (not paused). */
export async function waitForPaused(page: Page, name: string, paused: boolean): Promise<void> {
  const refresh = page.getByRole('button', { name: 'Refresh', exact: true })
  const button = page.getByRole('button', { name: `${paused ? 'Resume' : 'Pause'} ${name}`, exact: true })
  await expect
    .poll(
      async () => {
        await refresh.click()
        await expect(refresh).toBeEnabled()
        return (await button.count()) > 0
      },
      { intervals: [500], timeout: 30_000, message: `row ${name}: expected ${paused ? 'paused' : 'not paused'}` },
    )
    .toBe(true)
}

export interface ServiceStateBody {
  status: string
  last_checked_at?: string | null
  last_status_change_at?: string | null
  last_failure_reason?: { code: string; http_status?: number; json_rule_field?: string } | null
}

export interface ServiceStateView {
  id: string
  paused: boolean
  state: ServiceStateBody
}

/** The service as `GET /api/services` has it. */
export async function serviceState(page: Page, name: string): Promise<ServiceStateView> {
  const list = (await (await page.request.get('/api/services')).json()) as {
    id: string
    name: string
    paused: boolean
    state: ServiceStateBody
  }[]
  const found = list.find((s) => s.name === name)
  expect(found, `service ${name} in the list`).toBeTruthy()
  return { id: found!.id, paused: found!.paused, state: found!.state }
}

/** `GET /api/services`: how many services exist. */
export async function serviceCount(page: Page): Promise<number> {
  return ((await (await page.request.get('/api/services')).json()) as unknown[]).length
}

/** A text of `n` copies of `char`. */
export const repeat = (char: string, n: number): string => char.repeat(n)

/** Removes every JSON rule row from the open form. */
export async function clearRules(page: Page): Promise<void> {
  const remove = page.getByRole('button', { name: 'Remove rule 1', exact: true })
  while ((await remove.count()) > 0) await remove.click()
}
