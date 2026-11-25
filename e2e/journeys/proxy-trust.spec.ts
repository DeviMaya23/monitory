import { expect, test } from '../support/fixtures'
import { publicApi } from '../support/helpers'

type Request = Parameters<typeof publicApi>[0]

async function expectPassed(request: Request, headers: Record<string, string>, label: string) {
  const res = await publicApi(request, headers)
  expect(res.status, label).toBe(404)
  expect((res.json as { code: string }).code, label).toBe('public_view_unavailable')
}

async function expectLimited(request: Request, headers: Record<string, string>, label: string) {
  const res = await publicApi(request, headers)
  expect(res.status, label).toBe(429)
  expect((res.json as { code: string }).code, label).toBe('rate_limited')
  expect(res.headers['content-type'], label).toMatch(/^application\/problem\+json/)
  expect(res.headers['retry-after'], label).toMatch(/^[0-9]+$/)
  const wait = Number(res.headers['retry-after'])
  expect(wait, label).toBeGreaterThanOrEqual(1)
  expect(wait, label).toBeLessThanOrEqual(60)
}

test.describe('M5 journey 6: trust off', () => {
  test.use({ appOverrides: { PUBLIC_RATE_LIMIT_PER_MINUTE: '3' } })

  test('M5 journey 6 forwarding headers are ignored while trust is off (FR-99, FR-32)', async ({ visitor }) => {
    for (const n of [1, 2, 3]) {
      await expectPassed(visitor.request, { 'x-forwarded-for': `203.0.113.${n}`, 'x-real-ip': `198.51.100.${n}` }, `request ${n}`)
    }
    await expectLimited(visitor.request, { 'x-forwarded-for': '203.0.113.4', 'x-real-ip': '198.51.100.4' }, 'fourth')
  })
})

test.describe('M5 journey 7: trust on, default header', () => {
  test.use({ appOverrides: { PUBLIC_RATE_LIMIT_PER_MINUTE: '3', TRUST_PROXY: 'true' } })

  test('M5 journey 7 the last X-Forwarded-For entry is the address counted (FR-99, FR-32)', async ({ visitor }) => {
    const xff = (value: string) => ({ 'x-forwarded-for': value })
    for (const n of [1, 2, 3]) await expectPassed(visitor.request, xff('203.0.113.7'), `request ${n}`)
    await expectLimited(visitor.request, xff('203.0.113.7'), 'fourth, same address')
    await expectPassed(visitor.request, xff('203.0.113.8'), 'another address')
    await expectLimited(visitor.request, xff('1.1.1.1, 203.0.113.7'), 'last entry counted')
    await expectPassed(visitor.request, {}, 'no header: the connecting address')
  })
})

test.describe('M5 journey 8: trust on, another header', () => {
  test.use({ appOverrides: { PUBLIC_RATE_LIMIT_PER_MINUTE: '3', TRUST_PROXY: 'true', CLIENT_IP_HEADER: 'X-Real-IP' } })

  test('M5 journey 8 the header CLIENT_IP_HEADER names decides the address (FR-99, FR-32)', async ({ visitor }) => {
    for (const n of [1, 2, 3]) await expectPassed(visitor.request, { 'x-real-ip': '198.51.100.1' }, `request ${n}`)
    await expectLimited(visitor.request, { 'x-real-ip': '198.51.100.1', 'x-forwarded-for': '203.0.113.99' }, 'fourth')
    await expectPassed(visitor.request, { 'x-real-ip': '198.51.100.2', 'x-forwarded-for': '203.0.113.99' }, 'fifth')
  })
})
