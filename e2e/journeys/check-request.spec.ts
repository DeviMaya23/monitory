import { expect, test } from '../support/fixtures'
import {
  fillServiceForm,
  openAddService,
  openEditService,
  saveService,
  serviceName,
  signIn,
  waitForCount,
  waitForStatus,
} from '../support/helpers'

const TOKEN = { name: 'X-E2E-Token', value: 'abc123' }
const API_KEY = { name: 'x-api-key', value: 'k-1' }

test.describe('M3 journey 3: the saved request, redirects and the edit screen', () => {
  test('M3 journey 3 the request arrives as saved (FR-35, FR-36, FR-37)', async ({ page, site }) => {
    test.setTimeout(120_000)
    site.route('/probe', {})
    const name = serviceName()
    await signIn(page)
    await openAddService(page)
    await fillServiceForm(page, {
      name,
      method: 'POST',
      url: site.url('/probe'),
      queryParams: [
        { name: 'a', value: '1' },
        { name: 'b', value: 'two words' },
      ],
      headers: [TOKEN, API_KEY],
      bodyType: 'JSON',
      body: '{"ping":true}',
      alerts: false,
    })
    await saveService(page)
    await waitForCount(() => site.requestsTo('/probe').length, 1)
    const first = site.requestsTo('/probe')[0]
    expect(first.method).toBe('POST')
    expect(['/probe?a=1&b=two+words', '/probe?a=1&b=two%20words']).toContain(first.url)
    expect(first.headers['x-e2e-token']).toBe('abc123')
    expect(first.headers['x-api-key']).toBe('k-1')
    expect(first.headers['content-type']).toBe('application/json')
    expect(first.body).toBe('{"ping":true}')
    expect(first.headers['user-agent']).toBe('Monitory')

    // Edit to GET with no body: a later check has neither a body nor a content type.
    await openEditService(page, name)
    await fillServiceForm(page, { method: 'GET', bodyType: 'None', timing: null })
    await saveService(page)
    await waitForCount(() => site.requestsTo('/probe').filter((r) => r.method === 'GET').length, 1)
    const get = site.requestsTo('/probe').find((r) => r.method === 'GET')!
    expect(get.body).toBe('')
    expect(get.headers['content-type']).toBeUndefined()
  })

  test('M3 journey 3 each body type arrives as saved (FR-37)', async ({ page, site }) => {
    test.setTimeout(120_000)
    site.route('/text', {})
    site.route('/form', {})
    const textName = serviceName()
    const formName = serviceName()
    await signIn(page)
    await openAddService(page)
    await fillServiceForm(page, { name: textName, method: 'POST', url: site.url('/text'), bodyType: 'Plain text', body: 'plain body, 1 line', alerts: false })
    await saveService(page)
    await openAddService(page)
    await fillServiceForm(page, { name: formName, method: 'POST', url: site.url('/form'), bodyType: 'Form (URL-encoded)', body: 'x=1&y=two+words', alerts: false })
    await saveService(page)
    await waitForCount(() => site.requestsTo('/text').length, 1)
    await waitForCount(() => site.requestsTo('/form').length, 1)
    const text = site.requestsTo('/text')[0]
    expect(text.headers['content-type']).toBe('text/plain')
    expect(text.body).toBe('plain body, 1 line')
    const form = site.requestsTo('/form')[0]
    expect(form.headers['content-type']).toBe('application/x-www-form-urlencoded')
    expect(form.body).toBe('x=1&y=two+words')
  })

  test('M3 journey 3 the edit screen shows the saved header values in full (FR-39)', async ({ page, site }) => {
    site.route('/probe', {})
    const name = serviceName()
    await signIn(page)
    await openAddService(page)
    await fillServiceForm(page, {
      name,
      method: 'POST',
      url: site.url('/probe'),
      queryParams: [
        { name: 'a', value: '1' },
        { name: 'b', value: 'two words' },
      ],
      headers: [TOKEN, API_KEY],
      bodyType: 'JSON',
      body: '{"ping":true}',
      alerts: false,
    })
    await saveService(page)
    await openEditService(page, name)
    await expect(page.getByLabel('Header 1 value', { exact: true })).toHaveValue('abc123')
    await expect(page.getByLabel('Header 2 value', { exact: true })).toHaveValue('k-1')
    await expect(page.getByLabel('Header 1 name', { exact: true })).toHaveValue('X-E2E-Token')
    await expect(page.getByLabel('Method', { exact: true })).toHaveText('POST')
    await expect(page.getByLabel('Query parameter 1 name', { exact: true })).toHaveValue('a')
    await expect(page.getByLabel('Query parameter 1 value', { exact: true })).toHaveValue('1')
    await expect(page.getByLabel('Query parameter 2 name', { exact: true })).toHaveValue('b')
    await expect(page.getByLabel('Query parameter 2 value', { exact: true })).toHaveValue('two words')
    await expect(page.getByLabel('Body', { exact: true })).toHaveValue('{"ping":true}')
    await expect(page.getByText('Values are shown in full.')).toBeVisible()
  })

  test('M3 journey 3 redirects carry the saved headers (FR-58)', async ({ page, site }) => {
    test.setTimeout(120_000)
    site.route('/start', { redirectTo: '/mid' })
    site.route('/mid', { redirectTo: '/end' })
    site.route('/end', {})
    const name = serviceName()
    await signIn(page)
    await openAddService(page)
    await fillServiceForm(page, { name, url: site.url('/start'), headers: [TOKEN], alerts: false })
    await saveService(page)
    await waitForStatus(page, name, 'Healthy')
    const firstCycle = site.requests().slice(0, 3)
    expect(firstCycle.map((r) => r.url)).toEqual(['/start', '/mid', '/end'])
    for (const request of firstCycle) expect(request.headers['x-e2e-token']).toBe('abc123')
  })
})
