import { expect, test } from '../support/fixtures'
import { addService, serviceName, serviceRow, signIn, waitForStatus } from '../support/helpers'

interface ServiceBody {
  name: string
  state: { last_status_change_at: string | null }
}

async function changedAt(page: import('@playwright/test').Page, name: string): Promise<string | null> {
  const body = (await (await page.request.get('/api/services')).json()) as { items?: ServiceBody[] } | ServiceBody[]
  const items = Array.isArray(body) ? body : (body.items ?? [])
  const found = items.find((s) => s.name === name)
  expect(found).toBeTruthy()
  return found!.state.last_status_change_at
}

test('journey 6: restart keeps services and state (FR-5, FR-101, FR-103, FR-111, FR-114)', async ({
  page,
  app,
  stub,
}) => {
  const name = serviceName()
  await signIn(page)
  await addService(page, name, stub.url)
  await waitForStatus(page, name, 'Healthy')
  const before = await changedAt(page, name)
  expect(before).not.toBeNull()

  await app.stop()
  const noted = stub.count()
  await app.start()
  // Checks resume at once: a request within 4 s of start, far under the 6 s interval.
  await expect.poll(() => stub.count(), { timeout: 4_000, intervals: [100] }).toBeGreaterThan(noted)

  await page.reload()
  await expect(page).toHaveURL(/\/sign-in$/)

  await signIn(page)
  await expect(serviceRow(page, name)).toBeVisible()
  await waitForStatus(page, name, 'Healthy')
  expect(await changedAt(page, name)).toBe(before)

  await app.stop()
  await app.start({ ADMIN_PASSWORD: 'e2e-password-2' })
  await page.goto('/sign-in')
  await page.getByLabel('Username').fill('e2e-admin')
  await page.getByLabel('Password').fill('e2e-password-1')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Username or password is incorrect.')).toBeVisible()
  await page.getByLabel('Password').fill('e2e-password-2')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Services', exact: true })).toBeVisible()
})
