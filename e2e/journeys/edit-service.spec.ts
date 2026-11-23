import { expect, test } from '../support/fixtures'
import {
  cancelForm,
  fillServiceForm,
  openAddService,
  openEditService,
  readStatus,
  saveService,
  serviceName,
  serviceRow,
  serviceState,
  signIn,
  waitForCount,
  waitForReason,
  waitForStatus,
} from '../support/helpers'

const timing20 = { interval: 20, timeout: 1, retries: 1, retryInterval: 1 }

test.describe('M3 journey 7: editing a service', () => {
  test('M3 journey 7 editing keeps the state and applies at the next check (FR-66, FR-67)', async ({ page, site }) => {
    test.setTimeout(120_000)
    site.route('/', {})
    site.route('/other', { status: 503 })
    const name = serviceName()
    await signIn(page)
    await openAddService(page)
    await fillServiceForm(page, { name, url: site.url(), timing: timing20, alerts: false })
    await saveService(page)
    await waitForStatus(page, name, 'Healthy')
    const before = await serviceState(page, name)
    expect(before.state.last_status_change_at).toBeTruthy()

    await openEditService(page, name)
    await fillServiceForm(page, { timing: null, url: site.url('/other') })
    await saveService(page)
    await expect(page.getByText(`Service “${name}” saved.`)).toBeVisible()
    // No check runs at the moment of saving, and the state is the old one.
    expect(site.requestsTo('/other')).toHaveLength(0)
    expect(await readStatus(page, name)).toBe('Healthy')
    expect((await serviceState(page, name)).state.last_status_change_at).toBe(before.state.last_status_change_at)

    // The next scheduled check uses the new URL.
    await waitForStatus(page, name, 'Unhealthy')
    expect(site.requestsTo('/other').length).toBeGreaterThan(0)
    await waitForReason(page, name, 'Returned HTTP 503 (expected 2xx)')
  })

  test('M3 journey 7 a type change keeps the state (FR-66)', async ({ page, site, tcp }) => {
    test.setTimeout(120_000)
    site.route('/', {})
    await tcp.listen()
    const name = serviceName()
    await signIn(page)
    await openAddService(page)
    await fillServiceForm(page, { name, type: 'tcp', host: '127.0.0.1', port: tcp.port, alerts: false })
    await saveService(page)
    await waitForStatus(page, name, 'Healthy')
    const changed = (await serviceState(page, name)).state.last_status_change_at
    expect(changed).toBeTruthy()

    await openEditService(page, name)
    await fillServiceForm(page, { type: 'http', url: site.url(), timing: null })
    await saveService(page)
    await expect(serviceRow(page, name).getByText('HTTP', { exact: true })).toBeVisible()
    expect((await serviceState(page, name)).state.last_status_change_at).toBe(changed)
    await waitForCount(() => site.count(), 1)
    await waitForStatus(page, name, 'Healthy')
    expect((await serviceState(page, name)).state.last_status_change_at).toBe(changed)

    await openEditService(page, name)
    await fillServiceForm(page, { type: 'tcp', host: '127.0.0.1', port: tcp.port, timing: null })
    await saveService(page)
    await expect(serviceRow(page, name).getByText('TCP', { exact: true })).toBeVisible()
    expect((await serviceState(page, name)).state.last_status_change_at).toBe(changed)
  })

  test('M3 journey 7 an invalid edit is refused and nothing changes (FR-12, FR-74)', async ({ page, site, tcp }) => {
    test.setTimeout(120_000)
    site.route('/', {})
    await tcp.listen()
    const tcpName = serviceName()
    const httpName = serviceName()
    await signIn(page)
    await openAddService(page)
    await fillServiceForm(page, { name: tcpName, type: 'tcp', host: '127.0.0.1', port: tcp.port, alerts: false })
    await saveService(page)
    await openAddService(page)
    await fillServiceForm(page, { name: httpName, url: site.url(), alerts: false })
    await saveService(page)
    await waitForStatus(page, tcpName, 'Healthy')
    await waitForStatus(page, httpName, 'Healthy')

    // A TCP service with no port: the screen refuses.
    const tcpBefore = await serviceState(page, tcpName)
    await openEditService(page, tcpName)
    await fillServiceForm(page, { port: '', timing: null })
    await page.getByRole('button', { name: 'Save service', exact: true }).click()
    await expect(page.getByText('Enter a whole number.')).toBeVisible()
    await cancelForm(page)
    const tcpAfter = await serviceState(page, tcpName)
    expect(tcpAfter.state.status).toBe(tcpBefore.state.status)
    expect(tcpAfter.state.last_status_change_at).toBe(tcpBefore.state.last_status_change_at)
    await openEditService(page, tcpName)
    await expect(page.getByLabel('Port', { exact: true })).toHaveValue(String(tcp.port))
    await cancelForm(page)

    // An HTTP service with a URL the server refuses.
    const httpBefore = await serviceState(page, httpName)
    await openEditService(page, httpName)
    await fillServiceForm(page, { url: 'ftp://x.test', timing: null })
    await page.getByRole('button', { name: 'Save service', exact: true }).click()
    const summary = page.getByRole('alert').filter({ hasText: '1 field needs fixing before this can be saved.' })
    await expect(summary).toBeVisible()
    await expect(summary.getByText('URL: Enter a URL that starts with http:// or https://.')).toBeVisible()
    await cancelForm(page)
    const httpAfter = await serviceState(page, httpName)
    expect(httpAfter.state.status).toBe(httpBefore.state.status)
    expect(httpAfter.state.last_status_change_at).toBe(httpBefore.state.last_status_change_at)
    await openEditService(page, httpName)
    await expect(page.getByLabel('URL', { exact: true })).toHaveValue(site.url())
  })

  test('M3 journey 7 a name taken by another service (FR-59)', async ({ page, site }) => {
    site.route('/', {})
    const a = serviceName()
    const b = serviceName()
    await signIn(page)
    await openAddService(page)
    await fillServiceForm(page, { name: a, url: site.url(), alerts: false })
    await saveService(page)
    await openAddService(page)
    await fillServiceForm(page, { name: b, url: site.url(), alerts: false })
    await saveService(page)

    await openEditService(page, b)
    await fillServiceForm(page, { name: a.toUpperCase(), timing: null })
    await page.getByRole('button', { name: 'Save service', exact: true }).click()
    const name = page.getByLabel('Name', { exact: true })
    await expect(name).toHaveAccessibleDescription('Another service already uses this name (names ignore case).')
    expect((await serviceState(page, b)).id).toBeTruthy()

    await fillServiceForm(page, { name: b.toUpperCase(), timing: null })
    await saveService(page)
    await expect(page.getByText(`Service “${b.toUpperCase()}” saved.`)).toBeVisible()
    expect((await serviceState(page, b.toUpperCase())).id).toBeTruthy()
    expect((await serviceState(page, a)).id).toBeTruthy()
  })
})
