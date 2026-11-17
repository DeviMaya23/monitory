import { ADMIN_PASSWORD, ADMIN_USERNAME } from '../support/app'
import { expect, test } from '../support/fixtures'
import { servicesHeading, signIn } from '../support/helpers'

async function attemptSignIn(page: import('@playwright/test').Page, username: string, password: string) {
  await page.goto('/sign-in')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

test('journey 1: sign in and out (FR-1, FR-3, FR-4) @smoke', async ({ page, playwright, baseURL }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/sign-in$/)

  await attemptSignIn(page, ADMIN_USERNAME, 'not-the-password')
  await expect(page.getByText('Username or password is incorrect.')).toBeVisible()
  await expect(page).toHaveURL(/\/sign-in$/)

  await attemptSignIn(page, 'not-the-admin', ADMIN_PASSWORD)
  await expect(page.getByText('Username or password is incorrect.')).toBeVisible()
  await expect(page).toHaveURL(/\/sign-in$/)

  await signIn(page)
  await expect(page.getByText('No services yet')).toBeVisible()

  await page.reload()
  await expect(servicesHeading(page)).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/sign-in$/)

  const after = await page.request.get('/api/services')
  expect(after.status()).toBe(401)
  expect((await after.json()).code).toBe('unauthenticated')

  const bare = await playwright.request.newContext({ baseURL })
  try {
    expect((await bare.get('/api/services')).status()).toBe(401)
  } finally {
    await bare.dispose()
  }
})
