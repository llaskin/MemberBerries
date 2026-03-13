import { describe, it, expect } from 'vitest'
import { parseTodos, serializeTodos } from './todoParser'
import type { TodoItem, TodoState } from './todoParser'

const SAMPLE_TODOS = `---
type: todos
project: axon
updated_at: 2026-03-13T14:00:00Z
---

## Active
- [ ] #1 Implement CLAUDE.md bridge [created: 2026-03-13] [priority: high]
- [ ] #2 Fix terminal scroll bug [created: 2026-03-12] [priority: medium]

## Completed
- [x] #3 Add zone rename [created: 2026-03-12] [completed: 2026-03-13]

## Deferred
- [>] #4 GDrive backup [created: 2026-03-13] [deferred: 2026-03-13] [reason: post-launch]

## Dropped
- [-] #5 Custom themes [created: 2026-03-11] [dropped: 2026-03-12] [reason: not needed]
`

describe('parseTodos', () => {
  it('parses frontmatter', () => {
    const state = parseTodos(SAMPLE_TODOS)
    expect(state.project).toBe('axon')
    expect(state.updatedAt).toBe('2026-03-13T14:00:00Z')
  })

  it('parses all items', () => {
    const state = parseTodos(SAMPLE_TODOS)
    expect(state.items).toHaveLength(5)
  })

  it('parses active items correctly', () => {
    const state = parseTodos(SAMPLE_TODOS)
    const active = state.items.filter(i => i.status === 'active')
    expect(active).toHaveLength(2)
    expect(active[0]).toEqual({
      id: 1,
      description: 'Implement CLAUDE.md bridge',
      status: 'active',
      priority: 'high',
      created: '2026-03-13',
      completed: undefined,
      deferred: undefined,
      dropped: undefined,
      reason: undefined,
    })
    expect(active[1].priority).toBe('medium')
  })

  it('parses completed items', () => {
    const state = parseTodos(SAMPLE_TODOS)
    const completed = state.items.filter(i => i.status === 'completed')
    expect(completed).toHaveLength(1)
    expect(completed[0].id).toBe(3)
    expect(completed[0].completed).toBe('2026-03-13')
  })

  it('parses deferred items with reason', () => {
    const state = parseTodos(SAMPLE_TODOS)
    const deferred = state.items.filter(i => i.status === 'deferred')
    expect(deferred).toHaveLength(1)
    expect(deferred[0].id).toBe(4)
    expect(deferred[0].reason).toBe('post-launch')
    expect(deferred[0].deferred).toBe('2026-03-13')
  })

  it('parses dropped items with reason', () => {
    const state = parseTodos(SAMPLE_TODOS)
    const dropped = state.items.filter(i => i.status === 'dropped')
    expect(dropped).toHaveLength(1)
    expect(dropped[0].id).toBe(5)
    expect(dropped[0].reason).toBe('not needed')
  })

  it('handles empty todos file', () => {
    const state = parseTodos(`---
type: todos
project: test
updated_at: 2026-03-13T00:00:00Z
---

## Active

## Completed

## Deferred

## Dropped
`)
    expect(state.items).toHaveLength(0)
    expect(state.project).toBe('test')
  })

  it('parses indented continuation lines as notes', () => {
    const state = parseTodos(`---
type: todos
project: test
updated_at: 2026-03-13T00:00:00Z
---

## Active
- [ ] #1 Task with notes [created: 2026-03-13] [priority: high]
    First note line
    Second note line

## Completed

## Deferred

## Dropped
`)
    expect(state.items[0].notes).toBe('First note line\nSecond note line')
  })

  it('handles items without notes', () => {
    const state = parseTodos(SAMPLE_TODOS)
    expect(state.items[0].notes).toBeUndefined()
  })

  it('defaults priority to medium when missing', () => {
    const state = parseTodos(`---
type: todos
project: test
updated_at: 2026-03-13T00:00:00Z
---

## Active
- [ ] #1 No priority specified [created: 2026-03-13]

## Completed

## Deferred

## Dropped
`)
    expect(state.items[0].priority).toBe('medium')
  })
})

describe('serializeTodos', () => {
  it('round-trips through parse and serialize', () => {
    const state = parseTodos(SAMPLE_TODOS)
    const serialized = serializeTodos(state)
    const reparsed = parseTodos(serialized)

    expect(reparsed.items).toHaveLength(state.items.length)
    expect(reparsed.project).toBe(state.project)

    // Check each item matches
    for (let i = 0; i < state.items.length; i++) {
      expect(reparsed.items[i].id).toBe(state.items[i].id)
      expect(reparsed.items[i].description).toBe(state.items[i].description)
      expect(reparsed.items[i].status).toBe(state.items[i].status)
    }
  })

  it('round-trips notes through parse and serialize', () => {
    const state: TodoState = {
      project: 'test',
      updatedAt: '2026-03-13T00:00:00Z',
      items: [
        { id: 1, description: 'Task with notes', status: 'active', priority: 'high', created: '2026-03-13', notes: 'Line one\nLine two' },
      ],
    }
    const serialized = serializeTodos(state)
    expect(serialized).toContain('    Line one')
    expect(serialized).toContain('    Line two')
    const reparsed = parseTodos(serialized)
    expect(reparsed.items[0].notes).toBe('Line one\nLine two')
  })

  it('groups items by status section', () => {
    const state: TodoState = {
      project: 'test',
      updatedAt: '2026-03-13T00:00:00Z',
      items: [
        { id: 1, description: 'Active task', status: 'active', priority: 'high', created: '2026-03-13' },
        { id: 2, description: 'Done task', status: 'completed', priority: 'medium', created: '2026-03-12', completed: '2026-03-13' },
      ],
    }
    const serialized = serializeTodos(state)
    expect(serialized).toContain('## Active\n- [ ] #1 Active task')
    expect(serialized).toContain('## Completed\n- [x] #2 Done task')
  })
})
