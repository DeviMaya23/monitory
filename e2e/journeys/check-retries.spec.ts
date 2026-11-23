import { expect, test } from '../support/fixtures'
import {
  fillServiceForm,
  openAddService,
  readStatus,
  saveService,
  serviceName,
  serviceState,
  signIn,
  waitForStatus,
} from '../support/helpers'

const timing = { interval: 15, timeout: 1, retries: 2, retryInterval: 3 }

test.describe('M3 journey 5: retries and the not-yet-checked state', () => {
  test('M3 journey 5 all attempts fail (FR-51, FR-53, FR-54, FR-112)', async ({ page, site }) => {
    test.setTimeout(120_000)
    site.route('/', { status: 503 })
    const name = serviceName()
    await signIn(page)
    await openAddService(page)
    await fillServiceForm(page, { name, url: site.url(), timing, alerts: false })
    await saveService(page)

    // The first check, with its retries, takes about 6 seconds: the row is not checked yet until then.
    await waitForStatus(page, name, 'Not checked yet')
    await waitForStatus(page, name, 'Unhealthy')
    const requests = site.requests()
    expect(requests).toHaveLength(3)
    for (const [i, request] of requests.slice(1).entries()) {
      const gap = request.at - requests[i].at
      expect(gap, `gap before attempt ${i + 2}`).toBeGreaterThanOrEqual(2_500)
      expect(gap, `gap before attempt ${i + 2}`).toBeLessThanOrEqual(6_000)
    }
    const { state } = await serviceState(page, name)
    expect(state.status).toBe('unhealthy')
    expect(state.last_failure_reason?.code).toBe('non_2xx_status')
  })

  test('M3 journey 5 a retry that succeeds (FR-54)', async ({ page, site }) => {
    test.setTimeout(120_000)
    site.route('/', { failFirst: 1 })
    const name = serviceName()
    await signIn(page)
    await openAddService(page)
    await fillServiceForm(page, { name, url: site.url(), timing, alerts: false })
    await saveService(page)

    // While the cycle runs (until the site has had its second request) the row is never unhealthy.
    const refresh = page.getByRole('button', { name: 'Refresh', exact: true })
    const deadline = Date.now() + 30_000
    const seen: string[] = []
    while (site.count() < 2) {
      expect(Date.now(), 'the second request arrived in time').toBeLessThan(deadline)
      await refresh.click()
      await expect(refresh).toBeEnabled()
      seen.push(await readStatus(page, name))
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    expect(seen).not.toContain('Unhealthy')

    await waitForStatus(page, name, 'Healthy')
    expect(site.count()).toBe(2)
    const { state } = await serviceState(page, name)
    expect(state.status).toBe('healthy')
    expect(state.last_failure_reason ?? null).toBeNull()
  })
})
