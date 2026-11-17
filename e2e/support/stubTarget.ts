import http from 'node:http'
import type { AddressInfo } from 'node:net'

export interface StubRequest {
  method: string
  path: string
  at: number
}

/** A target the app checks: answers GET / with the status the test sets, and records every request. */
export class StubTarget {
  private status = 200
  private readonly log: StubRequest[] = []
  private readonly server = http.createServer((req, res) => {
    this.log.push({ method: req.method ?? '', path: req.url ?? '', at: Date.now() })
    res.statusCode = this.status
    res.end()
  })
  port = 0

  async listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(0, '127.0.0.1', () => resolve())
    })
    this.port = (this.server.address() as AddressInfo).port
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}/`
  }

  setStatus(status: number): void {
    this.status = status
  }

  requests(): StubRequest[] {
    return [...this.log]
  }

  count(): number {
    return this.log.length
  }

  async close(): Promise<void> {
    this.server.closeAllConnections()
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
  }
}
