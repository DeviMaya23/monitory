import type { Locator, Page } from '@playwright/test'
import { expect, test } from '../support/fixtures'
import { createService, serviceName, serviceRow, servicesHeading, signIn } from '../support/helpers'

/** Toasts have the role `dialog`; the text tells them apart from the real dialogs. */
function toast(page: Page): Locator {
  return page.getByRole('dialog').filter({ hasText: 'Public page turned' })
}

/**
 * Presses the `Public page` switch and waits for its toast. Waits first for every earlier toast to go
 * (a service saved a moment ago leaves one too), so the one toast shown is the whole stack.
 */
async function makeToast(page: Page): Promise<void> {
  // A toast under the pointer keeps its timer paused: the last click may have left the pointer where one appears.
  await page.mouse.move(1, 1)
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 8_000 })
  const toggle = page.getByRole('switch', { name: 'Public page', exact: true })
  await expect(toggle).toBeEnabled()
  await toggle.click()
  await expect(toast(page)).toHaveCount(1)
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

async function toastBox(page: Page): Promise<Box> {
  const box = await toast(page).boundingBox()
  expect(box, 'the toast has a box').not.toBeNull()
  return box!
}

async function clientSize(page: Page): Promise<{ w: number; h: number }> {
  return page.evaluate(() => ({ w: document.documentElement.clientWidth, h: document.documentElement.clientHeight }))
}

test.describe('M5 journeys 14 and 15: toast placement and the late save', () => {
  test('M5 journey 14 the toast is placed against the window and stays under a dialog (NFR-4, FR-95)', async ({
    page,
    site,
    browser,
    app,
  }) => {
    test.setTimeout(90_000)
    site.route('/', {})
    await page.setViewportSize({ width: 1000, height: 400 })
    await signIn(page)
    const names: string[] = []
    for (let i = 0; i < 5; i++) {
      const name = serviceName()
      names.push(name)
      await createService(page, { name, url: site.url('/'), alerts: false })
    }
    await expect(page.getByRole('list', { name: 'Services' }).getByRole('listitem')).toHaveCount(5)
    const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight)
    expect(scrollable, 'the dashboard is taller than the window').toBe(true)
    await page.evaluate(() => window.scrollTo(0, 0))

    // 1. Bottom 16 px above the window's bottom, right 16 px inside its right.
    await makeToast(page)
    const size = await clientSize(page)
    const box = await toastBox(page)
    expect(Math.abs(size.h - (box.y + box.height) - 16)).toBeLessThanOrEqual(1)
    expect(Math.abs(size.w - (box.x + box.width) - 16)).toBeLessThanOrEqual(1)

    // 3. Under a dialog, in both directions (while this toast is up).
    const target = names[0]
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const insideToast = (p: Page) =>
      p.evaluate(
        ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[role="dialog"]')?.textContent?.includes('Public page turned'),
        centre,
      )
    expect(await insideToast(page), 'the toast is on top before a dialog').toBe(true)
    await page.getByRole('button', { name: `Delete ${target}`, exact: true }).focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('alertdialog', { name: `Delete “${target}”?` })
    await expect(dialog).toBeVisible()
    expect(await insideToast(page), 'the dialog layer is above the toast').toBe(false)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    if ((await toast(page).count()) === 0) {
      // The 5 seconds ran out: make it again and measure again.
      await makeToast(page)
      const again = await toastBox(page)
      centre.x = again.x + again.width / 2
      centre.y = again.y + again.height / 2
    }
    expect(await insideToast(page), 'the toast is back on top after Escape').toBe(true)

    // 2. A narrow window: 12 px from the bottom, the left and the right.
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 8_000 })
    const narrow = await browser.newContext({ baseURL: app.baseURL, viewport: { width: 360, height: 600 } })
    try {
      const small = await narrow.newPage()
      await signIn(small)
      await makeToast(small)
      const s = await clientSize(small)
      const b = await toastBox(small)
      expect(Math.abs(s.h - (b.y + b.height) - 12)).toBeLessThanOrEqual(1)
      expect(Math.abs(b.x - 12)).toBeLessThanOrEqual(1)
      expect(Math.abs(s.w - (b.x + b.width) - 12)).toBeLessThanOrEqual(1)
    } finally {
      await narrow.close()
    }
  })

  test('M5 journey 15 a save that finishes after the admin left still refreshes the dashboard (FR-95)', async ({ page, site }) => {
    site.route('/', {})
    const first = serviceName()
    const second = serviceName()
    await signIn(page)
    await createService(page, { name: first, url: site.url('/'), alerts: false })
    await expect(serviceRow(page, first)).toBeVisible()

    // 1. Hold the answer to the save.
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    let reached: () => void = () => {}
    const requestSeen = new Promise<void>((resolve) => (reached = resolve))
    await page.route('**/api/services', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      reached()
      await held
      await route.continue()
    })

    // 2. Save.
    await page.getByRole('link', { name: 'Add service' }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: 'Add service', exact: true })).toBeVisible()
    await page.getByLabel('Name', { exact: true }).fill(second)
    await page.getByLabel('URL', { exact: true }).fill(site.url('/'))
    await page.getByRole('button', { name: /^Save/ }).click()
    await requestSeen

    // 3. Leave with the back link; the dashboard still shows one service.
    await page.getByRole('link', { name: 'Services', exact: true }).click()
    await expect(servicesHeading(page)).toBeVisible()
    await expect(page.getByRole('list', { name: 'Services' }).getByRole('listitem')).toHaveCount(1)
    await expect(serviceRow(page, first)).toBeVisible()

    // 4. Release the save: the new service shows without waiting for the automatic refresh.
    release()
    await expect(serviceRow(page, second)).toBeVisible({ timeout: 5_000 })
    const list = (await (await page.request.get('/api/services')).json()) as unknown[]
    expect(list).toHaveLength(2)
  })
})
