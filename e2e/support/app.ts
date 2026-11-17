import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { BINARY } from './globalSetup'

export const ADMIN_USERNAME = 'e2e-admin'
export const ADMIN_PASSWORD = 'e2e-password-1'

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo
      server.close(() => resolve(port))
    })
  })
}

/** The whole environment of a run: nothing from the developer's shell but PATH. */
export function appEnv(dbPath: string, port: number): Record<string, string> {
  return {
    PATH: process.env.PATH ?? '',
    LISTEN_ADDR: `127.0.0.1:${port}`,
    DATABASE_PATH: dbPath,
    ADMIN_USERNAME,
    ADMIN_PASSWORD,
    REQUIRE_HTTPS: 'false',
    CHECK_INTERVAL_MIN_SECONDS: '1',
    CHECK_INTERVAL_DEFAULT_SECONDS: '6',
    TIMEOUT_DEFAULT_SECONDS: '1',
    TIMEOUT_MIN_SECONDS: '1',
    RETRY_COUNT_DEFAULT: '1',
    RETRY_INTERVAL_DEFAULT_SECONDS: '1',
  }
}

export interface RunningProcess {
  child: ChildProcess
  output: () => string
  exited: Promise<number | null>
}

export function spawnApp(env: Record<string, string>): RunningProcess {
  const child = spawn(BINARY, [], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  child.stdout?.on('data', (chunk: Buffer) => (out += chunk.toString()))
  child.stderr?.on('data', (chunk: Buffer) => (out += chunk.toString()))
  const exited = new Promise<number | null>((resolve) => {
    child.once('exit', (code) => resolve(code))
    child.once('error', (err) => {
      out += `spawn error: ${err.message}\n`
      resolve(-1)
    })
  })
  return { child, output: () => out, exited }
}

async function healthy(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`)
    return res.status === 200
  } catch {
    return false
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class App {
  private proc: RunningProcess | null = null
  private log = ''
  private dir = ''
  private port = 0

  get baseURL(): string {
    return `http://127.0.0.1:${this.port}`
  }

  /** Everything the app printed in this test, across restarts. */
  output(): string {
    return this.log + (this.proc?.output() ?? '')
  }

  async init(): Promise<void> {
    this.dir = await mkdtemp(path.join(os.tmpdir(), 'monitory-e2e-'))
    // First start: the port is picked here; a taken port is retried up to 3 times.
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      this.port = await freePort()
      try {
        await this.launch()
        return
      } catch (err) {
        lastError = err
        if (!/address already in use/.test(String(err))) throw err
      }
    }
    throw lastError
  }

  /** Starts the app on the same database and port. `overrides` apply to this run only. */
  async start(overrides: Record<string, string> = {}): Promise<void> {
    await this.launch(overrides)
  }

  private async launch(overrides: Record<string, string> = {}): Promise<void> {
    const env = { ...appEnv(path.join(this.dir, 'monitory.db'), this.port), ...overrides }
    const proc = spawnApp(env)
    this.proc = proc
    const deadline = Date.now() + 15_000
    let exitedEarly = false
    void proc.exited.then(() => (exitedEarly = true))
    while (Date.now() < deadline) {
      if (exitedEarly) {
        this.log += proc.output()
        this.proc = null
        throw new Error(`app exited before it was ready:\n${proc.output()}`)
      }
      if (await healthy(this.port)) return
      await sleep(100)
    }
    proc.child.kill('SIGKILL')
    await proc.exited
    this.log += proc.output()
    this.proc = null
    throw new Error(`app was not ready within 15 seconds:\n${proc.output()}`)
  }

  async stop(): Promise<void> {
    const proc = this.proc
    if (!proc) return
    proc.child.kill('SIGTERM')
    const timer = setTimeout(() => proc.child.kill('SIGKILL'), 15_000)
    await proc.exited
    clearTimeout(timer)
    this.log += proc.output() + '\n--- app stopped ---\n'
    this.proc = null
  }

  async restart(): Promise<void> {
    await this.stop()
    await this.start()
  }

  async dispose(): Promise<void> {
    await this.stop()
    await rm(this.dir, { recursive: true, force: true })
  }
}
