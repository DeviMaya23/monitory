import { ADMIN_PASSWORD, ADMIN_USERNAME } from '../support/app'
import { expect, test } from '../support/fixtures'
import { attemptSignIn, servicesHeading, setCookieOf, signInApi, signInRaw } from '../support/helpers'

const HTTPS_DETAIL =
  'Sign-in is only allowed over HTTPS. If the app is behind an HTTPS proxy, set TRUST_PROXY=true. To allow sign-in over plain HTTP, set REQUIRE_HTTPS=false. Restart the app after changing either setting.'
const HTTPS_BODY = { title: 'HTTPS required', status: 403, code: 'https_required', detail: HTTPS_DETAIL }
const PROXY_HTTPS = { 'x-forwarded-proto': 'https' }

test.describe('M5 journey 4: require HTTPS refuses plain HTTP', () => {
  test.use({ appOverrides: { REQUIRE_HTTPS: 'true' } })

  test('M5 journey 4 sign-in over plain HTTP is refused before anything else is looked at (FR-97, FR-99)', async ({ visitor }) => {
    // 1. The screen.
    const v = await visitor.newPage()
    await attemptSignIn(v, ADMIN_USERNAME, ADMIN_PASSWORD)
    await expect(v.getByText('Sign-in requires HTTPS')).toBeVisible()
    await expect(v.getByText(HTTPS_DETAIL, { exact: true })).toBeVisible()
    await expect(v).toHaveURL(/\/sign-in$/)
    await expect(servicesHeading(v)).toHaveCount(0)
    await expect(v.getByText('Too many failed attempts.')).toHaveCount(0)

    // 2. The API.
    const res = await signInApi(visitor.request, ADMIN_USERNAME, ADMIN_PASSWORD)
    expect(res.status).toBe(403)
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/)
    expect(res.json).toEqual(HTTPS_BODY)
    expect(res.headers['set-cookie']).toBeUndefined()

    // 3. The scheme is checked first.
    expect((await signInApi(visitor.request, 'not-the-admin', 'not-the-password')).status).toBe(403)
    expect((await signInRaw(visitor.request, '{}', 'application/json')).status).toBe(403)

    // 4. The forwarded scheme is ignored while trust is off.
    const forwarded = await signInApi(visitor.request, ADMIN_USERNAME, ADMIN_PASSWORD, PROXY_HTTPS)
    expect(forwarded.status).toBe(403)
    expect((forwarded.json as { code: string }).code).toBe('https_required')

    // 5. The rest of the app is not affected.
    expect((await visitor.request.get('/health')).status()).toBe(200)
    const pub = await visitor.request.get('/api/public/dashboard')
    expect(pub.status()).toBe(404)
    expect((await pub.json()).code).toBe('public_view_unavailable')
    await v.goto('/status')
    await expect(v.getByText('This status page isn’t available')).toBeVisible()
    await expect(v.getByText('It has been turned off.')).toBeVisible()
  })
})

async function expectCookieBasics(headers: Record<string, string>) {
  const cookie = setCookieOf(headers)
  expect(cookie.path).toBe('/')
  expect(cookie.maxAge).toBe('2592000')
  expect(cookie.httpOnly).toBe(true)
  expect(cookie.sameSite).toBe('Strict')
  return cookie
}

test.describe('M5 journey 5: cookie, require on and trust on', () => {
  test.use({ appOverrides: { REQUIRE_HTTPS: 'true', TRUST_PROXY: 'true' } })

  test('M5 journey 5 the cookie is Secure when require HTTPS is on (FR-98, FR-99)', async ({ visitor }) => {
    const res = await signInApi(visitor.request, ADMIN_USERNAME, ADMIN_PASSWORD, PROXY_HTTPS)
    expect(res.status).toBe(200)
    const body = res.json as { csrf_token?: string; expires_at?: string }
    expect(body.csrf_token).toBeTruthy()
    expect(body.expires_at).toBeTruthy()
    const cookie = await expectCookieBasics(res.headers)
    expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(cookie.secure).toBe(true)
    expect(cookie.other).toEqual([])
    const session = await visitor.request.get('/api/session', { headers: { cookie: `session=${cookie.value}` } })
    expect(session.status()).toBe(200)

    expect((await signInApi(visitor.request, ADMIN_USERNAME, ADMIN_PASSWORD, { 'x-forwarded-proto': 'HTTPS' })).status).toBe(200)
    for (const headers of [{ 'x-forwarded-proto': 'http' }, {}] as Record<string, string>[]) {
      const refused = await signInApi(visitor.request, ADMIN_USERNAME, ADMIN_PASSWORD, headers)
      expect(refused.status).toBe(403)
      expect((refused.json as { code: string }).code).toBe('https_required')
    }
  })
})

test.describe('M5 journey 5: cookie, require off and trust on', () => {
  test.use({ appOverrides: { REQUIRE_HTTPS: 'false', TRUST_PROXY: 'true' } })

  test('M5 journey 5 the cookie is not Secure when require HTTPS is off, whatever the scheme (FR-98)', async ({ visitor }) => {
    const res = await signInApi(visitor.request, ADMIN_USERNAME, ADMIN_PASSWORD, PROXY_HTTPS)
    expect(res.status).toBe(200)
    const cookie = await expectCookieBasics(res.headers)
    expect(cookie.secure).toBe(false)
  })
})

test.describe('M5 journey 5: cookie, require off and trust off', () => {
  test('M5 journey 5 the cookie is not Secure with the default environment (FR-98, FR-99)', async ({ visitor }) => {
    const res = await signInApi(visitor.request, ADMIN_USERNAME, ADMIN_PASSWORD, PROXY_HTTPS)
    expect(res.status).toBe(200)
    const cookie = await expectCookieBasics(res.headers)
    expect(cookie.secure).toBe(false)
  })
})
