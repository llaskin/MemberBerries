import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { execSync } from 'node:child_process'
import { axonDevApi } from './vite-plugin-axon'

function getAppVersion(): string {
  try {
    // "desktop-v0.1.11-5-gabcdef" → "0.1.11-dev.5" (5 commits ahead of tag)
    // "desktop-v0.1.11"           → "0.1.11"        (exact tag)
    const describe = execSync('git describe --tags --match "desktop-v*"', { encoding: 'utf-8' }).trim()
    const ahead = describe.match(/^desktop-v(.+)-(\d+)-g[0-9a-f]+$/)
    if (ahead) return `${ahead[1]}-dev.${ahead[2]}`
    return describe.replace(/^desktop-v/, '')
  } catch {
    return '0.0.0'
  }
}

const appVersion = getAppVersion()

export default defineConfig({
  plugins: [react(), tailwindcss(), axonDevApi()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    host: process.env.VITE_HOST || 'localhost',
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['node-pty'],
  },
  ssr: {
    external: ['node-pty', 'ws', 'better-sqlite3'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
