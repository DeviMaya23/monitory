import { expect, test } from '../support/fixtures'
import { addService, serviceName, serviceRow, servicesHeading, signIn, waitForStatus } from '../support/helpers'

test('journey 2: add a service and see it checked (FR-6, FR-9, FR-10, FR-67, FR-112, FR-95) @smoke', async ({
  page,
  stub,
}) => {
  const name = serviceName()
  await signIn(page)
  await addService(page, name, stub.url)
  await expect(page.getByText(`Service “${name}” added.`)).toBeVisible()

  const row = serviceRow(page, name)
  await expect(row).toBeVisible()
  await expect(row.getByText('HTTP', { exact: true })).toBeVisible()
  await waitForStatus(page, name, 'Healthy')
  await expect(row.getByText('Never', { exact: true })).toHaveCount(0)
  expect(stub.requests().some((r) => r.method === 'GET' && r.path === '/')).toBe(true)
})

test('journey 2: a taken name and an empty name are refused (FR-12, FR-59)', async ({ page, stub }) => {
  const name = serviceName()
  await signIn(page)
  await addService(page, name, stub.url)
  await expect(serviceRow(page, name)).toBeVisible()

  const posts: string[] = []
  page.on('request', (req) => {
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/services') posts.push(req.url())
  })

  await page.getByRole('link', { name: 'Add service' }).first().click()
  await page.getByLabel('Name').fill(name.toUpperCase())
  await page.getByLabel('URL').fill(stub.url)
  await page.getByRole('button', { name: 'Save service' }).click()
  await expect(page.getByText('Another service already uses this name (names ignore case).')).toBeVisible()
  await expect(page.getByLabel('Name')).toBeVisible()
  expect(posts).toHaveLength(1)

  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeVisible()
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await expect(servicesHeading(page)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Services' }).getByRole('listitem')).toHaveCount(1)

  posts.length = 0
  await page.getByRole('link', { name: 'Add service' }).first().click()
  await page.getByLabel('URL').fill(stub.url)
  await page.getByRole('button', { name: 'Save service' }).click()
  await expect(page.getByText('Enter a name.').first()).toBeVisible()
  expect(posts).toHaveLength(0)
})
