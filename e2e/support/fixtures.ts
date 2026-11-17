import { test as base, expect } from '@playwright/test'
import { App } from './app'
import { StubTarget } from './stubTarget'

interface Fixtures {
  app: App
  stub: StubTarget
}

export const test = base.extend<Fixtures>({
  app: async ({}, use, testInfo) => {
    const app = new App()
    try {
      await app.init()
      await use(app)
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach('app-output', { body: app.output(), contentType: 'text/plain' })
      }
      await app.dispose()
    }
  },
  stub: async ({}, use) => {
    const stub = new StubTarget()
    await stub.listen()
    await use(stub)
    await stub.close()
  },
  baseURL: async ({ app }, use) => {
    await use(app.baseURL)
  },
})

export { expect }
