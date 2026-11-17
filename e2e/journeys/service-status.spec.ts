import { expect, test } from '../support/fixtures'
import { addService, serviceName, serviceRow, signIn, waitForStatus } from '../support/helpers'

test('journey 3: unhealthy, then healthy again (FR-54, FR-55, FR-61, FR-62)', async ({ page, stub }) => {
  const name = serviceName()
  await signIn(page)
  await addService(page, name, stub.url)
  await waitForStatus(page, name, 'Healthy')

  stub.setStatus(503)
  await waitForStatus(page, name, 'Unhealthy')
  await expect(serviceRow(page, name).getByText('Returned HTTP 503 (expected 2xx)')).toBeVisible()

  stub.setStatus(200)
  await waitForStatus(page, name, 'Healthy')
  await expect(page.getByText('Returned HTTP 503 (expected 2xx)')).toHaveCount(0)
})

test('journey 4: checks repeat at the interval (FR-10)', async ({ page, stub }) => {
  const name = serviceName()
  await signIn(page)
  await addService(page, name, stub.url)

  await expect.poll(() => stub.count(), { timeout: 30_000, intervals: [250] }).toBeGreaterThanOrEqual(3)
  const times = stub.requests().map((r) => r.at)
  for (let i = 1; i < 3; i++) {
    const gap = times[i] - times[i - 1]
    expect(gap).toBeGreaterThanOrEqual(4_500)
    expect(gap).toBeLessThanOrEqual(9_000)
  }
  await waitForStatus(page, name, 'Healthy')
})
