import http from 'node:http'
import type { AddressInfo } from 'node:net'

export interface ReceivedRequest {
  method: string
  path: string
  headers: http.IncomingHttpHeaders
  /** The raw body text. */
  body: string
  /** The body parsed as JSON, or undefined when it does not parse. */
  json: Record<string, unknown> | undefined
  at: number
}

/** A webhook receiver: answers POST /hook as the test sets, and records every request. */
export class StubReceiver {
  private status = 200
  private delay = 0
  private redirect = false
  private readonly log: ReceivedRequest[] = []
  private readonly server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      let json: Record<string, unknown> | undefined
      try {
        json = JSON.parse(body) as Record<string, unknown>
      } catch {
        json = undefined
      }
      const path = req.url ?? ''
      this.log.push({ method: req.method ?? '', path, headers: req.headers, body, json, at: Date.now() })
      const answer = () => {
        if (path === '/hook' && req.method === 'POST') {
          if (this.redirect) {
            res.statusCode = 302
            res.setHeader('Location', '/elsewhere')
          } else {
            res.statusCode = this.status
          }
        } else if (path === '/elsewhere') {
          res.statusCode = 200
        } else {
          res.statusCode = 404
        }
        res.end()
      }
      if (path === '/hook' && this.delay > 0) setTimeout(answer, this.delay)
      else answer()
    })
  })
  port = 0

  async listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(0, '127.0.0.1', () => resolve())
    })
    this.port = (this.server.address() as AddressInfo).port
  }

  get hookUrl(): string {
    return `http://127.0.0.1:${this.port}/hook`
  }

  setStatus(status: number): void {
    this.status = status
  }

  setDelay(ms: number): void {
    this.delay = ms
  }

  setRedirect(on: boolean): void {
    this.redirect = on
  }

  requests(): ReceivedRequest[] {
    return [...this.log]
  }

  count(): number {
    return this.log.length
  }

  hookRequests = (): ReceivedRequest[] => this.log.filter((r) => r.path === '/hook')

  hookCount = (): number => this.hookRequests().length

  async close(): Promise<void> {
    this.server.closeAllConnections()
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
  }
}
