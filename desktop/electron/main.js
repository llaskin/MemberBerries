import { app, BrowserWindow } from 'electron'
import { createServer } from 'http'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'
import { WebSocketServer } from 'ws'
import express from 'express'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')

// Dynamic imports for the extracted middleware (TypeScript compiled to dist/)
async function start() {
  // Import compiled server bundle — single bundle ensures shared module state
  const { createAxonMiddleware, handleAxonUpgrade, setupCleanupHandlers, setupTerminalWs } = await import(
    join(ROOT, 'dist-electron', 'electronEntry.mjs')
  )

  const expressApp = express()
  const httpServer = createServer(expressApp)

  // WebSocket server for terminals
  const wss = new WebSocketServer({ noServer: true })
  setupTerminalWs(wss)

  httpServer.on('upgrade', (req, socket, head) => {
    handleAxonUpgrade(wss, req, socket, head, homeAxon)
  })

  // Cleanup on exit
  setupCleanupHandlers(httpServer)

  // CLI dir for cron/init scripts — resolve using login shell PATH (not Electron's sandboxed PATH)
  const homeAxon = join(process.env.HOME || homedir(), '.axon')
  let cliDir
  try {
    const { execSync } = await import('child_process')
    const { existsSync } = await import('fs')

    // Resolve login shell PATH for npm root (handles nvm/volta/brew)
    const shell = process.env.SHELL || '/bin/zsh'
    const shellName = (shell.split('/').pop() || 'zsh').toLowerCase()
    let shellPath = process.env.PATH || ''
    try {
      const cmd = shellName === 'fish'
        ? `${shell} -l -c 'printenv PATH'`
        : `${shell} -lc 'printenv PATH'`
      shellPath = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 }).trim()
    } catch { /* fall back to process.env.PATH */ }

    const npmRoot = execSync('npm root -g', { encoding: 'utf-8', env: { ...process.env, PATH: shellPath }, timeout: 5000 }).trim()
    const globalCli = join(npmRoot, 'axon-dev', 'cli')
    cliDir = existsSync(globalCli) ? globalCli : resolve(ROOT, '..', 'cli')
  } catch {
    cliDir = resolve(ROOT, '..', 'cli')
  }

  // Mount API middleware
  expressApp.use(createAxonMiddleware({
    axonHome: homeAxon,
    cliDir,
  }))

  // Serve static Vite build
  expressApp.use(express.static(join(ROOT, 'dist')))

  // SPA fallback — serve index.html for all non-API routes
  expressApp.use((_req, res) => {
    res.sendFile(join(ROOT, 'dist', 'index.html'))
  })

  // Read server config for remote access
  const { readFileSync } = await import('fs')
  let serverEnabled = false
  let serverPort = 0 // 0 = OS picks a free port
  try {
    const srvCfg = JSON.parse(readFileSync(join(homeAxon, 'server.json'), 'utf-8'))
    if (srvCfg.enabled && srvCfg.passwordHash) {
      serverEnabled = true
      serverPort = srvCfg.port || 3847
    }
  } catch { /* no config — local only */ }

  const host = serverEnabled ? '0.0.0.0' : '127.0.0.1'
  await new Promise((resolve) => {
    httpServer.listen(serverPort, host, () => resolve(undefined))
  })
  const port = httpServer.address().port
  console.log(`[Axon] Server running on http://${host}:${port}${serverEnabled ? ' (remote access enabled)' : ''}`)

  // Create browser window
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    icon: join(ROOT, 'build', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.loadURL(`http://localhost:${port}`)

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools()
  }

  // Quit when all windows are closed
  app.on('window-all-closed', () => {
    httpServer.close()
    app.quit()
  })

  // macOS: re-create window on dock click
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // Re-create window would go here but for simplicity just quit
    }
  })
}

app.whenReady().then(start)
