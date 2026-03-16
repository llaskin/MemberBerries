import { app, BrowserWindow } from 'electron'
import { createServer } from 'http'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { WebSocketServer } from 'ws'
import express from 'express'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')

// Dynamic imports for the extracted middleware (TypeScript compiled to dist/)
async function start() {
  // Import compiled server bundle
  const { createAxonMiddleware, handleAxonUpgrade, setupCleanupHandlers } = await import(
    join(ROOT, 'dist-electron', 'axonMiddleware.mjs')
  )
  const { setupTerminalWs } = await import(
    join(ROOT, 'dist-electron', 'terminalWs.mjs')
  )

  const expressApp = express()
  const httpServer = createServer(expressApp)

  // WebSocket server for terminals
  const wss = new WebSocketServer({ noServer: true })
  setupTerminalWs(wss)

  httpServer.on('upgrade', (req, socket, head) => {
    handleAxonUpgrade(wss, req, socket, head)
  })

  // Cleanup on exit
  setupCleanupHandlers(httpServer)

  // CLI dir for cron/init scripts — check npm global install first, then local
  const homeAxon = join(process.env.HOME || '', '.axon')
  let cliDir
  try {
    const { execSync } = await import('child_process')
    const npmRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim()
    const globalCli = join(npmRoot, 'axon-dev', 'cli')
    const { existsSync } = await import('fs')
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

  // Find a free port
  await new Promise((resolve) => {
    httpServer.listen(0, () => resolve(undefined))
  })
  const port = httpServer.address().port
  console.log(`[Axon] Server running on http://localhost:${port}`)

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
