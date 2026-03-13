// todoParser.ts — Parse/serialize todos.md ↔ TypeScript types

export type TodoStatus = 'active' | 'completed' | 'deferred' | 'dropped'
export type TodoPriority = 'critical' | 'high' | 'medium' | 'low'

export interface TodoItem {
  id: number
  description: string
  notes?: string        // Multi-line notes (indented continuation lines)
  tags?: string[]       // Multiple [tag: x] brackets
  status: TodoStatus
  priority: TodoPriority
  created: string       // YYYY-MM-DD
  completed?: string
  deferred?: string
  dropped?: string
  reason?: string
}

export interface TodoState {
  project: string
  updatedAt: string
  items: TodoItem[]
}

const SECTION_MAP: Record<string, TodoStatus> = {
  'Active': 'active',
  'Completed': 'completed',
  'Deferred': 'deferred',
  'Dropped': 'dropped',
}

const MARKER_MAP: Record<string, TodoStatus> = {
  '[ ]': 'active',
  '[x]': 'completed',
  '[>]': 'deferred',
  '[-]': 'dropped',
}

const STATUS_MARKER: Record<TodoStatus, string> = {
  active: '[ ]',
  completed: '[x]',
  deferred: '[>]',
  dropped: '[-]',
}

// Parse a single todo line into a TodoItem
function parseLine(line: string, sectionStatus: TodoStatus): TodoItem | null {
  // Match: - [marker] #id description [key: value]...
  const match = line.match(/^- \[(.)\] #(\d+)\s+(.+)$/)
  if (!match) return null

  const marker = `[${match[1]}]`
  const id = parseInt(match[2], 10)
  let rest = match[3]

  // Extract bracketed metadata (tag is special — can appear multiple times)
  const meta: Record<string, string> = {}
  const tags: string[] = []
  const metaRegex = /\[(\w+):\s*([^\]]+)\]/g
  let m
  while ((m = metaRegex.exec(rest)) !== null) {
    if (m[1] === 'tag') {
      tags.push(m[2].trim())
    } else {
      meta[m[1]] = m[2].trim()
    }
  }

  // Description is everything before the first [key: value]
  const desc = rest.replace(/\s*\[\w+:\s*[^\]]+\]/g, '').trim()

  const status = MARKER_MAP[marker] || sectionStatus

  return {
    id,
    description: desc,
    tags: tags.length > 0 ? tags : undefined,
    status,
    priority: (meta.priority as TodoPriority) || 'medium',
    created: meta.created || '',
    completed: meta.completed,
    deferred: meta.deferred,
    dropped: meta.dropped,
    reason: meta.reason,
  }
}

// Parse todos.md content into TodoState
export function parseTodos(content: string): TodoState {
  const lines = content.split('\n')
  const items: TodoItem[] = []
  let currentSection: TodoStatus = 'active'
  let project = ''
  let updatedAt = ''

  // Parse frontmatter
  let inFrontmatter = false
  for (const line of lines) {
    if (line.trim() === '---') {
      if (inFrontmatter) break
      inFrontmatter = true
      continue
    }
    if (inFrontmatter) {
      const pm = line.match(/^project:\s*(.+)$/)
      if (pm) project = pm[1].trim()
      const um = line.match(/^updated_at:\s*(.+)$/)
      if (um) updatedAt = um[1].trim()
    }
  }

  // Parse sections (collect indented lines as notes)
  for (const line of lines) {
    const sectionMatch = line.match(/^## (Active|Completed|Deferred|Dropped)/)
    if (sectionMatch) {
      currentSection = SECTION_MAP[sectionMatch[1]]
      continue
    }

    if (line.startsWith('- [')) {
      const item = parseLine(line, currentSection)
      if (item) items.push(item)
    } else if (/^    \S/.test(line) && items.length > 0) {
      // Indented continuation line → append to last item's notes
      const last = items[items.length - 1]
      const noteLine = line.slice(4) // strip 4-space indent
      last.notes = last.notes ? last.notes + '\n' + noteLine : noteLine
    }
  }

  return { project, updatedAt, items }
}

// Serialize TodoState back to todos.md content
export function serializeTodos(state: TodoState): string {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const sections: Record<TodoStatus, string[]> = {
    active: [],
    completed: [],
    deferred: [],
    dropped: [],
  }

  for (const item of state.items) {
    const marker = STATUS_MARKER[item.status]
    let line = `- ${marker} #${item.id} ${item.description}`

    if (item.created) line += ` [created: ${item.created}]`
    if (item.priority && item.status === 'active') line += ` [priority: ${item.priority}]`
    if (item.completed) line += ` [completed: ${item.completed}]`
    if (item.deferred) line += ` [deferred: ${item.deferred}]`
    if (item.dropped) line += ` [dropped: ${item.dropped}]`
    if (item.reason) line += ` [reason: ${item.reason}]`
    if (item.tags) {
      for (const tag of item.tags) {
        line += ` [tag: ${tag}]`
      }
    }

    sections[item.status].push(line)
    if (item.notes) {
      for (const noteLine of item.notes.split('\n')) {
        sections[item.status].push(`    ${noteLine}`)
      }
    }
  }

  return `---
type: todos
project: ${state.project}
updated_at: ${now}
---

## Active
${sections.active.join('\n')}

## Completed
${sections.completed.join('\n')}

## Deferred
${sections.deferred.join('\n')}

## Dropped
${sections.dropped.join('\n')}
`
}
