import { test as base, expect } from '@playwright/test'
import { App } from './app'
import { StubReceiver } from './stubReceiver'
import { StubTarget } from './stubTarget'

interface Fixtures {
  app: App
  stub: StubTarget
  receiver: StubReceiver
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
  baseURL: async ({ app }, use) => {
    await use(app.baseURL)
  },
})

export { expect }
