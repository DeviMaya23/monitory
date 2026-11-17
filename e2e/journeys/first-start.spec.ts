import net from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { appEnv, freePort, spawnApp } from '../support/app'
import { expect, test } from '@playwright/test'

async function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1')
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

const cases: { title: string; unset: string[]; empty?: boolean }[] = [
  { title: 'without ADMIN_PASSWORD', unset: ['ADMIN_PASSWORD'] },
  { title: 'without ADMIN_USERNAME', unset: ['ADMIN_USERNAME'] },
  { title: 'without both', unset: ['ADMIN_USERNAME', 'ADMIN_PASSWORD'] },
  { title: 'with an empty ADMIN_PASSWORD', unset: ['ADMIN_PASSWORD'], empty: true },
]

test.describe('journey 7: first start (FR-102)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'no browser is involved')

  for (const c of cases) {
    test(c.title, async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'monitory-e2e-'))
      try {
        const port = await freePort()
        const env = appEnv(path.join(dir, 'monitory.db'), port)
        for (const key of c.unset) {
          if (c.empty) env[key] = ''
          else delete env[key]
        }
        const proc = spawnApp(env)
        const timer = setTimeout(() => proc.child.kill('SIGKILL'), 10_000)
        const code = await proc.exited
        clearTimeout(timer)
        const output = proc.output()
        expect(code, output).not.toBe(0)
        expect(code, output).not.toBeNull()
        for (const key of ['ADMIN_USERNAME', 'ADMIN_PASSWORD']) {
          if (c.unset.includes(key)) expect(output).toContain(`${key} is not set`)
          else expect(output).not.toContain(`${key} is not set`)
        }
        expect(await listening(port)).toBe(false)
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    })
  }
})
