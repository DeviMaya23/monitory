import { expect, test } from '../support/fixtures'
import {
  clearRules,
  fillServiceForm,
  openAddService,
  runTest,
  saveService,
  serviceName,
  signIn,
  testPanel,
  testResult,
  waitForReason,
  waitForStatus,
  type ServiceSpec,
} from '../support/helpers'
import { closedPort } from '../support/stubTcp'
import type { Page } from '@playwright/test'

const NO_RESPONSE = 'No response was received, so there is no status code or body.'
const INVALID_JSON = 'Response is not valid JSON, or the JSON is missing'

/** Opens the Add form and fills it (alerts off, so that no mail is involved). */
async function openForm(page: Page, spec: ServiceSpec): Promise<string> {
  const name = serviceName()
  await signIn(page)
  await openAddService(page)
  await fillServiceForm(page, { name, alerts: false, ...spec })
  return name
}

/** B and C of a journey: save, then the dashboard shows Unhealthy with the reason. */
async function saveAndExpectReason(page: Page, name: string, reason: string): Promise<void> {
  await saveService(page)
  await waitForStatus(page, name, 'Unhealthy')
  await waitForReason(page, name, reason)
}

test.describe('M3 journey 1: the failure reasons of an HTTP check', () => {
  test('M3 journey 1 non_2xx_status (FR-42, FR-61, FR-62, FR-104)', async ({ page, site }) => {
    test.setTimeout(120_000)
    site.route('/', { status: 503 })
    const name = await openForm(page, { url: site.url() })
    await runTest(page)
    const result = await testResult(page)
    expect(result).toMatchObject({ outcome: 'Failed', reason: 'Returned HTTP 503 (expected 2xx)', httpStatus: 503 })
    expect(site.count()).toBe(1)
    await saveAndExpectReason(page, name, 'Returned HTTP 503 (expected 2xx)')
  })

  test('M3 journey 1 timed_out, a slow response (FR-41, FR-61)', async ({ page, site }) => {
    test.setTimeout(120_000)
    site.route('/', { delayMs: 3_000 })
    const name = await openForm(page, { url: site.url() })
    await runTest(page)
    const result = await testResult(page)
    expect(result).toMatchObject({ outcome: 'Failed', reason: 'Timed out', httpStatus: null, body: null })
    expect(result.tookMs).toBeGreaterThanOrEqual(900)
    await expect(testPanel(page).getByText(NO_RESPONSE)).toBeVisible()
    expect(site.count()).toBe(1)
    await saveAndExpectReason(page, name, 'Timed out')
  })

  test('M3 journey 1 timed_out, a stalled body with a JSON rule (FR-41, FR-73)', async ({ page, site }) => {
    site.route('/', { bodyDelayMs: 3_000, headers: { 'Content-Type': 'application/json' }, body: '{"status":"ok"}' })
    await openForm(page, { url: site.url(), jsonRules: [{ field: 'status', kind: 'text', text: 'down' }] })
    await runTest(page)
    expect(await testResult(page)).toMatchObject({ outcome: 'Failed', reason: 'Timed out' })
    expect(site.count()).toBe(1)
  })

  test('M3 journey 1 could_not_connect (FR-61)', async ({ page, site }) => {
    test.setTimeout(120_000)
    const name = await openForm(page, { url: `http://127.0.0.1:${await closedPort()}/` })
    await runTest(page)
    const result = await testResult(page)
    expect(result).toMatchObject({ outcome: 'Failed', reason: 'Could not connect', httpStatus: null })
    await expect(testPanel(page).getByText(NO_RESPONSE)).toBeVisible()
    expect(site.count()).toBe(0)
    await saveAndExpectReason(page, name, 'Could not connect')
  })

  test('M3 journey 1 json_rule_matched, text (FR-44, FR-46, FR-61) @smoke', async ({ page, site }) => {
    test.setTimeout(120_000)
    const body = '{"checks":{"db":{"status":"down"}}}'
    site.route('/', { headers: { 'Content-Type': 'application/json' }, body })
    const name = await openForm(page, {
      url: site.url(),
      jsonRules: [{ field: 'checks.db.status', kind: 'text', text: 'down' }],
    })
    await runTest(page)
    const result = await testResult(page)
    expect(result).toMatchObject({ outcome: 'Failed', reason: 'JSON rule matched: checks.db.status', httpStatus: 200, body })
    expect(site.count()).toBe(1)
    await saveAndExpectReason(page, name, 'JSON rule matched: checks.db.status')
  })

  test('M3 journey 1 json_rule_matched beats a non-2xx status (FR-61, FR-62)', async ({ page, site }) => {
    site.route('/', { status: 500, headers: { 'Content-Type': 'application/json' }, body: '{"status":"down"}' })
    await openForm(page, { url: site.url(), jsonRules: [{ field: 'status', kind: 'text', text: 'down' }] })
    await runTest(page)
    const result = await testResult(page)
    expect(result).toMatchObject({ outcome: 'Failed', reason: 'JSON rule matched: status', httpStatus: 500 })
    expect(site.count()).toBe(1)
  })

  test('M3 journey 1 json_rule_matched, true and false (FR-44)', async ({ page, site }) => {
    site.route('/', { headers: { 'Content-Type': 'application/json' }, body: '{"ok":false,"maintenance":true}' })
    await openForm(page, { url: site.url(), jsonRules: [{ field: 'ok', kind: 'false' }] })
    await runTest(page)
    expect(await testResult(page)).toMatchObject({ outcome: 'Failed', reason: 'JSON rule matched: ok' })

    await clearRules(page)
    await fillServiceForm(page, { timing: null, jsonRules: [{ field: 'maintenance', kind: 'true' }] })
    await runTest(page)
    expect(await testResult(page)).toMatchObject({ outcome: 'Failed', reason: 'JSON rule matched: maintenance' })

    await clearRules(page)
    await fillServiceForm(page, { timing: null, jsonRules: [{ field: 'ok', kind: 'true' }] })
    await runTest(page)
    expect(await testResult(page)).toMatchObject({ outcome: 'Healthy', reason: null })
    expect(site.count()).toBe(3)
  })

  test('M3 journey 1 a number is compared as text, text is case-sensitive (FR-45)', async ({ page, site }) => {
    site.route('/', { headers: { 'Content-Type': 'application/json' }, body: '{"code":503,"state":"Down"}' })
    await openForm(page, { url: site.url(), jsonRules: [{ field: 'code', kind: 'text', text: '503' }] })
    await runTest(page)
    expect(await testResult(page)).toMatchObject({ outcome: 'Failed', reason: 'JSON rule matched: code' })

    await clearRules(page)
    await fillServiceForm(page, { timing: null, jsonRules: [{ field: 'state', kind: 'text', text: 'down' }] })
    await runTest(page)
    expect(await testResult(page)).toMatchObject({ outcome: 'Healthy' })

    await clearRules(page)
    await fillServiceForm(page, { timing: null, jsonRules: [{ field: 'state', kind: 'text', text: 'Down' }] })
    await runTest(page)
    expect(await testResult(page)).toMatchObject({ outcome: 'Failed', reason: 'JSON rule matched: state' })
  })

  test('M3 journey 1 any or all (FR-47)', async ({ page, site }) => {
    site.route('/', { headers: { 'Content-Type': 'application/json' }, body: '{"a":"bad","b":"fine"}' })
    await openForm(page, {
      url: site.url(),
      jsonRules: [
        { field: 'a', kind: 'text', text: 'bad' },
        { field: 'b', kind: 'text', text: 'bad' },
      ],
      jsonRuleMode: 'any',
    })
    await runTest(page)
    expect(await testResult(page)).toMatchObject({ outcome: 'Failed', reason: 'JSON rule matched: a' })

    await fillServiceForm(page, { timing: null, jsonRuleMode: 'all' })
    await runTest(page)
    expect(await testResult(page)).toMatchObject({ outcome: 'Healthy' })

    await page.getByLabel('Rule 2 failing text', { exact: true }).fill('fine')
    await runTest(page)
    expect(await testResult(page)).toMatchObject({ outcome: 'Failed', reason: 'JSON rule matched: a' })
  })

  test('M3 journey 1 invalid_or_missing_json: not JSON, empty, missing field (FR-48, FR-61)', async ({ page, site }) => {
    test.setTimeout(120_000)
    site.route('/', { body: 'not json' })
    const name = await openForm(page, { url: site.url(), jsonRules: [{ field: 'status', kind: 'text', text: 'down' }] })
    const expected = { outcome: 'Failed', reason: INVALID_JSON, httpStatus: 200 }
    await runTest(page)
    expect(await testResult(page)).toMatchObject(expected)

    site.route('/', { body: '' })
    await runTest(page)
    expect(await testResult(page)).toMatchObject(expected)

    site.route('/', { body: '{"other":1}', headers: { 'Content-Type': 'application/json' } })
    await runTest(page)
    expect(await testResult(page)).toMatchObject(expected)
    expect(site.count()).toBe(3)

    site.route('/', { body: 'not json' })
    await saveAndExpectReason(page, name, INVALID_JSON)
  })

  test.describe('a body over the read limit', () => {
    test.use({ appOverrides: { RESPONSE_BODY_MAX_BYTES: '2000' } })

    test('M3 journey 1 a body over the read limit is not valid JSON (FR-73)', async ({ page, site }) => {
      test.setTimeout(120_000)
      const object = (bytes: number) => {
        const base = '{"status":"ok","pad":""}'
        return `{"status":"ok","pad":"${'x'.repeat(bytes - base.length)}"}`
      }
      const long = object(2_001)
      const short = object(1_999)
      expect(Buffer.byteLength(long)).toBe(2_001)
      expect(Buffer.byteLength(short)).toBe(1_999)
      site.route('/long', { headers: { 'Content-Type': 'application/json' }, body: long })
      site.route('/short', { headers: { 'Content-Type': 'application/json' }, body: short })
      const rules = [{ field: 'status', kind: 'text' as const, text: 'down' }]
      const longName = serviceName()
      const shortName = serviceName()
      await signIn(page)
      await openAddService(page)
      await fillServiceForm(page, { name: longName, url: site.url('/long'), jsonRules: rules, alerts: false })
      await saveService(page)
      await openAddService(page)
      await fillServiceForm(page, { name: shortName, url: site.url('/short'), jsonRules: rules, alerts: false })
      await saveService(page)
      await waitForStatus(page, longName, 'Unhealthy')
      await waitForReason(page, longName, INVALID_JSON)
      await waitForStatus(page, shortName, 'Healthy')
    })
  })

  test('M3 journey 1 too_many_redirects and the limit of three (FR-58, FR-61)', async ({ page, site }) => {
    test.setTimeout(120_000)
    site.route('/r1', { redirectTo: '/r2' })
    site.route('/r2', { redirectTo: '/r3' })
    site.route('/r3', { redirectTo: '/ok' })
    site.route('/s1', { redirectTo: '/s2' })
    site.route('/s2', { redirectTo: '/s3' })
    site.route('/s3', { redirectTo: '/s4' })
    site.route('/s4', { redirectTo: '/ok' })
    site.route('/ok', {})
    const name = await openForm(page, { url: site.url('/r1') })
    await runTest(page)
    expect(await testResult(page)).toMatchObject({ outcome: 'Healthy', httpStatus: 200 })
    expect(site.requestsTo('/ok')).toHaveLength(1)

    await fillServiceForm(page, { timing: null, url: site.url('/s1') })
    await runTest(page)
    expect(await testResult(page)).toMatchObject({ outcome: 'Failed', reason: 'Too many redirects' })
    expect(site.requestsTo('/ok')).toHaveLength(1)
    await saveAndExpectReason(page, name, 'Too many redirects')
  })
})
