import { ADMIN_PASSWORD, ADMIN_USERNAME } from '../support/app'
import { expect, test } from '../support/fixtures'
import {
  createService,
  expectAllMarked,
  expectFieldsBeforeActions,
  expectReached,
  expectReadingOrder,
  expectTabStaysIn,
  openAlertList,
  serviceName,
  serviceRow,
  servicesHeading,
  signIn,
  tabThrough,
  targetDialog,
} from '../support/helpers'

const FORM_ACTIONS = ['Run test', 'Cancel', 'Save service']

test.describe('M5 journeys 10 to 13: the forms by keyboard (NFR-4)', () => {
  test('M5 journey 10 the sign-in form by keyboard (NFR-4) @smoke', async ({ page }) => {
    await page.goto('/sign-in')
    const username = page.getByLabel('Username')
    await expect(username).toBeFocused()

    const stops = await tabThrough(page, { max: 6, scope: page.getByRole('main') })
    expect(stops.map((s) => s.label)).toEqual(['Username', 'Password', 'Sign in'])
    expectReadingOrder(stops, { exempt: [] })
    expectAllMarked(stops)
    expectReached(stops, ['Username', 'Password', 'Sign in'])

    await username.focus()
    await page.keyboard.type(ADMIN_USERNAME)
    await page.keyboard.press('Tab')
    await page.keyboard.type(ADMIN_PASSWORD)
    await page.keyboard.press('Enter')
    await expect(servicesHeading(page)).toBeVisible()
  })

  test('M5 journey 10 Enter with a wrong password shows the banner and keeps focus in Password (NFR-4)', async ({ page }) => {
    await page.goto('/sign-in')
    await expect(page.getByLabel('Username')).toBeFocused()
    await page.keyboard.type(ADMIN_USERNAME)
    await page.keyboard.press('Tab')
    await page.keyboard.type('not-the-password')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Username or password is incorrect.')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeFocused()
  })

  test('M5 journey 11 the add and edit service forms by keyboard (NFR-4)', async ({ page, site }) => {
    site.route('/', {})
    await signIn(page)
    // 1. Add.
    await page.getByRole('link', { name: 'Add service' }).first().focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name: 'Add service', exact: true })).toBeVisible()
    const name = page.getByLabel('Name', { exact: true })
    await expect(name).toBeFocused()

    // 2. Reading order, actions last, marks, the controls reached.
    const reached = [
      'Name',
      'HTTP(S)',
      'URL',
      'Check interval',
      'Timeout',
      'Retries',
      'Retry interval',
      'Send alerts',
      'Show on public page',
      'Run test',
      'Cancel',
      'Save service',
    ]
    const main = page.getByRole('main')
    const stops = await tabThrough(page, { max: 80, scope: main })
    expectReadingOrder(stops, { exempt: FORM_ACTIONS })
    expectFieldsBeforeActions(stops, FORM_ACTIONS)
    expectAllMarked(stops)
    expectReached(stops, reached)
    expect(stops.filter((s) => s.label === 'HTTP(S)')).toHaveLength(1)

    // 3. The hint describes the Type group.
    const type = page.getByRole('radiogroup', { name: 'Type', exact: true })
    await expect(type).toHaveAccessibleDescription('Changing type swaps the fields below.')

    // 4. Arrow keys swap the fields in both directions.
    await page.getByRole('radio', { name: 'HTTP(S)', exact: true }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('radio', { name: 'TCP port', exact: true })).toBeChecked()
    await expect(page.getByLabel('Host', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Port', { exact: true })).toBeVisible()
    await expect(page.getByLabel('URL', { exact: true })).toHaveCount(0)
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('radio', { name: 'HTTP(S)', exact: true })).toBeChecked()
    await expect(page.getByLabel('URL', { exact: true })).toBeVisible()

    // 5. Fill by typing, Enter in URL saves.
    const first = serviceName()
    await name.focus()
    await page.keyboard.type(first)
    await page.keyboard.press('Tab') // the Type group
    await page.keyboard.press('Tab') // URL (the Method select may sit between; see below)
    const url = page.getByLabel('URL', { exact: true })
    if (!(await url.evaluate((el) => el === document.activeElement))) await page.keyboard.press('Tab')
    await expect(url).toBeFocused()
    await page.keyboard.type(site.url('/'))
    await page.keyboard.press('Enter')
    await expect(servicesHeading(page)).toBeVisible()
    await expect(serviceRow(page, first)).toBeVisible()

    // 6. Edit.
    await page.getByRole('link', { name: `Edit ${first}`, exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name: 'Edit service', exact: true })).toBeVisible()
    await expect(name).toHaveValue(first)
    await name.focus()
    const editStops = await tabThrough(page, { max: 80, scope: main })
    expectReadingOrder(editStops, { exempt: FORM_ACTIONS })
    expectFieldsBeforeActions(editStops, FORM_ACTIONS)
    expectAllMarked(editStops)
    expectReached(editStops, reached)
    const renamed = serviceName()
    await name.focus()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type(renamed)
    await page.keyboard.press('Enter')
    await expect(servicesHeading(page)).toBeVisible()
    await expect(serviceRow(page, renamed)).toBeVisible()
  })

  test('M5 journey 12 the notification target dialog by keyboard (NFR-4)', async ({ page, site }) => {
    site.route('/', {})
    const svc = serviceName()
    await signIn(page)
    await createService(page, { name: svc, url: site.url('/'), alerts: true })
    await openAlertList(page, svc)

    // 1. Open with Enter; focus stays inside.
    await page.getByRole('button', { name: 'Add target' }).focus()
    await page.keyboard.press('Enter')
    const dialog = targetDialog(page)
    await expect(dialog).toBeVisible()
    // Focus has moved into the dialog (its first field) before the first Tab.
    await expect(dialog.getByLabel('Name (optional)')).toBeFocused()
    await expectTabStaysIn(page, dialog, 20)

    // 2. Reading order, marks, controls reached; the type swap.
    const nameField = dialog.getByLabel('Name (optional)')
    await nameField.focus()
    const stops = await tabThrough(page, { max: 20, scope: dialog })
    expectReadingOrder(stops, { exempt: ['Close'] })
    expectAllMarked(stops)
    expectReached(stops, ['Name (optional)', 'Email', 'Email address', 'Cancel', 'Add target'])
    await dialog.getByRole('radio', { name: 'Email', exact: true }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(dialog.getByRole('radio', { name: 'Webhook', exact: true })).toBeChecked()
    await expect(dialog.getByLabel('Webhook URL')).toBeVisible()
    await expect(dialog.getByLabel('Email address')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Add header' })).toBeVisible()
    await page.keyboard.press('ArrowLeft')
    await expect(dialog.getByRole('radio', { name: 'Email', exact: true })).toBeChecked()

    // 3. Enter in the address saves.
    const address = 'kb@e2e.test'
    await dialog.getByLabel('Email address').focus()
    await page.keyboard.type(address)
    await page.keyboard.press('Enter')
    await expect(page.getByText('Target added.').first()).toBeVisible()
    await expect(dialog).toBeHidden()
    const onControl = await page.evaluate(() => {
      const el = document.activeElement
      return !!el && el !== document.body && !!el.closest('main') && !!el.closest('a, button')
    })
    expect(onControl, 'focus is on a button or link inside main').toBe(true)

    // 4. Escape with nothing typed.
    const list = page.getByRole('list', { name: 'Notification targets' })
    await expect(list.getByRole('listitem')).toHaveCount(1)
    await page.getByRole('button', { name: 'Add target' }).focus()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(list.getByRole('listitem')).toHaveCount(1)

    // 5. Edit.
    await page.getByRole('button', { name: `Edit ${address}`, exact: true }).focus()
    await page.keyboard.press('Enter')
    const edit = page.getByRole('dialog', { name: 'Edit target' })
    await expect(edit).toBeVisible()
    await expect(edit.getByLabel('Name (optional)')).toBeFocused()
    await page.keyboard.type('Keyboard')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Target saved.').first()).toBeVisible()
    await expect(edit).toBeHidden()
    await expect(list.getByRole('listitem').filter({ hasText: 'Keyboard' })).toHaveCount(1)

    // 6. Remove.
    await page.getByRole('button', { name: 'Remove Keyboard', exact: true }).focus()
    await page.keyboard.press('Enter')
    const confirm = page.getByRole('group', { name: 'Confirm removal' })
    await expect(confirm).toBeVisible()
    await expect(confirm.getByRole('button', { name: 'Remove', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByText('Target removed.').first()).toBeVisible()
    await expect(list.getByRole('listitem').filter({ hasText: 'Keyboard' })).toHaveCount(0)
  })

  test('M5 journey 13 the delete confirmation by keyboard (NFR-4)', async ({ page, site }) => {
    site.route('/', {})
    const svc = serviceName()
    await signIn(page)
    await createService(page, { name: svc, url: site.url('/'), alerts: false })
    const opener = page.getByRole('button', { name: `Delete ${svc}`, exact: true })

    // 1. Opens with focus on Cancel.
    await opener.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('alertdialog', { name: `Delete “${svc}”?` })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()

    // 2. The trap; both buttons are marked.
    const cancel = await tabThrough(page, { max: 0 })
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Delete service', exact: true })).toBeFocused()
    const del = await tabThrough(page, { max: 0 })
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    expectAllMarked([...cancel, ...del])
    await expectTabStaysIn(page, dialog, 10)

    // 3. Escape closes; the row stays; focus returns to the opener.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(serviceRow(page, svc)).toBeVisible()
    await expect(opener).toBeFocused()

    // 4. Again, Tab to Delete service, Enter.
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Delete service', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(serviceRow(page, svc)).toHaveCount(0)
    await expect(page.getByText('No services yet')).toBeVisible()
  })
})
