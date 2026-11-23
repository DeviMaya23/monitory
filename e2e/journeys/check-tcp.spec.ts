import { expect, test } from '../support/fixtures'
import {
  fillServiceForm,
  openAddService,
  openEditService,
  runTest,
  saveService,
  serviceName,
  serviceRow,
  signIn,
  testPanel,
  testResult,
  waitForReason,
  waitForStatus,
} from '../support/helpers'
import { closedPort } from '../support/stubTcp'

const TCP_NOTE = 'TCP checks have no status code or body.'

test.describe('M3 journey 2: a TCP port check', () => {
  test('M3 journey 2 accepted, refused, and again (FR-33, FR-49, FR-52, FR-55, FR-61) @smoke', async ({ page, tcp }) => {
    test.setTimeout(120_000)
    await tcp.listen()
    const port = tcp.port
    const name = serviceName()
    await signIn(page)
    await openAddService(page)
    await fillServiceForm(page, { name, type: 'tcp', host: '127.0.0.1', port, alerts: false })
    await expect(page.getByLabel('URL', { exact: true })).toHaveCount(0)

    await runTest(page)
    const result = await testResult(page)
    expect(result).toMatchObject({ outcome: 'Healthy', httpStatus: null, body: null })
    expect(result.tookMs).toBeGreaterThanOrEqual(0)
    await expect(testPanel(page).getByText(/^Took$/)).toBeVisible()
    await expect(testPanel(page).getByText(TCP_NOTE)).toBeVisible()

    await saveService(page)
    await expect(serviceRow(page, name).getByText('TCP', { exact: true })).toBeVisible()
    await waitForStatus(page, name, 'Healthy')

    await tcp.close()
    await waitForStatus(page, name, 'Unhealthy')
    await waitForReason(page, name, 'Could not connect')

    await tcp.listen(port)
    await waitForStatus(page, name, 'Healthy')
    await waitForReason(page, name, null)

    await openEditService(page, name)
    await runTest(page)
    expect(await testResult(page)).toMatchObject({ outcome: 'Healthy' })
  })

  test('M3 journey 2 refused from the start (FR-61)', async ({ page }) => {
    test.setTimeout(120_000)
    const name = serviceName()
    await signIn(page)
    await openAddService(page)
    await fillServiceForm(page, { name, type: 'tcp', host: '127.0.0.1', port: await closedPort(), alerts: false })
    await runTest(page)
    expect(await testResult(page)).toMatchObject({ outcome: 'Failed', reason: 'Could not connect', httpStatus: null })
    await expect(testPanel(page).getByText(TCP_NOTE)).toBeVisible()
    await saveService(page)
    await waitForStatus(page, name, 'Unhealthy')
    await waitForReason(page, name, 'Could not connect')
  })
})
