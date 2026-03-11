import type { Plugin } from 'vite'
import { readdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import { spawn, execSync } from 'child_process'

export function axonDevApi(): Plugin {
  const AXON_HOME = resolve(join(homedir(), '.axon'))

  return {
    name: 'axon-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/axon')) return next()

        res.setHeader('Content-Type', 'application/json')

        try {
          // GET /api/axon/projects
          if (req.url === '/api/axon/projects') {
            const wsDir = join(AXON_HOME, 'workspaces')
            const entries = await readdir(wsDir, { withFileTypes: true })
            const projects = []

            for (const entry of entries) {
              if (!entry.isDirectory()) continue
              const name = entry.name
              const wsPath = join(wsDir, name)

              let status = 'active'
              let projectPath = ''
              let createdAt = ''
              try {
                const cfg = await readFile(join(wsPath, 'config.yaml'), 'utf-8')
                status = cfg.match(/^status:\s*(.+)$/m)?.[1]?.trim() || 'active'
                projectPath = cfg.match(/^project_path:\s*(.+)$/m)?.[1]?.trim() || ''
                createdAt = cfg.match(/^created_at:\s*(.+)$/m)?.[1]?.trim() || ''
              } catch {}

              let lastRollup: string | null = null
              let openLoopCount = 0
              try {
                const state = await readFile(join(wsPath, 'state.md'), 'utf-8')
                lastRollup = state.match(/^last_rollup:\s*(.+)$/m)?.[1]?.trim() || null
                const loops = state.match(/^\s*- \[[ >]\]/gm)
                openLoopCount = loops ? loops.length : 0
              } catch {}

              let episodeCount = 0
              try {
                const eps = await readdir(join(wsPath, 'episodes'))
                episodeCount = eps.filter(f => f.endsWith('.md')).length
              } catch {}

              projects.push({ name, path: projectPath, status, createdAt, lastRollup, episodeCount, openLoopCount })
            }

            res.end(JSON.stringify(projects))
            return
          }

          // GET /api/axon/projects/:name/rollups
          const rollupsMatch = req.url.match(/^\/api\/axon\/projects\/([^/]+)\/rollups$/)
          if (rollupsMatch) {
            const project = decodeURIComponent(rollupsMatch[1])
            const epDir = join(AXON_HOME, 'workspaces', project, 'episodes')

            try {
              const files = await readdir(epDir)
              const mdFiles = files.filter(f => f.endsWith('.md')).sort().reverse()

              const rollups = []
              for (const file of mdFiles) {
                const content = await readFile(join(epDir, file), 'utf-8')
                rollups.push({ filename: file, content })
              }
              res.end(JSON.stringify(rollups))
            } catch {
              res.end(JSON.stringify([]))
            }
            return
          }

          // GET /api/axon/projects/:name/state
          const stateMatch = req.url.match(/^\/api\/axon\/projects\/([^/]+)\/state$/)
          if (stateMatch) {
            const project = decodeURIComponent(stateMatch[1])
            try {
              const content = await readFile(join(AXON_HOME, 'workspaces', project, 'state.md'), 'utf-8')
              res.end(JSON.stringify({ content }))
            } catch {
              res.end(JSON.stringify({ content: '' }))
            }
            return
          }

          // GET /api/axon/projects/:name/config
          const configMatch = req.url.match(/^\/api\/axon\/projects\/([^/]+)\/config$/)
          if (configMatch) {
            const project = decodeURIComponent(configMatch[1])
            try {
              const content = await readFile(join(AXON_HOME, 'workspaces', project, 'config.yaml'), 'utf-8')
              res.end(JSON.stringify({ content }))
            } catch {
              res.end(JSON.stringify({ content: '' }))
            }
            return
          }

          // GET /api/axon/projects/:name/stream
          const streamMatch = req.url.match(/^\/api\/axon\/projects\/([^/]+)\/stream$/)
          if (streamMatch) {
            const project = decodeURIComponent(streamMatch[1])
            try {
              const content = await readFile(join(AXON_HOME, 'workspaces', project, 'stream.md'), 'utf-8')
              res.end(JSON.stringify({ content }))
            } catch {
              res.end(JSON.stringify({ content: '' }))
            }
            return
          }

          // GET /api/axon/projects/:name/mornings
          const morningsMatch = req.url.match(/^\/api\/axon\/projects\/([^/]+)\/mornings$/)
          if (morningsMatch) {
            const project = decodeURIComponent(morningsMatch[1])
            const mDir = join(AXON_HOME, 'workspaces', project, 'mornings')
            try {
              const files = await readdir(mDir)
              const logFiles = files.filter(f => f.endsWith('.log') || f.endsWith('.md')).sort().reverse()
              const mornings = []
              for (const file of logFiles) {
                const content = await readFile(join(mDir, file), 'utf-8')
                mornings.push({ filename: file, content })
              }
              res.end(JSON.stringify(mornings))
            } catch {
              res.end(JSON.stringify([]))
            }
            return
          }

          // GET /api/axon/projects/:name/gource — serve gource.png if it exists
          const gourceMatch = req.url.match(/^\/api\/axon\/projects\/([^/]+)\/gource$/)
          if (gourceMatch) {
            const project = decodeURIComponent(gourceMatch[1])
            const gourcePath = join(AXON_HOME, 'workspaces', project, 'gource.png')
            if (existsSync(gourcePath)) {
              res.setHeader('Content-Type', 'image/png')
              res.setHeader('Cache-Control', 'public, max-age=86400')
              const img = await readFile(gourcePath)
              res.end(img)
            } else {
              res.statusCode = 404
              res.end(JSON.stringify({ error: 'No gource image' }))
            }
            return
          }

          // POST /api/axon/chat — streaming Claude proxy
          if (req.url === '/api/axon/chat' && req.method === 'POST') {
            // Must await body + child lifecycle so connect doesn't close the request
            const body = await new Promise<string>((resolve) => {
              let data = ''
              req.on('data', (chunk: Buffer) => { data += chunk.toString() })
              req.on('end', () => resolve(data))
            })

            const { prompt, continueSession } = JSON.parse(body) as {
              prompt: string
              continueSession?: boolean
            }

            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Connection', 'keep-alive')

            const args = continueSession
              ? ['--continue', '-p', prompt, '--allowedTools', 'Read,Glob,Grep']
              : ['-p', prompt, '--allowedTools', 'Read,Glob,Grep']

            // Strip CLAUDECODE env var to avoid nested-session guard
            const cleanEnv = { ...process.env }
            delete cleanEnv.CLAUDECODE
            delete cleanEnv.CLAUDE_CODE_SESSION

            const child = spawn('claude', args, {
              stdio: ['ignore', 'pipe', 'pipe'],
              env: cleanEnv,
            })

            child.stdout.on('data', (data: Buffer) => {
              const text = data.toString()
              res.write(`data: ${JSON.stringify({ type: 'content', text })}\n\n`)
            })

            child.stderr.on('data', () => {
              // Claude CLI progress — ignore
            })

            // Keep the middleware alive until child exits
            await new Promise<void>((resolve) => {
              child.on('close', (code) => {
                res.write(`data: ${JSON.stringify({ type: 'done', code })}\n\n`)
                res.end()
                resolve()
              })

              child.on('error', (err) => {
                res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`)
                res.end()
                resolve()
              })

              // Kill child if client disconnects
              req.on('close', () => {
                if (!child.killed) child.kill()
                resolve()
              })
            })
            return
          }

          // GET /api/axon/discover-repos
          if (req.url === '/api/axon/discover-repos') {
            const home = homedir()
            const scanDirs = ['Github', 'Projects', 'Developer', 'Code', 'repos', 'src', 'work']
              .map(d => join(home, d))
              .filter(d => existsSync(d))

            const repos: { name: string; path: string; remote: string; commitCount: number; lastActivity: string }[] = []

            for (const dir of scanDirs) {
              let entries: import('fs').Dirent[]
              try {
                entries = await readdir(dir, { withFileTypes: true })
              } catch {
                continue
              }
              for (const entry of entries) {
                if (!entry.isDirectory()) continue
                const repoPath = join(dir, entry.name)
                if (!existsSync(join(repoPath, '.git'))) continue

                let remote = ''
                try { remote = execSync(`git -C "${repoPath}" remote get-url origin 2>/dev/null`, { encoding: 'utf-8' }).trim() } catch {}

                let commitCount = 0
                try { commitCount = parseInt(execSync(`git -C "${repoPath}" rev-list --count HEAD 2>/dev/null`, { encoding: 'utf-8' }).trim(), 10) || 0 } catch {}

                let lastActivity = ''
                try { lastActivity = execSync(`git -C "${repoPath}" log -1 --format=%ai 2>/dev/null`, { encoding: 'utf-8' }).trim() } catch {}

                repos.push({ name: entry.name, path: repoPath, remote, commitCount, lastActivity })
              }
            }

            res.end(JSON.stringify(repos))
            return
          }

          // GET /api/axon/context-status
          if (req.url === '/api/axon/context-status') {
            const axonGit = join(AXON_HOME, '.git')
            const initialized = existsSync(axonGit)

            let remote = ''
            let commitCount = 0
            let lastCommit = ''

            if (initialized) {
              try { remote = execSync(`git -C "${AXON_HOME}" remote get-url origin 2>/dev/null`, { encoding: 'utf-8' }).trim() } catch {}
              try { commitCount = parseInt(execSync(`git -C "${AXON_HOME}" rev-list --count HEAD 2>/dev/null`, { encoding: 'utf-8' }).trim(), 10) || 0 } catch {}
              try { lastCommit = execSync(`git -C "${AXON_HOME}" log -1 --format=%ai 2>/dev/null`, { encoding: 'utf-8' }).trim() } catch {}
            }

            res.end(JSON.stringify({ initialized, remote, commitCount, lastCommit }))
            return
          }

          // POST /api/axon/init — SSE streaming project init
          if (req.url === '/api/axon/init' && req.method === 'POST') {
            const body = await new Promise<string>((resolve) => {
              let data = ''
              req.on('data', (chunk: Buffer) => { data += chunk.toString() })
              req.on('end', () => resolve(data))
            })

            const { projectName, projectPath } = JSON.parse(body) as {
              projectName: string
              projectPath: string
            }

            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Connection', 'keep-alive')

            const cleanEnv = { ...process.env }
            delete cleanEnv.CLAUDECODE
            delete cleanEnv.CLAUDE_CODE_SESSION

            const initScript = resolve(join(process.cwd(), '..', 'cli', 'axon-init'))

            const child = spawn(initScript, [], {
              stdio: ['ignore', 'pipe', 'pipe'],
              env: { ...cleanEnv, PROJECT: projectName, PROJECT_PATH: projectPath, AXON_HOME },
              cwd: projectPath,
            })

            child.stdout.on('data', (data: Buffer) => {
              const text = data.toString()
              res.write(`data: ${JSON.stringify({ type: 'progress', text })}\n\n`)
            })

            child.stderr.on('data', (data: Buffer) => {
              const text = data.toString()
              res.write(`data: ${JSON.stringify({ type: 'log', text })}\n\n`)
            })

            await new Promise<void>((resolveInit) => {
              child.on('close', async (code) => {
                // Read the genesis file and send its content before 'done'
                if (code === 0) {
                  try {
                    const genesisPath = join(AXON_HOME, 'workspaces', projectName, 'episodes', '0000_genesis.md')
                    const genesisContent = await readFile(genesisPath, 'utf-8')
                    res.write(`data: ${JSON.stringify({ type: 'content', text: genesisContent })}\n\n`)
                  } catch {}
                }
                res.write(`data: ${JSON.stringify({ type: 'done', code })}\n\n`)
                res.end()
                resolveInit()
              })

              child.on('error', (err) => {
                res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`)
                res.end()
                resolveInit()
              })

              req.on('close', () => {
                if (!child.killed) child.kill()
                resolveInit()
              })
            })
            return
          }

          res.statusCode = 404
          res.end(JSON.stringify({ error: 'Not found' }))
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(e) }))
        }
      })
    }
  }
}
