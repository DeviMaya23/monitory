import type { Page } from '@playwright/test'
import { expiredCert, validCert, wrongHostCert, type Cert } from '../support/certs'
import { expect, test } from '../support/fixtures'
import {
  fillServiceForm,
  openAddService,
  runTest,
  saveService,
  serviceName,
  serviceRow,
  signIn,
  testResult,
  waitForReason,
  waitForStatus,
} from '../support/helpers'
import type { StubSite } from '../support/stubSite'

type TlsSite = (cert: Cert) => Promise<StubSite>

async function openForm(page: Page, tlsSite: TlsSite, cert: Cert): Promise<{ name: string; site: StubSite }> {
  const site = await tlsSite(cert)
  site.route('/', {})
  const name = serviceName()
  await signIn(page)
  await openAddService(page)
  await fillServiceForm(page, { name, url: site.url(), alerts: false })
  return { name, site }
}

const PROBLEM = { outcome: 'Failed', reason: 'Certificate problem' }

test.describe('M3 journey 4: certificates', () => {
  test('M3 journey 4 self-signed fails, and is accepted when ignored (FR-64)', async ({ page, tlsSite }) => {
    test.setTimeout(120_000)
    const { name } = await openForm(page, tlsSite, await validCert(30))
    await runTest(page)
    expect(await testResult(page)).toMatchObject(PROBLEM)

    await fillServiceForm(page, { timing: null, ignoreCert: true })
    await runTest(page)
    expect(await testResult(page)).toMatchObject({ outcome: 'Healthy', httpStatus: 200 })

    await saveService(page)
    await waitForStatus(page, name, 'Healthy')
  })

  test('M3 journey 4 an expired certificate fails unless errors are ignored (FR-64)', async ({ page, tlsSite }) => {
    const { site } = await openForm(page, tlsSite, await expiredCert())
    await runTest(page)
    expect(await testResult(page)).toMatchObject(PROBLEM)

    await fillServiceForm(page, { timing: null, ignoreCert: true })
    await runTest(page)
    expect(await testResult(page)).toMatchObject({ outcome: 'Healthy' })
    expect(site.count()).toBe(1)
  })

  test('M3 journey 4 a name that does not match (FR-64)', async ({ page, tlsSite }) => {
    const { site } = await openForm(page, tlsSite, await wrongHostCert())
    await runTest(page)
    expect(await testResult(page)).toMatchObject(PROBLEM)

    await fillServiceForm(page, { timing: null, ignoreCert: true })
    await runTest(page)
    expect(await testResult(page)).toMatchObject({ outcome: 'Healthy' })
    expect(site.count()).toBe(1)
  })

  test('M3 journey 4 the expiry check applies when errors are ignored (FR-50, FR-64)', async ({ page, tlsSite }) => {
    test.setTimeout(120_000)
    const { name } = await openForm(page, tlsSite, await validCert(10))
    await fillServiceForm(page, { timing: null, ignoreCert: true, certCheck: { days: 30 } })
    await runTest(page)
    expect(await testResult(page)).toMatchObject(PROBLEM)

    await fillServiceForm(page, { timing: null, certCheck: { days: 5 } })
    await runTest(page)
    expect(await testResult(page)).toMatchObject({ outcome: 'Healthy' })

    await fillServiceForm(page, { timing: null, certCheck: { days: 10 } })
    await runTest(page)
    expect(await testResult(page)).toMatchObject({ outcome: 'Healthy' })

    await fillServiceForm(page, { timing: null, certCheck: { days: 30 } })
    await saveService(page)
    await waitForStatus(page, name, 'Unhealthy')
    await waitForReason(page, name, 'Certificate problem')
  })

  test('M3 journey 4 an expired certificate has 0 days left (FR-64)', async ({ page, tlsSite }) => {
    await openForm(page, tlsSite, await expiredCert())
    await fillServiceForm(page, { timing: null, ignoreCert: true, certCheck: { days: 1 } })
    await runTest(page)
    expect(await testResult(page)).toMatchObject(PROBLEM)
  })

  test('M3 journey 4 the screen switches the options off for a URL that is not https (FR-74)', async ({ page, site }) => {
    const name = serviceName()
    await signIn(page)
    await openAddService(page)
    await fillServiceForm(page, { name, url: 'https://127.0.0.1:1/', certCheck: { days: 5 }, ignoreCert: true, alerts: false })
    const expiry = page.getByRole('switch', { name: 'Check certificate expiry', exact: true })
    const ignore = page.getByRole('switch', { name: 'Ignore certificate errors', exact: true })
    await expect(expiry).toHaveAttribute('aria-checked', 'true')
    await expect(ignore).toHaveAttribute('aria-checked', 'true')

    await fillServiceForm(page, { timing: null, url: site.url() })
    await expect(page.getByText('Available only when the URL starts with https://.')).toBeVisible()
    for (const toggle of [expiry, ignore]) {
      await expect(toggle).toHaveAttribute('aria-checked', 'false')
      await expect(toggle).toBeDisabled()
    }

    await saveService(page)
    await expect(page.getByText(`Service “${name}” added.`)).toBeVisible()
    await expect(serviceRow(page, name)).toBeVisible()
    await expect(page.getByText(/fields? needs? fixing/)).toHaveCount(0)
  })
})
