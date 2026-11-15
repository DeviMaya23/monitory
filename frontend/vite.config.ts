import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Both development ports come from the repo's .env, which `make dev-frontend` passes on
// as environment variables. Without them the defaults apply.
// LISTEN_ADDR is the Go server's address (":8080" or "host:8080"); only its port is used here.
const backendPort = (process.env.LISTEN_ADDR ?? '').split(':').pop() || '8080'
const backend = `http://localhost:${backendPort}`
const devPort = Number(process.env.FRONTEND_DEV_PORT) || 5173

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The Go binary embeds this directory (backend/internal/web). public/.gitkeep is
    // copied into it by every build, so the one committed file there survives.
    outDir: '../backend/internal/web/dist',
    emptyOutDir: true,
  },
  server: {
    port: devPort,
    strictPort: true,
    // The browser only talks to this origin; Vite forwards API traffic to the Go server.
    proxy: {
      '/api': { target: backend },
      '/health': { target: backend },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
