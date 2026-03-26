#!/usr/bin/env tsx
/**
 * Session dendrite — generates a claude-sessions dendrite markdown file
 * from the sessions SQLite DB and history.jsonl prompt timeline.
 *
 * Usage: npx tsx sessionDendrite.ts dendrite --workspace <path> --since <iso8601>
 *
 * Follows the pattern of todoCli.ts (invoked by axon-collect via npx tsx).
 */
import * as fs from 'fs'
import * as path from 'path'
import Database from 'better-sqlite3'
import { redactText } from './redact'
import { parseHistoryFile, getPromptsForSession } from './promptTimeline'

const args = process.argv.slice(2)
const command = args[0]

if (command !== 'dendrite') {
  console.error('Usage: sessionDendrite.ts dendrite --workspace <path> --since <iso8601>')
  process.exit(1)
}

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 ? args[idx + 1] : undefined
}

const workspace = getArg('workspace')
const since = getArg('since')
const agentFilter = getArg('agent') // 'claude', 'codex', 'all', etc.

if (!workspace) {
  console.error('--workspace is required')
  process.exit(1)
}

// --- Read config (simple YAML extraction) ---
const HOME = process.env.HOME || process.env.USERPROFILE || '~'
let historyPath = path.join(HOME, '.claude', 'history.jsonl')
let maxPromptsPerSession = 50
let extraPatterns: string[] = []

const configPath = path.join(workspace, 'config.yaml')
if (fs.existsSync(configPath)) {
  try {
    // Use yaml package if available, fall back to regex
    const { parse } = require('yaml')
    const config = parse(fs.readFileSync(configPath, 'utf-8'))
    if (config?.history_path) {
      historyPath = config.history_path.replace(/^~/, HOME)
    }
    if (config?.rollup?.max_prompts_per_session) {
      maxPromptsPerSession = config.rollup.max_prompts_per_session
    }
    if (config?.redaction?.extra_patterns) {
      extraPatterns = config.redaction.extra_patterns
    }
  } catch {
    // Silently continue with defaults
  }
}

// --- Open sessions DB ---
const dbPath = path.join(HOME, '.memberberries', 'sessions.db')
if (!fs.existsSync(dbPath)) {
  console.error(`Sessions database not found: ${dbPath}`)
  process.exit(1)
}
const db = new Database(dbPath, { readonly: true })

// --- Query sessions since cutoff ---
const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

// Build query with optional agent filter (migration-aware)
let query = `SELECT id, project_name, project_path, first_prompt, heuristic_summary,
       tool_call_count, files_touched_count, estimated_cost_usd,
       tool_calls_json, created_at, modified_at, message_count, errors
  FROM sessions WHERE modified_at > ?`
const queryParams: any[] = [sinceDate]

// Check if agent column exists before filtering
if (agentFilter && agentFilter !== 'all') {
  try {
    db.prepare('SELECT agent FROM sessions LIMIT 1').get()
    query += ' AND agent = ?'
    queryParams.push(agentFilter)
  } catch {
    // agent column doesn't exist yet — skip filter
  }
}
query += ' ORDER BY created_at ASC'

const sessions = db.prepare(query).all(...queryParams) as any[]

if (sessions.length === 0) {
  console.log(`No sessions modified since ${sinceDate}`)
  process.exit(0)
}

// --- Load history.jsonl for prompt timelines ---
let promptMap = new Map<string, any[]>()
if (fs.existsSync(historyPath)) {
  const content = fs.readFileSync(historyPath, 'utf-8')
  promptMap = parseHistoryFile(content, extraPatterns)
}

// --- Build dendrite markdown ---
const now = new Date().toISOString()
const today = now.slice(0, 10)
const projects = new Map<string, { name: string; path: string; count: number }>()
let totalPrompts = 0
let totalCost = 0

for (const s of sessions) {
  const name = s.project_name || 'unknown'
  const existing = projects.get(name) || { name, path: s.project_path || '', count: 0 }
  existing.count++
  projects.set(name, existing)
  totalPrompts += s.message_count || 0
  totalCost += s.estimated_cost_usd || 0
}

const projectsYaml = Array.from(projects.values())
  .map(p => `  - name: ${p.name}\n    path: ${p.path}\n    sessions: ${p.count}`)
  .join('\n')

let md = `---
type: claude-sessions
collected_at: ${now}
since: ${sinceDate}
session_count: ${sessions.length}
total_prompts: ${totalPrompts}
total_cost_usd: ${totalCost.toFixed(2)}
projects:
${projectsYaml}
---
# Claude Sessions: ${today}

`

for (const s of sessions) {
  const duration = s.created_at && s.modified_at
    ? Math.round((new Date(s.modified_at).getTime() - new Date(s.created_at).getTime()) / 60000)
    : 0
  const durationStr = duration >= 60 ? `${Math.floor(duration / 60)}h ${duration % 60}min` : `${duration} min`
  const cost = (s.estimated_cost_usd || 0).toFixed(2)

  md += `## Session: ${s.id.slice(0, 8)} | ${s.project_name || 'unknown'} | ${durationStr} | $${cost}\n`
  md += `**Summary:** ${s.heuristic_summary || 'No summary'}\n`

  // Tool calls
  if (s.tool_calls_json) {
    try {
      const tools = JSON.parse(s.tool_calls_json) as Array<{ tool: string; count: number }>
      if (tools.length > 0) {
        md += `**Tools:** ${tools.map(t => `${t.tool}(${t.count})`).join(', ')}\n`
      }
    } catch { /* skip */ }
  }

  md += '\n'

  // Prompts (redacted)
  const prompts = getPromptsForSession(promptMap, s.id)
  if (prompts.length > 0) {
    md += `### Prompts (redacted)\n`
    const visible = prompts.slice(0, maxPromptsPerSession)
    for (const p of visible) {
      const time = new Date(p.timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: false,
      })
      const text = p.display.length > 120 ? p.display.slice(0, 120) + '...' : p.display
      md += `- ${time} — "${text}"\n`
    }
    if (prompts.length > maxPromptsPerSession) {
      md += `- ... (${prompts.length - maxPromptsPerSession} more)\n`
    }
    md += '\n'
  }
}

// --- Write dendrite file ---
const dendritesDir = path.join(workspace, 'dendrites')
if (!fs.existsSync(dendritesDir)) fs.mkdirSync(dendritesDir, { recursive: true })

const timestamp = now.replace(/[:-]/g, '').replace('T', 'T').slice(0, 15) + 'Z'
const filename = `${timestamp}_claude-sessions.md`
const outputPath = path.join(dendritesDir, filename)
fs.writeFileSync(outputPath, md)
console.log(`Wrote dendrite: ${outputPath}`)

db.close()
