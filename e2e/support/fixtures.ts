import { test as base, expect, type BrowserContext } from '@playwright/test'
import { App } from './app'
import type { Cert } from './certs'
import { StubReceiver } from './stubReceiver'
import { StubSite } from './stubSite'
import { StubTcp } from './stubTcp'
import { StubTarget } from './stubTarget'

interface Fixtures {
  app: App
  stub: StubTarget
  receiver: StubReceiver
  /** A scriptable HTTP stub of a checked service. */
  site: StubSite
  /** Starts an HTTPS stub with the given certificate; every one it started is closed at the end. */
  tlsSite: (cert: Cert) => Promise<StubSite>
  /** A TCP stub, not yet listening. */
  tcp: StubTcp
  /** An anonymous visitor: a fresh browser context with no cookies and no storage. */
  visitor: BrowserContext
  /** Environment overrides for the app of each test; set with `test.use`. */
  appOverrides: Record<string, string>
}

export const test = base.extend<Fixtures>({
  appOverrides: [{}, { option: true }],
  app: async ({ appOverrides }, use, testInfo) => {
    const app = new App()
    try {
      await app.init(appOverrides)
      await use(app)
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach('app-output', { body: app.output(), contentType: 'text/plain' })
      }
      await app.dispose()
    }
  },
  visitor: async ({ browser, app }, use) => {
    // A context made with `browser.newContext` does not inherit the fixture's base URL.
    const context = await browser.newContext({ baseURL: app.baseURL })
    await use(context)
    await context.close()
  },
  stub: async ({}, use) => {
    const stub = new StubTarget()
    await stub.listen()
    await use(stub)
    await stub.close()
  },
  receiver: async ({}, use) => {
    const receiver = new StubReceiver()
    await receiver.listen()
    await use(receiver)
    await receiver.close()
  },
  site: async ({}, use) => {
    const site = new StubSite()
    await site.listen()
    await use(site)
    await site.close()
  },
  tlsSite: async ({}, use) => {
    const started: StubSite[] = []
    await use(async (cert) => {
      const site = new StubSite({ tls: cert })
      await site.listen()
      started.push(site)
      return site
    })
    for (const site of started) await site.close()
  },
  tcp: async ({}, use) => {
    const tcp = new StubTcp()
    await use(tcp)
    await tcp.close()
  },
  baseURL: async ({ app }, use) => {
    await use(app.baseURL)
  },
})

export { expect }
