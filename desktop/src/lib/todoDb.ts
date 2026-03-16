// todoDb.ts — SQLite-backed TODO storage. Single module used by Vite plugin + CLI.

import Database from 'better-sqlite3'
import { join } from 'path'
import { homedir } from 'os'
import { mkdirSync, existsSync, readFileSync, appendFileSync, renameSync } from 'fs'
import { parseTodos } from './todoParser'

// ─── Types ───────────────────────────────────────────────────────

export type TodoStatus = 'active' | 'completed' | 'deferred' | 'dropped'
export type TodoPriority = 'critical' | 'high' | 'medium' | 'low'

export interface TodoItem {
  id: number
  description: string
  notes?: string
  tags?: string[]
  status: TodoStatus
  priority: TodoPriority
  created: string       // YYYY-MM-DD
  completed?: string
  deferred?: string
  dropped?: string
  reason?: string
}

// ─── DB Lifecycle ────────────────────────────────────────────────

const cache = new Map<string, Database.Database>()

function axonHome(): string {
  return process.env.AXON_HOME || join(homedir(), '.axon')
}

function wsDir(project: string): string {
  return join(axonHome(), 'workspaces', project)
}

export function getTodoDb(project: string): Database.Database {
  if (cache.has(project)) return cache.get(project)!

  const dir = wsDir(project)
  const dbPath = join(dir, 'todos.db')
  const mdPath = join(dir, 'todos.md')
  const isNew = !existsSync(dbPath)

  mkdirSync(dir, { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  runMigrations(db)

  if (isNew && existsSync(mdPath)) {
    importFromMarkdown(db, project, mdPath)
  }

  cache.set(project, db)
  return db
}

export function closeTodoDb(project: string): void {
  const db = cache.get(project)
  if (db) {
    db.close()
    cache.delete(project)
  }
}

// ─── Migrations ──────────────────────────────────────────────────

function runMigrations(db: Database.Database): void {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0
  if (version < 1) migrateV1(db)
}

function migrateV1(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id          INTEGER PRIMARY KEY,
      description TEXT    NOT NULL,
      notes       TEXT,
      status      TEXT    NOT NULL DEFAULT 'active',
      priority    TEXT    NOT NULL DEFAULT 'medium',
      created     TEXT    NOT NULL,
      completed   TEXT,
      deferred    TEXT,
      dropped     TEXT,
      reason      TEXT,
      tags        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
    CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority);

    PRAGMA user_version = 1;
  `)
}

// ─── Row ↔ TodoItem ──────────────────────────────────────────────

interface TodoRow {
  id: number
  description: string
  notes: string | null
  status: string
  priority: string
  created: string
  completed: string | null
  deferred: string | null
  dropped: string | null
  reason: string | null
  tags: string | null
}

function rowToItem(row: TodoRow): TodoItem {
  const item: TodoItem = {
    id: row.id,
    description: row.description,
    status: row.status as TodoStatus,
    priority: row.priority as TodoPriority,
    created: row.created,
  }
  if (row.notes) item.notes = row.notes
  if (row.tags) {
    const parsed = JSON.parse(row.tags) as string[]
    if (parsed.length > 0) item.tags = parsed
  }
  if (row.completed) item.completed = row.completed
  if (row.deferred) item.deferred = row.deferred
  if (row.dropped) item.dropped = row.dropped
  if (row.reason) item.reason = row.reason
  return item
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function nowISO(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

// ─── CRUD ────────────────────────────────────────────────────────

export function listTodos(project: string, status?: TodoStatus): TodoItem[] {
  const db = getTodoDb(project)
  const rows = status
    ? db.prepare('SELECT * FROM todos WHERE status = ? ORDER BY id').all(status) as TodoRow[]
    : db.prepare('SELECT * FROM todos ORDER BY id').all() as TodoRow[]
  return rows.map(rowToItem)
}

export function getTodo(project: string, id: number): TodoItem | null {
  const db = getTodoDb(project)
  const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as TodoRow | undefined
  return row ? rowToItem(row) : null
}

export function addTodo(project: string, input: {
  description: string
  priority?: TodoPriority
  notes?: string
  tags?: string[]
}): TodoItem {
  const db = getTodoDb(project)
  const nextId = ((db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next FROM todos').get() as { next: number }).next)
  const pri = input.priority || 'medium'
  const d = today()
  const tagsJson = input.tags && input.tags.length > 0 ? JSON.stringify(input.tags) : null

  db.prepare(`
    INSERT INTO todos (id, description, notes, status, priority, created, tags)
    VALUES (?, ?, ?, 'active', ?, ?, ?)
  `).run(nextId, input.description, input.notes || null, pri, d, tagsJson)

  const tagExtra = input.tags ? ` ${input.tags.map(t => `tag=${t}`).join(' ')}` : ''
  logMutation(project, 'ADD', nextId, input.description, `priority=${pri}${tagExtra}`)

  return getTodo(project, nextId)!
}

export function transitionTodo(
  project: string,
  id: number,
  action: 'complete' | 'defer' | 'drop' | 'reactivate',
  opts?: { reason?: string; priority?: string }
): TodoItem {
  const db = getTodoDb(project)
  const d = today()

  switch (action) {
    case 'complete':
      db.prepare('UPDATE todos SET status = ?, completed = ? WHERE id = ?')
        .run('completed', d, id)
      break
    case 'defer':
      db.prepare('UPDATE todos SET status = ?, deferred = ?, reason = COALESCE(?, reason) WHERE id = ?')
        .run('deferred', d, opts?.reason || null, id)
      break
    case 'drop':
      db.prepare('UPDATE todos SET status = ?, dropped = ?, reason = COALESCE(?, reason) WHERE id = ?')
        .run('dropped', d, opts?.reason || null, id)
      break
    case 'reactivate':
      db.prepare('UPDATE todos SET status = ?, completed = NULL, deferred = NULL, dropped = NULL, reason = NULL WHERE id = ?')
        .run('active', id)
      if (opts?.priority) {
        db.prepare('UPDATE todos SET priority = ? WHERE id = ?').run(opts.priority, id)
      }
      break
  }

  const item = getTodo(project, id)!
  const extra = opts?.reason ? `reason="${opts.reason}"` : ''
  logMutation(project, action.toUpperCase(), id, item.description, extra)
  return item
}

export function reprioritiseTodo(project: string, id: number, priority: TodoPriority): TodoItem {
  const db = getTodoDb(project)
  db.prepare('UPDATE todos SET priority = ? WHERE id = ?').run(priority, id)
  const item = getTodo(project, id)!
  logMutation(project, 'REPRIORITISE', id, item.description, `priority=${priority}`)
  return item
}

export function editTodo(project: string, id: number, changes: {
  description?: string
  priority?: TodoPriority
  tags?: string[]
  notes?: string
}): TodoItem {
  const db = getTodoDb(project)
  const sets: string[] = []
  const vals: unknown[] = []

  if (changes.description !== undefined) { sets.push('description = ?'); vals.push(changes.description) }
  if (changes.priority !== undefined) { sets.push('priority = ?'); vals.push(changes.priority) }
  if (changes.notes !== undefined) { sets.push('notes = ?'); vals.push(changes.notes || null) }
  if (changes.tags !== undefined) { sets.push('tags = ?'); vals.push(changes.tags.length > 0 ? JSON.stringify(changes.tags) : null) }

  if (sets.length > 0) {
    vals.push(id)
    db.prepare(`UPDATE todos SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  }

  const item = getTodo(project, id)!
  logMutation(project, 'EDIT', id, item.description)
  return item
}

export function addNote(project: string, id: number, note: string): TodoItem {
  const db = getTodoDb(project)
  const existing = getTodo(project, id)
  if (!existing) throw new Error(`Todo #${id} not found`)

  const newNotes = existing.notes ? existing.notes + '\n' + note : note
  db.prepare('UPDATE todos SET notes = ? WHERE id = ?').run(newNotes, id)

  logMutation(project, 'NOTE', id, existing.description, `note="${note}"`)
  return getTodo(project, id)!
}

// ─── Dendrite Summary ────────────────────────────────────────────

export function todoDendriteSummary(project: string): {
  active: number
  completed: number
  deferred: number
  dropped: number
  stale: number
  byPriority: Record<TodoPriority, TodoItem[]>
  completedThisWeek: number
  tags: string[]
  items: TodoItem[]
} {
  const items = listTodos(project)
  today() // ensure date fn works
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)

  const active = items.filter(i => i.status === 'active')
  const completed = items.filter(i => i.status === 'completed')

  const staleThreshold = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)
  const stale = active.filter(i => i.created <= staleThreshold).length

  const byPriority: Record<TodoPriority, TodoItem[]> = { critical: [], high: [], medium: [], low: [] }
  for (const item of active) byPriority[item.priority].push(item)

  const allTags = new Set<string>()
  for (const item of items) {
    if (item.tags) item.tags.forEach(t => allTags.add(t))
  }

  return {
    active: active.length,
    completed: completed.length,
    deferred: items.filter(i => i.status === 'deferred').length,
    dropped: items.filter(i => i.status === 'dropped').length,
    stale,
    byPriority,
    completedThisWeek: completed.filter(i => i.completed && i.completed >= weekAgo).length,
    tags: [...allTags].sort(),
    items,
  }
}

// ─── Mutation Log ────────────────────────────────────────────────

function logMutation(project: string, action: string, id: number, desc: string, extra?: string): void {
  const dir = wsDir(project)
  const now = nowISO()
  const suffix = extra ? ` ${extra}` : ''
  const logLine = `[${now}] ${action} #${id} "${desc}"${suffix}\n`
  const streamLine = `- [${now}] @axon: todo ${action} #${id} "${desc}"${suffix}\n`

  try {
    appendFileSync(join(dir, 'todos-log.md'), logLine)
    appendFileSync(join(dir, 'stream.md'), streamLine)
  } catch {
    // silently ignore if files can't be written
  }
}

// ─── Migration from todos.md ─────────────────────────────────────

function importFromMarkdown(db: Database.Database, _project: string, mdPath: string): void {
  const content = readFileSync(mdPath, 'utf-8')
  const state = parseTodos(content)

  const insert = db.prepare(`
    INSERT OR IGNORE INTO todos (id, description, notes, status, priority, created, completed, deferred, dropped, reason, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const tx = db.transaction(() => {
    for (const item of state.items) {
      insert.run(
        item.id,
        item.description,
        item.notes || null,
        item.status,
        item.priority,
        item.created,
        item.completed || null,
        item.deferred || null,
        item.dropped || null,
        item.reason || null,
        item.tags && item.tags.length > 0 ? JSON.stringify(item.tags) : null,
      )
    }
  })
  tx()

  renameSync(mdPath, mdPath + '.migrated')
}
