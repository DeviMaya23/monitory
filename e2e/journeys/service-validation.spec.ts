import type { Page } from '@playwright/test'
import { validCert } from '../support/certs'
import { expect, test } from '../support/fixtures'
import {
  cancelForm,
  fillServiceForm,
  openAddService,
  repeat,
  runTest,
  saveService,
  serviceCount,
  serviceName,
  serviceRow,
  signIn,
  testResult,
  type ServiceSpec,
  type Timing,
} from '../support/helpers'

interface Refusal {
  label: string
  message: string
}

async function pressSave(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save service', exact: true }).click()
}

const summaryTitle = (n: number) =>
  n === 1 ? '1 field needs fixing before this can be saved.' : `${n} fields need fixing before this can be saved.`

/** The summary of the last save: its title, and exactly these entries (label and message), each also shown under its field. */
async function expectSummary(page: Page, refusals: Refusal[]): Promise<void> {
  const summary = page.getByRole('alert').filter({ hasText: summaryTitle(refusals.length) })
  await expect(summary).toBeVisible()
  await expect(summary.getByRole('listitem')).toHaveCount(refusals.length)
  for (const { label, message } of refusals) {
    await expect(summary.getByText(`${label}: ${message}`, { exact: true })).toBeVisible()
    // The same message under each field that has it.
    await expect(page.getByText(message, { exact: true })).toHaveCount(refusals.filter((r) => r.message === message).length)
  }
}

/** Nothing was saved: leave the form, see the empty dashboard, and ask the server. */
async function expectNothingSaved(page: Page): Promise<void> {
  await cancelForm(page)
  await expect(page.getByText('No services yet')).toBeVisible()
  expect(await serviceCount(page)).toBe(0)
}

/** A new Add form, filled and saved: the case at the limit. */
async function expectSaved(page: Page, spec: ServiceSpec): Promise<void> {
  await openAddService(page)
  await fillServiceForm(page, spec)
  await saveService(page)
  await expect(page.getByText(`Service “${spec.name}” added.`)).toBeVisible()
  await expect(serviceRow(page, spec.name!)).toBeVisible()
}

/** One row of describe A: the case one past the limit is refused with nothing saved, then the case at the limit saves. */
async function pastThenAt(page: Page, past: ServiceSpec, at: ServiceSpec, refusals: Refusal[]): Promise<void> {
  await signIn(page)
  await openAddService(page)
  await fillServiceForm(page, { name: serviceName(), alerts: false, ...past })
  await pressSave(page)
  await expectSummary(page, refusals)
  await expectNothingSaved(page)
  await expectSaved(page, { name: serviceName(), alerts: false, ...at })
}

test.describe('M3 journey 9 A: the request and name limits (FR-38, FR-59, FR-65, FR-69)', () => {
  test.use({
    appOverrides: {
      SERVICE_NAME_MAX_LENGTH: '12',
      REQUEST_URL_MAX_LENGTH: '60',
      REQUEST_MAX_QUERY_PARAMS: '2',
      REQUEST_MAX_HEADERS: '2',
      HEADER_NAME_MAX_LENGTH: '8',
      HEADER_VALUE_MAX_LENGTH: '16',
      REQUEST_BODY_MAX_BYTES: '32',
      MAX_JSON_RULES: '2',
    },
  })

  test('M3 journey 9 name', async ({ page, stub }) => {
    const name = serviceName()
    expect(name).toHaveLength(12)
    await pastThenAt(
      page,
      { name: name + 'x', url: stub.url },
      { name, url: stub.url },
      [{ label: 'Name', message: 'Use 12 characters or fewer.' }],
    )
  })

  test('M3 journey 9 URL with its query parameters', async ({ page, stub }) => {
    // The URL, `?`, the name, `=` and the value, unencoded: the port's digit count counts.
    const withLength = (total: number): ServiceSpec => {
      const value = repeat('x', total - stub.url.length - '?p='.length)
      return { url: stub.url, queryParams: [{ name: 'p', value }] }
    }
    await pastThenAt(page, withLength(61), withLength(60), [
      { label: 'URL', message: 'Use 60 characters or fewer, query parameters included.' },
    ])
  })

  test('M3 journey 9 query parameters', async ({ page, stub }) => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `q${i}`, value: '1' }))
    await pastThenAt(page, { url: stub.url, queryParams: rows(3) }, { url: stub.url, queryParams: rows(2) }, [
      { label: 'Query parameters', message: 'Too many rows. Use 2 or fewer.' },
    ])
  })

  test('M3 journey 9 headers', async ({ page, stub }) => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `h${i}`, value: '1' }))
    await pastThenAt(page, { url: stub.url, headers: rows(3) }, { url: stub.url, headers: rows(2) }, [
      { label: 'Headers', message: 'Too many rows. Use 2 or fewer.' },
    ])
  })

  test('M3 journey 9 header name', async ({ page, stub }) => {
    await pastThenAt(
      page,
      { url: stub.url, headers: [{ name: repeat('n', 9), value: 'v' }] },
      { url: stub.url, headers: [{ name: repeat('n', 8), value: 'v' }] },
      [{ label: 'Header 1 name', message: 'Use 8 characters or fewer.' }],
    )
  })

  test('M3 journey 9 header value', async ({ page, stub }) => {
    await pastThenAt(
      page,
      { url: stub.url, headers: [{ name: 'X-Test', value: repeat('v', 17) }] },
      { url: stub.url, headers: [{ name: 'X-Test', value: repeat('v', 16) }] },
      [{ label: 'Header 1 value', message: 'Use 16 characters or fewer.' }],
    )
  })

  test('M3 journey 9 body', async ({ page, stub }) => {
    await pastThenAt(
      page,
      { url: stub.url, method: 'POST', bodyType: 'Plain text', body: repeat('b', 33) },
      { url: stub.url, method: 'POST', bodyType: 'Plain text', body: repeat('b', 32) },
      [{ label: 'Body', message: 'Use 32 bytes or fewer.' }],
    )
  })

  test('M3 journey 9 JSON rules', async ({ page, stub }) => {
    const rules = (n: number) => Array.from({ length: n }, (_, i) => ({ field: `r${i}`, kind: 'text' as const, text: 'x' }))
    await pastThenAt(page, { url: stub.url, jsonRules: rules(3) }, { url: stub.url, jsonRules: rules(2) }, [
      { label: 'Health rules', message: 'Too many rows. Use 2 or fewer.' },
    ])
  })

  test('M3 journey 9 unhealthy and recovery messages (500 characters, not configured)', async ({ page, stub }) => {
    await pastThenAt(
      page,
      { url: stub.url, alerts: true, unhealthyMessage: repeat('u', 501), recoveryMessage: repeat('r', 501) },
      { url: stub.url, alerts: true, unhealthyMessage: repeat('u', 500), recoveryMessage: repeat('r', 500) },
      [
        { label: 'Unhealthy message', message: 'Use 500 characters or fewer.' },
        { label: 'Recovery message', message: 'Use 500 characters or fewer.' },
      ],
    )
  })
})

test.describe('M3 journey 9 B: timing limits and the worst case (FR-56, FR-57)', () => {
  test.use({
    appOverrides: {
      CHECK_INTERVAL_MAX_SECONDS: '30',
      TIMEOUT_MAX_SECONDS: '5',
      RETRY_COUNT_MAX: '2',
      RETRY_INTERVAL_MAX_SECONDS: '5',
    },
  })

  const timingGroup = (page: Page) => page.getByRole('group', { name: 'Timing', exact: true })

  test('M3 journey 9 at the limits (FR-57)', async ({ page, stub }) => {
    const name = serviceName()
    await signIn(page)
    await openAddService(page)
    await fillServiceForm(page, {
      name,
      url: stub.url,
      alerts: false,
      timing: { interval: 30, timeout: 5, retries: 2, retryInterval: 5 },
    })
    await expect(timingGroup(page).locator('p').filter({ hasText: '5 × (1 + 2) + 5 × 2 = 25 s fits in the 30 s interval.' })).toBeVisible()
    await saveService(page)
    await expect(page.getByText(`Service “${name}” added.`)).toBeVisible()
  })

  test('M3 journey 9 one past each limit (FR-57)', async ({ page, stub }) => {
    const base: Timing = { interval: 30, timeout: 1, retries: 0, retryInterval: 1 }
    const cases: { timing: Timing; label: string; message: string }[] = [
      { timing: { ...base, interval: 31 }, label: 'Check interval', message: 'The check interval is 1 to 30 seconds.' },
      { timing: { ...base, interval: 0 }, label: 'Check interval', message: 'The check interval is 1 to 30 seconds.' },
      { timing: { ...base, timeout: 6 }, label: 'Timeout', message: 'The timeout is 1 to 5 seconds.' },
      { timing: { ...base, timeout: 0 }, label: 'Timeout', message: 'The timeout is 1 to 5 seconds.' },
      { timing: { ...base, retries: 3 }, label: 'Retries', message: 'The retry count is 0 to 2.' },
      { timing: { ...base, retryInterval: 6 }, label: 'Retry interval', message: 'The retry interval is 1 to 5 seconds.' },
      { timing: { ...base, retryInterval: 0 }, label: 'Retry interval', message: 'The retry interval is 1 to 5 seconds.' },
    ]
    await signIn(page)
    await openAddService(page)
    await fillServiceForm(page, { name: serviceName(), url: stub.url, alerts: false })
    for (const { timing, label, message } of cases) {
      await fillServiceForm(page, { timing })
      await pressSave(page)
      // Only the range error: the worst case is not checked while a value is out of range.
      await expectSummary(page, [{ label, message }])
    }
    await expectNothingSaved(page)
  })

  test('M3 journey 9 retries 0 is accepted (FR-57)', async ({ page, stub }) => {
    await signIn(page)
    await expectSaved(page, {
      name: serviceName(),
      url: stub.url,
      alerts: false,
      timing: { interval: 30, timeout: 1, retries: 0, retryInterval: 1 },
    })
  })

  test('M3 journey 9 the worst case must fit in the interval (FR-56)', async ({ page, stub }) => {
    const name = serviceName()
    const worst = { timeout: 5, retries: 2, retryInterval: 5 }
    await signIn(page)
    await openAddService(page)
    await fillServiceForm(page, { name, url: stub.url, alerts: false, timing: { interval: 24, ...worst } })
    await expect(timingGroup(page).locator('p').filter({ hasText: '5 × (1 + 2) + 5 × 2 = 25 s exceeds the 24 s interval.' })).toBeVisible()

    // The test panel is not blocked by it: a test uses only the timeout.
    await runTest(page)
    expect(await testResult(page)).toMatchObject({ outcome: 'Healthy' })

    await pressSave(page)
    await expectSummary(page, [
      {
        label: 'Timing',
        message:
          'The longest attempt takes 25 seconds, longer than the check interval of 24 seconds. Raise the interval, or lower the timeout, retries or retry interval.',
      },
    ])
    await expectNothingSaved(page)

    await expectSaved(page, { name: serviceName(), url: stub.url, alerts: false, timing: { interval: 25, ...worst } })
  })
})

test.describe('M3 journey 9 C: the number of services (FR-60)', () => {
  test.use({ appOverrides: { MAX_SERVICES: '2' } })

  test('M3 journey 9 the third service is refused (FR-60)', async ({ page, stub }) => {
    await signIn(page)
    const first = serviceName()
    const second = serviceName()
    const third = serviceName()
    await expectSaved(page, { name: first, url: stub.url, alerts: false })
    await expectSaved(page, { name: second, url: stub.url, alerts: false })

    await openAddService(page)
    await fillServiceForm(page, { name: third, url: stub.url, alerts: false })
    await pressSave(page)
    const banner = page.getByRole('alert').filter({ hasText: 'Service limit reached.' })
    await expect(banner).toBeVisible()
    await expect(banner.getByText('This install can’t hold more services. Delete one to add this one.')).toBeVisible()
    await expect(banner.getByRole('link', { name: 'Back to services', exact: true })).toBeVisible()
    await expect(page.getByText(/fields? needs? fixing/)).toHaveCount(0)

    await cancelForm(page)
    const rows = page.getByRole('list', { name: 'Services' }).getByRole('listitem')
    await expect(rows).toHaveCount(2)
    expect(await serviceCount(page)).toBe(2)

    await page.getByRole('button', { name: `Delete ${first}`, exact: true }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete service', exact: true }).click()
    await expect(serviceRow(page, first)).toHaveCount(0)

    await expectSaved(page, { name: third, url: stub.url, alerts: false })
    await expect(rows).toHaveCount(2)
    expect(await serviceCount(page)).toBe(2)
  })
})

test.describe('M3 journey 9 D: the one-megabyte rule (FR-38)', () => {
  test.use({ appOverrides: { API_REQUEST_MAX_BYTES: '8192' } })

  test('M3 journey 9 a service over the request size limit is refused (FR-38)', async ({ page, stub }) => {
    await signIn(page)
    await openAddService(page)
    await fillServiceForm(page, {
      name: serviceName(),
      url: stub.url,
      method: 'POST',
      bodyType: 'Plain text',
      body: repeat('x', 9_000),
      alerts: false,
    })
    await pressSave(page)
    const banner = page.getByRole('alert').filter({ hasText: 'The service is too large to save.' })
    await expect(banner).toBeVisible()
    await expect(banner.getByText('Together its fields are over 1 MB. Shorten the body or the header values.')).toBeVisible()
    await expect(page.getByText(/fields? needs? fixing/)).toHaveCount(0)
    await expectNothingSaved(page)

    await expectSaved(page, {
      name: serviceName(),
      url: stub.url,
      method: 'POST',
      bodyType: 'Plain text',
      body: repeat('x', 1_000),
      alerts: false,
    })
  })
})

test.describe('M3 journey 9 E: the rules of FR-74 and the required fields', () => {
  /** Counts the requests that create a service. */
  function countCreates(page: Page): () => number {
    let n = 0
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/services') n++
    })
    return () => n
  }

  test('M3 journey 9 an HTTP service: the URL and the JSON rule (FR-74)', async ({ page, stub }) => {
    const creates = countCreates(page)
    const name = serviceName()
    await signIn(page)
    await openAddService(page)

    // Two refusals in one form: they do not hide each other.
    await fillServiceForm(page, {
      name,
      url: 'ftp://x.test',
      alerts: false,
      jsonRules: [{ field: '', kind: 'text', text: 'down' }],
    })
    await pressSave(page)
    await expectSummary(page, [
      { label: 'URL', message: 'Enter a URL that starts with http:// or https://.' },
      { label: 'Rule 1 field path', message: 'Required.' },
    ])
    expect(creates()).toBe(1)

    // An empty URL is the screen's own refusal: no request is sent.
    await fillServiceForm(page, { timing: null, url: '' })
    await pressSave(page)
    await expect(page.getByText('Enter a URL.', { exact: true })).toBeVisible()
    expect(creates()).toBe(1)

    await fillServiceForm(page, { timing: null, url: stub.url })
    await pressSave(page)
    await expectSummary(page, [{ label: 'Rule 1 field path', message: 'Required.' }])
    expect(creates()).toBe(2)

    // A rule with a path and an empty text is not refused: the form sends an empty string.
    await fillServiceForm(page, { timing: null })
    await page.getByLabel('Rule 1 field path', { exact: true }).fill('status')
    await page.getByLabel('Rule 1 failing text', { exact: true }).fill('')
    await saveService(page)
    await expect(page.getByText(`Service “${name}” added.`)).toBeVisible()
    expect(creates()).toBe(3)
  })

  test('M3 journey 9 a TCP service: the host and the port (FR-74)', async ({ page }) => {
    const creates = countCreates(page)
    const name = serviceName()
    await signIn(page)
    await openAddService(page)

    await fillServiceForm(page, { name, type: 'tcp', host: '', port: 0, alerts: false })
    await pressSave(page)
    await expectSummary(page, [
      { label: 'Host', message: 'Enter a host.' },
      { label: 'Port', message: 'Must be between 1 and 65535.' },
    ])
    expect(creates()).toBe(1)

    await fillServiceForm(page, { timing: null, host: '127.0.0.1', port: 65_536 })
    await pressSave(page)
    await expectSummary(page, [{ label: 'Port', message: 'Must be between 1 and 65535.' }])
    expect(creates()).toBe(2)

    // A port with letters is the screen's own refusal: no request is sent.
    await fillServiceForm(page, { timing: null, port: 'abc' })
    await pressSave(page)
    await expect(page.getByText('Enter a whole number.', { exact: true })).toBeVisible()
    expect(creates()).toBe(2)

    await fillServiceForm(page, { timing: null, port: 65_535 })
    await saveService(page)
    await expect(page.getByText(`Service “${name}” added.`)).toBeVisible()
    expect(creates()).toBe(3)
  })

  test('M3 journey 9 the minimum days of the certificate check (FR-74)', async ({ page, tlsSite }) => {
    const site = await tlsSite(await validCert(30))
    site.route('/', {})
    const name = serviceName()
    await signIn(page)
    await openAddService(page)
    await fillServiceForm(page, { name, url: site.url(), alerts: false, certCheck: { days: 0 } })
    await pressSave(page)
    await expectSummary(page, [{ label: 'Minimum days left', message: 'Must be 1 or more.' }])

    await fillServiceForm(page, { timing: null, certCheck: { days: 1 } })
    await saveService(page)
    await expect(page.getByText(`Service “${name}” added.`)).toBeVisible()
  })
})
