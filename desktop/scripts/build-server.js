// Bundle server-side TypeScript for Electron main process
import { build } from 'esbuild'

await build({
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outdir: 'dist-electron',
  // Native modules stay external — resolved from node_modules at runtime
  external: ['better-sqlite3', 'node-pty', 'ws', 'yaml'],
  outExtension: { '.js': '.mjs' },
  // Single entry point ensures shared modules (terminalManager) use one instance.
  // Separate bundles would create duplicate module state (Maps, counters, etc).
  entryPoints: ['src/server/electronEntry.ts'],
})

console.log('[build:server] Bundled server code to dist-electron/')
