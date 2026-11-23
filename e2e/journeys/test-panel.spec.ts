import type { Page } from '@playwright/test'
import { expect, test } from '../support/fixtures'
import {
  cancelForm,
  fillServiceForm,
  openAddService,
  openEditService,
  repeat,
  runTest,
  saveService,
  serviceName,
  serviceRow,
  serviceState,
  signIn,
  testPanel,
  testResult,
  waitForStatus,
} from '../support/helpers'

async function openForm(page: Page): Promise<void> {
  await signIn(page)
  await openAddService(page)
}

test.describe('M3 journey 6: the test panel', () => {
  test('M3 journey 6 a healthy result shows what came back (FR-104, NFR-7)', async ({ page, site }) => {
    site.route('/', { body: '<b>hello</b> <script>window.pwned = 1</script>', delayMs: 300 })
    await openForm(page)
    await fillServiceForm(page, { name: serviceName(), url: site.url() })
    const area = await runTest(page)
    const result = await testResult(page)
    expect(result).toMatchObject({ outcome: 'Healthy', httpStatus: 200 })
    expect(result.tookMs).toBeGreaterThanOrEqual(250)
    await expect(area.getByText(/^[\d,]+ ms$/)).toBeVisible()
    await expect(area.getByText('plain text', { exact: true })).toBeVisible()
    expect(result.body).toContain('<b>hello</b>')
    await expect(area.locator('b')).toHaveCount(0)
    await expect(area.locator('script')).toHaveCount(0)
    expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined()
    expect(site.count()).toBe(1)
  })

  test('M3 journey 6 a failed result shows the body too (FR-104)', async ({ page, site }) => {
    site.route('/', { status: 404, body: 'gone' })
    await openForm(page)
    await fillServiceForm(page, { name: serviceName(), url: site.url() })
    const area = await runTest(page)
    expect(await testResult(page)).toMatchObject({
      outcome: 'Failed',
      reason: 'Returned HTTP 404 (expected 2xx)',
      httpStatus: 404,
      body: 'gone',
    })
    await expect(area.getByText('plain text, not rendered', { exact: true })).toBeVisible()
  })

  test('M3 journey 6 a long body is cut off, an empty one says so (FR-104)', async ({ page, site }) => {
    site.route('/', { body: repeat('x', 70_000) })
    await openForm(page)
    await fillServiceForm(page, { name: serviceName(), url: site.url() })
    const area = await runTest(page)
    await expect(area.getByText('Cut off: the body is longer than 64 KB. Only the first 64 KB is shown.')).toBeVisible()
    const result = await testResult(page)
    expect(result.outcome).toBe('Healthy')
    expect(result.body).toHaveLength(65_536)

    site.route('/', {})
    const empty = await runTest(page)
    await expect(empty.getByText('No response body.')).toBeVisible()
    expect((await testResult(page)).body).toBeNull()
  })

  test('M3 journey 6 nothing is saved and no state changes (FR-105)', async ({ page, site }) => {
    test.setTimeout(120_000)
    site.route('/', {})
    site.route('/broken', { status: 503 })
    const name = serviceName()
    await openForm(page)
    await fillServiceForm(page, { name, url: site.url(), alerts: false })
    await saveService(page)
    await waitForStatus(page, name, 'Healthy')

    await openEditService(page, name)
    const before = await serviceState(page, name)
    await fillServiceForm(page, { timing: null, url: site.url('/broken') })
    await runTest(page)
    expect(await testResult(page)).toMatchObject({ outcome: 'Failed', httpStatus: 503 })
    const after = await serviceState(page, name)
    await cancelForm(page)

    await expect(serviceRow(page, name).getByText('Healthy', { exact: true })).toBeVisible()
    expect(after.state.status).toBe(before.state.status)
    expect(after.state.last_status_change_at).toBe(before.state.last_status_change_at)
    expect(after.state.last_failure_reason ?? null).toBeNull()
    expect(Date.parse(after.state.last_checked_at!)).toBeGreaterThanOrEqual(Date.parse(before.state.last_checked_at!))
    expect(site.requestsTo('/broken')).toHaveLength(1)

    await openEditService(page, name)
    await page.reload()
    await expect(page.getByLabel('URL', { exact: true })).toHaveValue(site.url())
  })

  test('M3 journey 6 invalid settings run nothing (FR-106, FR-74)', async ({ page, site }) => {
    site.route('/', {})
    await openForm(page)
    const refused = page.getByText('Test not run. Fix the highlighted fields first.')

    await fillServiceForm(page, { name: serviceName(), url: 'ftp://x.test' })
    await page.getByRole('button', { name: 'Run test', exact: true }).click()
    await expect(refused).toBeVisible()
    const url = page.getByLabel('URL', { exact: true })
    await expect(url).toHaveAttribute('aria-invalid', 'true')
    await expect(url).toHaveAccessibleDescription('Enter a URL that starts with http:// or https://.')

    await fillServiceForm(page, { type: 'tcp', host: '127.0.0.1', port: 0 })
    await page.getByRole('button', { name: 'Run test', exact: true }).click()
    await expect(refused).toBeVisible()
    await expect(page.getByLabel('Port', { exact: true })).toHaveAccessibleDescription('Must be between 1 and 65535.')

    await fillServiceForm(page, {
      type: 'http',
      url: site.url(),
      jsonRules: [{ field: '', kind: 'text', text: 'down' }],
    })
    await page.getByRole('button', { name: 'Run test', exact: true }).click()
    await expect(refused).toBeVisible()
    await expect(page.getByText('Rule 1 field path: Required.')).toBeVisible()
    expect(site.count()).toBe(0)
  })

  test.describe('a request over the size limit', () => {
    test.use({ appOverrides: { API_REQUEST_MAX_BYTES: '8192' } })

    test('M3 journey 6 a request over the size limit is refused (FR-38)', async ({ page, site }) => {
      await openForm(page)
      await fillServiceForm(page, { name: serviceName(), url: site.url(), bodyType: 'Plain text', body: repeat('x', 9_000) })
      await page.getByRole('button', { name: 'Run test', exact: true }).click()
      await expect(testPanel(page).getByRole('alert')).toHaveText('The test is too large to send. Shorten the body or the header values.')
      expect(site.count()).toBe(0)
    })
  })
})
