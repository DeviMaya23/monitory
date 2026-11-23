import http from 'node:http'
import https from 'node:https'
import type { AddressInfo } from 'node:net'
import type { Cert } from './certs'

export interface SiteScript {
  /** Response status (default 200); the redirect status when `redirectTo` is set (default 302). */
  status?: number
  body?: string
  headers?: Record<string, string>
  /** Wait before sending the response head. */
  delayMs?: number
  /** Send the head and the first byte of the body at once, then wait before the rest. */
  bodyDelayMs?: number
  /** A path or an absolute URL: answer with a redirect to it and no body. */
  redirectTo?: string
  /** Answer the first n requests to this path with 503. */
  failFirst?: number
}

export interface SiteRequest {
  method: string
  /** Path and query, as sent. */
  url: string
  /** Header names are lower-cased. */
  headers: Record<string, string>
  body: string
  at: number
}

/** A scriptable stub of a checked HTTP(S) service. */
export class StubSite {
  private readonly routes = new Map<string, SiteScript>()
  private readonly log: SiteRequest[] = []
  private readonly served = new Map<string, number>()
  private readonly timers = new Set<NodeJS.Timeout>()
  private readonly server: http.Server | https.Server
  private readonly tls: boolean
  port = 0

  constructor(options: { tls?: Cert } = {}) {
    this.tls = options.tls !== undefined
    const handler: http.RequestListener = (req, res) => this.handle(req, res)
    this.server = options.tls
      ? https.createServer({ key: options.tls.key, cert: options.tls.cert }, handler)
      : http.createServer(handler)
  }

  async listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(0, '127.0.0.1', () => resolve())
    })
    this.port = (this.server.address() as AddressInfo).port
  }

  url(path = '/'): string {
    return `${this.tls ? 'https' : 'http'}://127.0.0.1:${this.port}${path}`
  }

  route(path: string, script: SiteScript): void {
    this.routes.set(path, script)
    this.served.delete(path)
  }

  requests(): SiteRequest[] {
    return [...this.log]
  }

  /** The requests whose path (without the query) is `path`. */
  requestsTo(path: string): SiteRequest[] {
    return this.log.filter((r) => r.url.split('?')[0] === path)
  }

  count(): number {
    return this.log.length
  }

  private later(ms: number, fn: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      fn()
    }, ms)
    this.timers.add(timer)
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const url = req.url ?? ''
      const path = url.split('?')[0]
      const headers: Record<string, string> = {}
      for (const [name, value] of Object.entries(req.headers)) headers[name] = Array.isArray(value) ? value.join(', ') : (value ?? '')
      this.log.push({ method: req.method ?? '', url, headers, body: Buffer.concat(chunks).toString('utf8'), at: Date.now() })
      this.respond(path, res)
    })
  }

  private respond(path: string, res: http.ServerResponse): void {
    const script = this.routes.get(path)
    if (!script) {
      res.statusCode = 404
      res.end()
      return
    }
    const seen = (this.served.get(path) ?? 0) + 1
    this.served.set(path, seen)
    const send = () => {
      if (script.failFirst !== undefined && seen <= script.failFirst) {
        res.statusCode = 503
        res.end()
        return
      }
      for (const [name, value] of Object.entries(script.headers ?? {})) res.setHeader(name, value)
      if (script.redirectTo !== undefined) {
        res.statusCode = script.status ?? 302
        res.setHeader('Location', script.redirectTo)
        res.end()
        return
      }
      res.statusCode = script.status ?? 200
      const body = script.body ?? ''
      if (script.bodyDelayMs !== undefined && body.length > 1) {
        res.write(body.slice(0, 1))
        res.flushHeaders()
        this.later(script.bodyDelayMs, () => res.end(body.slice(1)))
        return
      }
      res.end(body)
    }
    if (script.delayMs !== undefined) this.later(script.delayMs, send)
    else send()
  }

  async close(): Promise<void> {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
    this.server.closeAllConnections()
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
  }
}
