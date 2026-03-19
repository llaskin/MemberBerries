// Single entry point for Electron main process server bundle.
// CRITICAL: axonMiddleware and terminalWs MUST be in the same bundle
// so they share the same terminalManager module instance (and its
// terminals Map). Separate bundles = separate Maps = WS 1008 errors.

export { createAxonMiddleware, handleAxonUpgrade, setupCleanupHandlers } from './axonMiddleware'
export { setupTerminalWs } from '../lib/terminalWs'
