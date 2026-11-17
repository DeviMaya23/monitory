import { expect, test } from '../support/fixtures'
import { addService, serviceName, serviceRow, signIn, waitForStatus } from '../support/helpers'

interface ServiceBody {
  id: string
  name: string
}

test('journey 5: delete a service (FR-8, FR-70, FR-71, FR-72) @smoke', async ({ page, stub }) => {
  const name = serviceName()
  await signIn(page)
  await addService(page, name, stub.url)
  await waitForStatus(page, name, 'Healthy')

  // No alert list screen exists yet: give the service two targets over HTTP.
  const session = await page.request.post('/api/session', {
    data: { username: 'e2e-admin', password: 'e2e-password-1' },
  })
  expect(session.ok()).toBe(true)
  const cookies = await page.context().cookies()
  const csrf = cookies.find((c) => c.name === 'csrf_token')?.value
  expect(csrf).toBeTruthy()
  const listed = await page.request.get('/api/services')
  const services = (await listed.json()) as { items?: ServiceBody[] } | ServiceBody[]
  const items = Array.isArray(services) ? services : (services.items ?? [])
  const id = items.find((s) => s.name === name)?.id
  expect(id).toBeTruthy()
  const headers = { 'X-CSRF-Token': csrf! }
  const email = await page.request.post(`/api/services/${id}/targets`, {
    headers,
    data: { type: 'email', address: 'ops@example.com' },
  })
  expect(email.status(), await email.text()).toBe(201)
  const hook = await page.request.post(`/api/services/${id}/targets`, {
    headers,
    data: { type: 'webhook', url: 'https://hooks.example.com/e2e' },
  })
  expect(hook.status(), await hook.text()).toBe(201)

  await page.reload()
  await page.getByRole('button', { name: `Delete ${name}` }).click()
  const dialog = page.getByRole('alertdialog', { name: `Delete “${name}”?` })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Its alert list goes with it: 2 notification targets.')).toBeVisible()
  await expect(dialog.getByText('Checks stop and its current state is removed. This can’t be undone.')).toBeVisible()

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(serviceRow(page, name)).toBeVisible()
  const still = await (await page.request.get('/api/services')).json()
  expect(JSON.stringify(still)).toContain(id!)

  await page.getByRole('button', { name: `Delete ${name}` }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete service', exact: true }).click()
  await expect(page.getByText('Service deleted.')).toBeVisible()
  const toastAt = Date.now()
  await expect(serviceRow(page, name)).toHaveCount(0)
  await expect(page.getByText('No services yet')).toBeVisible()
  await page.reload()
  await expect(page.getByText('No services yet')).toBeVisible()

  const targets = await page.request.get(`/api/services/${id}/targets`)
  expect(targets.status()).toBe(404)

  // Waits for nothing to happen: past the longest attempt (3 s), then past one interval (6 s).
  await page.waitForTimeout(Math.max(0, 4_000 - (Date.now() - toastAt)))
  const count = stub.count()
  await page.waitForTimeout(8_000)
  expect(stub.count()).toBe(count)

  // A service with no targets.
  const other = serviceName()
  await addService(page, other, stub.url)
  await page.getByRole('button', { name: `Delete ${other}` }).click()
  await expect(page.getByRole('alertdialog').getByText('It has no notification targets.')).toBeVisible()
})
