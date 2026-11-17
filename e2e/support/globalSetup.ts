import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'

export const E2E_DIR = path.resolve(__dirname, '..')
export const BINARY = path.join(E2E_DIR, '.bin', 'monitory')

/** Builds the binary once. The frontend is built by `make build`, which the make targets run first. */
export default function globalSetup(): void {
  const backend = path.resolve(E2E_DIR, '..', 'backend')
  const dist = path.join(backend, 'internal', 'web', 'dist')
  const built = readdirSync(dist).filter((name) => name !== '.gitkeep')
  if (built.length === 0) {
    throw new Error('build the frontend first: make build')
  }
  execFileSync('go', ['build', '-o', BINARY, './cmd/server'], { cwd: backend, stdio: 'inherit' })
}
