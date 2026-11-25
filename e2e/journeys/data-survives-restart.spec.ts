import type { Page } from '@playwright/test'
import { expect, test } from '../support/fixtures'
import {
  addTarget,
  createService,
  listTargets,
  openAlertList,
  publicNames,
  serviceName,
  serviceId,
  setPublicView,
  signIn,
  waitForPaused,
  waitForStatus,
} from '../support/helpers'

interface ServiceBody {
  id: string
  name: string
  state: { status: string; last_checked_at?: string | null; last_status_change_at?: string | null }
  [key: string]: unknown
}

async function listServices(page: Page): Promise<ServiceBody[]> {
  const res = await page.request.get('/api/services')
  expect(res.ok()).toBe(true)
  return (await res.json()) as ServiceBody[]
}

/** The body without the one field a new check may change. */
function withoutLastChecked(list: ServiceBody[]): unknown {
  return list.map((s) => {
    const { last_checked_at: _dropped, ...state } = s.state
    return { ...s, state }
  })
}

test('M5 journey 9: services, targets and the public view survive a restart (NFR-1)', async ({ page, app, site, receiver, visitor }) => {
  test.setTimeout(120_000)
  const a = serviceName()
  const b = serviceName()
  site.route('/a', {})
  site.route('/b', {})

  // 1. The data.
  await signIn(page)
  await setPublicView(page, true)
  await createService(page, { name: a, url: site.url('/a'), alerts: true, shownOnPublic: true })
  await createService(page, { name: b, url: site.url('/b'), alerts: false, shownOnPublic: false })
  await waitForStatus(page, a, 'Healthy')
  await waitForStatus(page, b, 'Healthy')
  await page.getByRole('button', { name: `Pause ${b}`, exact: true }).click()
  await waitForPaused(page, b, true)
  await openAlertList(page, a)
  await addTarget(page, { type: 'email', address: 'ops@e2e.test', name: 'Ops' })
  await addTarget(page, {
    type: 'webhook',
    url: receiver.hookUrl,
    name: 'Hook',
    headers: [{ name: 'X-Token', value: 'secret-token' }],
  })
  await page.goto('/')
  await expect(page.getByRole('list', { name: 'Services' })).toBeVisible()

  // 2. Before.
  const idA = await serviceId(page, a)
  const idB = await serviceId(page, b)
  const servicesBefore = await listServices(page)
  const targetsA = await (await page.request.get(`/api/services/${idA}/targets`)).json()
  const targetsB = await (await page.request.get(`/api/services/${idB}/targets`)).json()
  expect((targetsA as unknown[]).length).toBe(2)
  const visitorPage = await visitor.newPage()
  await visitorPage.goto('/status')
  await expect(visitorPage.getByRole('heading', { level: 1, name: 'Service status', exact: true })).toBeVisible()
  await expect(visitorPage.getByRole('list', { name: 'Services' }).getByRole('listitem')).toHaveCount(1)
  const namesBefore = await publicNames(visitorPage)
  expect(namesBefore).toEqual([a])
  const changedBefore = servicesBefore.find((s) => s.id === idA)!.state.last_status_change_at
  expect(changedBefore).toBeTruthy()
  expect(servicesBefore.find((s) => s.id === idB)!.state.status).toBe('healthy')

  // 3. Restart. The two baselines are read before anything else happens.
  await app.restart()
  const seenA = site.requestsTo('/a').length
  const seenB = site.requestsTo('/b').length
  await page.goto('/')
  await expect(page).toHaveURL(/\/sign-in$/)
  await signIn(page)

  // 4. After.
  const servicesAfter = await listServices(page)
  expect(withoutLastChecked(servicesAfter)).toEqual(withoutLastChecked(servicesBefore))
  expect(servicesAfter.find((s) => s.id === idA)!.state.last_status_change_at).toBe(changedBefore)
  expect(await listTargets(page, idA)).toEqual(targetsA)
  expect(await listTargets(page, idB)).toEqual(targetsB)
  const toggle = page.getByRole('switch', { name: 'Public page', exact: true })
  await expect(toggle).toBeEnabled()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await visitorPage.reload()
  await expect(visitorPage.getByRole('heading', { level: 1, name: 'Service status', exact: true })).toBeVisible()
  await expect(visitorPage.getByRole('list', { name: 'Services' }).getByRole('listitem')).toHaveCount(1)
  expect(await publicNames(visitorPage)).toEqual(namesBefore)

  // 5. A is checked again (two checks, six seconds apart); B stays stopped.
  await expect
    .poll(() => site.requestsTo('/a').length, { timeout: 20_000, intervals: [500] })
    .toBeGreaterThanOrEqual(seenA + 2)
  expect(site.requestsTo('/b').length).toBe(seenB)
})
