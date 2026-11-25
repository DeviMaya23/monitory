import { ADMIN_PASSWORD, ADMIN_USERNAME } from '../support/app'
import { expect, test } from '../support/fixtures'
import { attemptSignIn, servicesHeading, signIn, signInApi, signInRaw } from '../support/helpers'

const WRONG_PASSWORD = 'not-the-password'
const WRONG_USERNAME = 'not-the-admin'
const INCORRECT = 'Username or password is incorrect.'
const LOCKED_TITLE = 'Too many failed attempts.'
const LOCKED_BODY = { title: 'Sign-in locked', status: 429, code: 'sign_in_locked' }

const wrongPassword = (request: Parameters<typeof signInApi>[0]) => signInApi(request, ADMIN_USERNAME, WRONG_PASSWORD)
const wrongUsername = (request: Parameters<typeof signInApi>[0]) => signInApi(request, WRONG_USERNAME, ADMIN_PASSWORD)
const right = (request: Parameters<typeof signInApi>[0]) => signInApi(request, ADMIN_USERNAME, ADMIN_PASSWORD)

function retryAfter(headers: Record<string, string>): number {
  const value = headers['retry-after']
  expect(value, 'Retry-After').toMatch(/^[0-9]+$/)
  return Number(value)
}

test.describe('M5 journeys 1 to 3: the sign-in lockout', () => {
  test('M5 journey 1 five wrong attempts lock the account, in the screen and the API, not the open session (FR-2, FR-1)', async ({
    page,
    visitor,
  }) => {
    // 1. Baseline: the right credentials are accepted before the lock.
    await page.goto('/sign-in')
    await signIn(page)

    // 2. Four wrong attempts.
    for (const attempt of [wrongPassword, wrongPassword, wrongUsername, wrongUsername]) {
      const res = await attempt(visitor.request)
      expect(res.status).toBe(401)
      expect((res.json as { code: string }).code).toBe('invalid_credentials')
    }

    // 3. The fifth wrong attempt is still a 401.
    const v = await visitor.newPage()
    await attemptSignIn(v, ADMIN_USERNAME, WRONG_PASSWORD)
    await expect(v.getByText(INCORRECT)).toBeVisible()
    await expect(v.getByText(LOCKED_TITLE)).toHaveCount(0)

    // 4. The sixth attempt, with the right credentials, is refused.
    await attemptSignIn(v, ADMIN_USERNAME, ADMIN_PASSWORD)
    await expect(v.getByText(LOCKED_TITLE)).toBeVisible()
    const wait = v.getByText(/^Try again in /)
    await expect(wait).toHaveText(/^Try again in (14 min [0-9]{1,2}|15 min 0) s\.$/)
    await expect(v).toHaveURL(/\/sign-in$/)
    await expect(v.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled()
    await expect(v.getByLabel('Username')).toBeEnabled()
    await expect(v.getByLabel('Password')).toBeEnabled()
    await expect(v.getByLabel('Username')).toHaveValue(ADMIN_USERNAME)
    await expect(v.getByLabel('Password')).toHaveValue(ADMIN_PASSWORD)
    await expect(v.getByLabel('Password')).toBeFocused()
    await expect(servicesHeading(v)).toHaveCount(0)

    // 5. The countdown falls.
    const total = async () => {
      const m = /Try again in (?:(\d+) min )?(\d+) s\./.exec((await wait.textContent()) ?? '')
      expect(m, 'countdown text').not.toBeNull()
      return Number(m![1] ?? 0) * 60 + Number(m![2])
    }
    const firstReading = await total()
    await expect.poll(total, { intervals: [500], timeout: 10_000, message: 'the countdown falls' }).toBeLessThan(firstReading)

    // 6. The API: the same refusal for right and wrong credentials.
    const locked = await right(visitor.request)
    expect(locked.status).toBe(429)
    expect(locked.headers['content-type']).toMatch(/^application\/problem\+json/)
    const first = retryAfter(locked.headers)
    expect(first).toBeGreaterThanOrEqual(600)
    expect(first).toBeLessThanOrEqual(900)
    expect(locked.json).toEqual(LOCKED_BODY)
    expect(locked.headers['set-cookie']).toBeUndefined()
    for (const attempt of [wrongPassword, wrongUsername]) {
      const res = await attempt(visitor.request)
      expect(res.status).toBe(429)
      expect(res.json).toEqual(LOCKED_BODY)
    }
    // A refused attempt does not extend the lock: the header falls while every poll is refused.
    const start = retryAfter((await right(visitor.request)).headers)
    await expect
      .poll(async () => retryAfter((await right(visitor.request)).headers), {
        intervals: [500],
        timeout: 10_000,
        message: 'Retry-After falls while attempts are refused',
      })
      .toBeLessThan(start)

    // 7. The open session is untouched.
    await page.reload()
    await expect(servicesHeading(page)).toBeVisible()
    expect((await page.request.get('/api/session')).status()).toBe(200)

    // 8. The locked attempts created no session.
    const services = await visitor.request.get('/api/services')
    expect(services.status()).toBe(401)
    expect((await services.json()).code).toBe('unauthenticated')
  })

  test('M5 journey 2 what counts as a failed attempt and what resets the count (FR-2)', async ({ visitor }) => {
    const request = visitor.request
    // 1. Four failures, mixing both kinds.
    for (const attempt of [wrongPassword, wrongUsername, wrongPassword, wrongUsername]) {
      expect((await attempt(request)).status).toBe(401)
    }
    // 2. A correct sign-in resets the count.
    const ok = await right(request)
    expect(ok.status).toBe(200)
    expect(ok.headers['set-cookie']).toBeTruthy()
    // 3. Four more failures: without the reset the second would be refused.
    for (const attempt of [wrongUsername, wrongPassword, wrongUsername, wrongPassword]) {
      expect((await attempt(request)).status).toBe(401)
    }
    // 4. Requests that are not failed attempts.
    const empty = await signInRaw(request, '{}', 'application/json')
    expect(empty.status).toBe(422)
    expect((empty.json as { code: string }).code).toBe('validation_failed')
    const malformed = await signInRaw(request, '{"username":', 'application/json')
    expect(malformed.status).toBe(400)
    expect((malformed.json as { code: string }).code).toBe('malformed_request')
    const plain = await signInRaw(request, 'x', 'text/plain')
    expect(plain.status).toBe(415)
    expect((plain.json as { code: string }).code).toBe('unsupported_media_type')
    // 5. The fifth failure since the reset: still a 401 (the three requests above did not count).
    expect((await wrongPassword(request)).status).toBe(401)
    // 6. The sixth attempt is refused even with the right credentials.
    const refused = await right(request)
    expect(refused.status).toBe(429)
    expect((refused.json as { code: string }).code).toBe('sign_in_locked')
    // 7. While locked an empty body is still a 422 and does not change the lock.
    expect((await signInRaw(request, '{}', 'application/json')).status).toBe(422)
    expect((await right(request)).status).toBe(429)
  })

  test('M5 journey 3 a restart clears the lock (FR-114, FR-2)', async ({ visitor, app }) => {
    for (let i = 0; i < 5; i++) expect((await wrongPassword(visitor.request)).status).toBe(401)
    expect((await right(visitor.request)).status).toBe(429)

    const v = await visitor.newPage()
    await attemptSignIn(v, ADMIN_USERNAME, ADMIN_PASSWORD)
    await expect(v.getByText(LOCKED_TITLE)).toBeVisible()

    await app.restart()

    await v.reload()
    await expect(v.getByText(LOCKED_TITLE)).toHaveCount(0)
    await expect(v.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled()
    await attemptSignIn(v, ADMIN_USERNAME, ADMIN_PASSWORD)
    await expect(servicesHeading(v)).toBeVisible()
  })

  test('M5 journey 3 a restart clears the failed-attempt count (FR-114, FR-2)', async ({ visitor, app }) => {
    const request = visitor.request
    for (let i = 0; i < 4; i++) expect((await wrongPassword(request)).status).toBe(401)
    await app.restart()
    for (let i = 0; i < 4; i++) expect((await wrongPassword(request)).status, `after restart ${i + 1}`).toBe(401)
    expect((await wrongPassword(request)).status).toBe(401)
    expect((await right(request)).status).toBe(429)
  })
})
