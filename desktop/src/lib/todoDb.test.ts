import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  listTodos, getTodo, addTodo, transitionTodo, reprioritiseTodo,
  editTodo, addNote, closeTodoDb, todoDendriteSummary,
} from './todoDb'

let testDir: string
const PROJECT = 'test-project'

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'axon-todo-test-'))
  process.env.AXON_HOME = testDir
  mkdirSync(join(testDir, 'workspaces', PROJECT), { recursive: true })
})

afterEach(() => {
  closeTodoDb(PROJECT)
  rmSync(testDir, { recursive: true, force: true })
  delete process.env.AXON_HOME
})

describe('CRUD', () => {
  it('adds a todo and retrieves it', () => {
    const item = addTodo(PROJECT, { description: 'Test task' })
    expect(item.id).toBe(1)
    expect(item.description).toBe('Test task')
    expect(item.status).toBe('active')
    expect(item.priority).toBe('medium')
    expect(item.created).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('assigns sequential IDs', () => {
    addTodo(PROJECT, { description: 'First' })
    addTodo(PROJECT, { description: 'Second' })
    const third = addTodo(PROJECT, { description: 'Third' })
    expect(third.id).toBe(3)
  })

  it('stores and retrieves tags', () => {
    const item = addTodo(PROJECT, { description: 'Tagged', tags: ['cli', 'desktop'] })
    expect(item.tags).toEqual(['cli', 'desktop'])
  })

  it('stores and retrieves notes', () => {
    const item = addTodo(PROJECT, { description: 'With notes', notes: 'Line one\nLine two' })
    expect(item.notes).toBe('Line one\nLine two')
  })

  it('defaults priority to medium', () => {
    const item = addTodo(PROJECT, { description: 'No priority' })
    expect(item.priority).toBe('medium')
  })

  it('accepts explicit priority', () => {
    const item = addTodo(PROJECT, { description: 'Urgent', priority: 'critical' })
    expect(item.priority).toBe('critical')
  })

  it('items without tags have undefined tags', () => {
    const item = addTodo(PROJECT, { description: 'No tags' })
    expect(item.tags).toBeUndefined()
  })

  it('lists all items', () => {
    addTodo(PROJECT, { description: 'A' })
    addTodo(PROJECT, { description: 'B' })
    expect(listTodos(PROJECT)).toHaveLength(2)
  })

  it('filters by status', () => {
    addTodo(PROJECT, { description: 'Active' })
    const item = addTodo(PROJECT, { description: 'Done' })
    transitionTodo(PROJECT, item.id, 'complete')
    expect(listTodos(PROJECT, 'active')).toHaveLength(1)
    expect(listTodos(PROJECT, 'completed')).toHaveLength(1)
  })

  it('gets a single item by ID', () => {
    addTodo(PROJECT, { description: 'Find me' })
    const found = getTodo(PROJECT, 1)
    expect(found).not.toBeNull()
    expect(found!.description).toBe('Find me')
  })

  it('returns null for nonexistent ID', () => {
    expect(getTodo(PROJECT, 999)).toBeNull()
  })
})

describe('transitions', () => {
  it('completes an item', () => {
    addTodo(PROJECT, { description: 'Task', priority: 'high' })
    const done = transitionTodo(PROJECT, 1, 'complete')
    expect(done.status).toBe('completed')
    expect(done.completed).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(done.priority).toBe('high') // preserved
  })

  it('defers with reason', () => {
    addTodo(PROJECT, { description: 'Task' })
    const deferred = transitionTodo(PROJECT, 1, 'defer', { reason: 'blocked' })
    expect(deferred.status).toBe('deferred')
    expect(deferred.reason).toBe('blocked')
    expect(deferred.deferred).toBeTruthy()
  })

  it('drops with reason', () => {
    addTodo(PROJECT, { description: 'Task' })
    const dropped = transitionTodo(PROJECT, 1, 'drop', { reason: 'not needed' })
    expect(dropped.status).toBe('dropped')
    expect(dropped.reason).toBe('not needed')
  })

  it('reactivates a completed item preserving priority', () => {
    addTodo(PROJECT, { description: 'Task', priority: 'critical' })
    transitionTodo(PROJECT, 1, 'complete')
    const reactivated = transitionTodo(PROJECT, 1, 'reactivate')
    expect(reactivated.status).toBe('active')
    expect(reactivated.priority).toBe('critical') // preserved!
    expect(reactivated.completed).toBeUndefined()
  })

  it('reactivates a deferred item', () => {
    addTodo(PROJECT, { description: 'Task', priority: 'high' })
    transitionTodo(PROJECT, 1, 'defer', { reason: 'later' })
    const reactivated = transitionTodo(PROJECT, 1, 'reactivate')
    expect(reactivated.status).toBe('active')
    expect(reactivated.deferred).toBeUndefined()
    expect(reactivated.reason).toBeUndefined()
  })
})

describe('edit', () => {
  it('updates description', () => {
    addTodo(PROJECT, { description: 'Old' })
    const edited = editTodo(PROJECT, 1, { description: 'New' })
    expect(edited.description).toBe('New')
  })

  it('updates priority', () => {
    addTodo(PROJECT, { description: 'Task', priority: 'low' })
    const edited = editTodo(PROJECT, 1, { priority: 'critical' })
    expect(edited.priority).toBe('critical')
  })

  it('updates tags', () => {
    addTodo(PROJECT, { description: 'Task', tags: ['old'] })
    const edited = editTodo(PROJECT, 1, { tags: ['new', 'tags'] })
    expect(edited.tags).toEqual(['new', 'tags'])
  })

  it('clears tags with empty array', () => {
    addTodo(PROJECT, { description: 'Task', tags: ['cli'] })
    const edited = editTodo(PROJECT, 1, { tags: [] })
    expect(edited.tags).toBeUndefined()
  })

  it('updates notes', () => {
    addTodo(PROJECT, { description: 'Task' })
    const edited = editTodo(PROJECT, 1, { notes: 'New notes' })
    expect(edited.notes).toBe('New notes')
  })

  it('reprioritises', () => {
    addTodo(PROJECT, { description: 'Task' })
    const item = reprioritiseTodo(PROJECT, 1, 'high')
    expect(item.priority).toBe('high')
  })

  it('appends a note', () => {
    addTodo(PROJECT, { description: 'Task', notes: 'Line 1' })
    const item = addNote(PROJECT, 1, 'Line 2')
    expect(item.notes).toBe('Line 1\nLine 2')
  })

  it('adds first note', () => {
    addTodo(PROJECT, { description: 'Task' })
    const item = addNote(PROJECT, 1, 'First note')
    expect(item.notes).toBe('First note')
  })
})

describe('migration from todos.md', () => {
  const SAMPLE_MD = `---
type: todos
project: test-project
updated_at: 2026-03-13T14:00:00Z
---

## Active
- [ ] #1 Implement feature [created: 2026-03-13] [priority: critical] [tag: cli] [tag: desktop]
    Some detail notes
    More notes here
- [ ] #2 Fix bug [created: 2026-03-12] [priority: medium]

## Completed
- [x] #3 Add zone rename [created: 2026-03-12] [completed: 2026-03-13]

## Deferred
- [>] #4 GDrive backup [created: 2026-03-13] [deferred: 2026-03-13] [reason: post-launch]

## Dropped
- [-] #5 Custom themes [created: 2026-03-11] [dropped: 2026-03-12] [reason: not needed]
`

  it('imports todos.md on first open', () => {
    writeFileSync(join(testDir, 'workspaces', PROJECT, 'todos.md'), SAMPLE_MD)
    const items = listTodos(PROJECT)
    expect(items).toHaveLength(5)
    expect(items[0].description).toBe('Implement feature')
    expect(items[0].priority).toBe('critical')
    expect(items[0].tags).toEqual(['cli', 'desktop'])
    expect(items[0].notes).toBe('Some detail notes\nMore notes here')
  })

  it('creates .migrated backup', () => {
    writeFileSync(join(testDir, 'workspaces', PROJECT, 'todos.md'), SAMPLE_MD)
    listTodos(PROJECT) // triggers migration
    expect(existsSync(join(testDir, 'workspaces', PROJECT, 'todos.md.migrated'))).toBe(true)
    expect(existsSync(join(testDir, 'workspaces', PROJECT, 'todos.md'))).toBe(false)
  })

  it('preserves all item types', () => {
    writeFileSync(join(testDir, 'workspaces', PROJECT, 'todos.md'), SAMPLE_MD)
    const items = listTodos(PROJECT)
    expect(items.filter(i => i.status === 'active')).toHaveLength(2)
    expect(items.filter(i => i.status === 'completed')).toHaveLength(1)
    expect(items.filter(i => i.status === 'deferred')).toHaveLength(1)
    expect(items.filter(i => i.status === 'dropped')).toHaveLength(1)
  })

  it('preserves deferred/dropped metadata', () => {
    writeFileSync(join(testDir, 'workspaces', PROJECT, 'todos.md'), SAMPLE_MD)
    const items = listTodos(PROJECT)
    const deferred = items.find(i => i.id === 4)!
    expect(deferred.reason).toBe('post-launch')
    expect(deferred.deferred).toBe('2026-03-13')
    const dropped = items.find(i => i.id === 5)!
    expect(dropped.reason).toBe('not needed')
  })

  it('does not re-import if DB already exists', () => {
    addTodo(PROJECT, { description: 'Pre-existing' }) // creates DB first
    closeTodoDb(PROJECT)
    // Now write todos.md after DB exists
    writeFileSync(join(testDir, 'workspaces', PROJECT, 'todos.md'), SAMPLE_MD)
    // Reopen — DB exists so migration should NOT run
    const items = listTodos(PROJECT)
    expect(items).toHaveLength(1)
    expect(items[0].description).toBe('Pre-existing')
  })
})

describe('dendrite summary', () => {
  it('returns correct counts', () => {
    addTodo(PROJECT, { description: 'A', priority: 'critical' })
    addTodo(PROJECT, { description: 'B', priority: 'high' })
    addTodo(PROJECT, { description: 'C' })
    transitionTodo(PROJECT, 3, 'complete')
    const summary = todoDendriteSummary(PROJECT)
    expect(summary.active).toBe(2)
    expect(summary.completed).toBe(1)
    expect(summary.byPriority.critical).toHaveLength(1)
    expect(summary.byPriority.high).toHaveLength(1)
  })

  it('collects unique tags', () => {
    addTodo(PROJECT, { description: 'A', tags: ['cli', 'desktop'] })
    addTodo(PROJECT, { description: 'B', tags: ['cli', 'data'] })
    const summary = todoDendriteSummary(PROJECT)
    expect(summary.tags).toEqual(['cli', 'data', 'desktop'])
  })
})

describe('mutation log', () => {
  it('writes to todos-log.md on add', () => {
    addTodo(PROJECT, { description: 'Logged task', priority: 'high' })
    const logPath = join(testDir, 'workspaces', PROJECT, 'todos-log.md')
    expect(existsSync(logPath)).toBe(true)
    const content = readFileSync(logPath, 'utf-8')
    expect(content).toContain('ADD #1 "Logged task" priority=high')
  })

  it('writes to stream.md on transition', () => {
    addTodo(PROJECT, { description: 'Task' })
    transitionTodo(PROJECT, 1, 'complete')
    const content = readFileSync(join(testDir, 'workspaces', PROJECT, 'stream.md'), 'utf-8')
    expect(content).toContain('todo COMPLETE #1')
  })
})
