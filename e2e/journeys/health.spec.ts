import { expect, test } from '../support/fixtures'
import { createService, publicApi, serviceName, setPublicView, signIn, waitForStatus } from '../support/helpers'

test.describe('M4 journey 7: the health endpoint', () => {
  test('M4 journey 7 health answers without sign-in and shows no service data (FR-4, FR-96)', async ({ app, page, site, visitor }) => {
    const health = async () => {
      const res = await visitor.request.get('/health')
      return { status: res.status(), type: res.headers()['content-type'] ?? '', cookie: res.headers()['set-cookie'], text: await res.text() }
    }
    const expectOk = async () => {
      const res = await health()
      expect(res.status).toBe(200)
      expect(res.type).toMatch(/^application\/json/)
      expect(res.cookie).toBeUndefined()
      expect(JSON.parse(res.text)).toEqual({ status: 'ok' })
      return res
    }

    // 1. No cookies, no services.
    await expectOk()

    // 2. Three services, public view off, then on.
    const names = [serviceName(), serviceName(), serviceName()]
    site.route('/ok', {})
    site.route('/bad', { status: 503 })
    await signIn(page)
    await createService(page, { name: names[0], url: site.url('/ok'), alerts: false, shownOnPublic: true })
    await createService(page, { name: names[1], url: site.url('/bad'), alerts: false })
    await createService(page, { name: names[2], url: site.url('/ok'), alerts: false })
    await waitForStatus(page, names[1], 'Unhealthy')
    for (const name of names) expect((await expectOk()).text).not.toContain(name)
    await setPublicView(page, true)
    for (const name of names) expect((await expectOk()).text).not.toContain(name)

    // 3. After a restart.
    await app.restart()
    await expectOk()

    // 4. Without a session, the API refuses; the public API and health are the only paths that answer.
    for (const path of ['/api/services', '/api/settings/public-view']) {
      const res = await visitor.request.get(path)
      expect(res.status(), path).toBe(401)
      expect(res.headers()['content-type']).toMatch(/^application\/problem\+json/)
      expect(((await res.json()) as { code: string }).code).toBe('unauthenticated')
    }
    expect((await publicApi(visitor.request)).status).toBe(200)
    expect((await visitor.request.get('/health')).status()).toBe(200)
  })
})
