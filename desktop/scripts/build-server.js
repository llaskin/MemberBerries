// Bundle server-side TypeScript for Electron main process
import { build } from 'esbuild'

const shared = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outdir: 'dist-electron',
  // Native modules stay external — resolved from node_modules at runtime
  external: ['better-sqlite3', 'node-pty', 'ws', 'yaml'],
  outExtension: { '.js': '.mjs' },
}

await Promise.all([
  build({
    ...shared,
    entryPoints: ['src/server/axonMiddleware.ts'],
  }),
  build({
    ...shared,
    entryPoints: ['src/lib/terminalWs.ts'],
  }),
])

console.log('[build:server] Bundled server code to dist-electron/')
