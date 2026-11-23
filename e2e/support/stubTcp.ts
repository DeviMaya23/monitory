import net from 'node:net'
import { freePort } from './app'

/** A TCP listener on 127.0.0.1 that counts the connections it accepts. */
export class StubTcp {
  private server: net.Server | null = null
  private sockets = new Set<net.Socket>()
  private accepted_ = 0
  port = 0

  async listen(port = 0): Promise<void> {
    const server = net.createServer((socket) => {
      this.accepted_++
      this.sockets.add(socket)
      socket.on('close', () => this.sockets.delete(socket))
      socket.on('error', () => undefined)
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => resolve())
    })
    this.server = server
    this.port = (server.address() as net.AddressInfo).port
  }

  accepted(): number {
    return this.accepted_
  }

  /** Destroys open sockets and stops listening, so the port refuses connections. */
  async close(): Promise<void> {
    const server = this.server
    if (!server) return
    this.server = null
    for (const socket of this.sockets) socket.destroy()
    this.sockets.clear()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

/** A port nothing listens on. */
export function closedPort(): Promise<number> {
  return freePort()
}
