#!/usr/bin/env node
// todoCli.ts — CLI entrypoint for axon-todo. Imports todoDb directly.

import { basename } from 'path'
import {
  addTodo, listTodos, transitionTodo, reprioritiseTodo,
  addNote, editTodo, todoDendriteSummary,
} from './todoDb'
import type { TodoPriority, TodoItem } from './todoDb'

const PROJECT = process.env.PROJECT || basename(process.cwd())
const args = process.argv.slice(2)
const subcmd = args[0]

function usage(): void {
  console.log(`Usage: axon todo <command>

Commands:
  add "desc" [--priority P] [--tag T]... [--notes "N"]
  done <id>
  defer <id> [--reason "why"]
  drop <id> [--reason "why"]
  list [active|backlog|done|all]
  reprioritise <id> <critical|high|medium|low>
  note <id> "text"
  dendrite`)
  process.exit(1)
}

function parseFlags(args: string[]): Record<string, string | string[]> {
  const flags: Record<string, string | string[]> = {}
  let i = 0
  while (i < args.length) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2)
      const val = args[i + 1] || ''
      if (key === 'tag') {
        if (!flags.tag) flags.tag = []
        ;(flags.tag as string[]).push(val)
      } else {
        flags[key] = val
      }
      i += 2
    } else {
      i++
    }
  }
  return flags
}

const PRIORITY_MARKER: Record<string, string> = {
  critical: '★',
  high: '●',
  medium: '○',
  low: '·',
}

function formatItem(item: TodoItem): string {
  const marker = PRIORITY_MARKER[item.priority] || '○'
  const tags = item.tags ? ` [${item.tags.join(', ')}]` : ''
  return `  ${marker} #${item.id} ${item.description}${tags}`
}

if (!subcmd) usage()

switch (subcmd) {
  case 'add': {
    const desc = args[1]
    if (!desc) { console.error('Error: description required'); process.exit(1) }
    const flags = parseFlags(args.slice(2))
    const priority = (flags.priority as string) as TodoPriority | undefined
    const tags = flags.tag as string[] | undefined
    const notes = flags.notes as string | undefined
    if (priority && !['critical', 'high', 'medium', 'low'].includes(priority)) {
      console.error('Error: priority must be critical|high|medium|low')
      process.exit(1)
    }
    const item = addTodo(PROJECT, { description: desc, priority, tags, notes })
    console.log(`Added #${item.id}: ${item.description} [priority: ${item.priority}]`)
    if (item.tags) console.log(`  Tags: ${item.tags.join(' ')}`)
    if (item.notes) console.log(`  Notes: ${item.notes}`)
    break
  }

  case 'done': {
    const id = parseInt(args[1], 10)
    if (!id) { console.error('Error: id required'); process.exit(1) }
    const item = transitionTodo(PROJECT, id, 'complete')
    console.log(`Completed #${id}: ${item.description}`)
    break
  }

  case 'defer': {
    const id = parseInt(args[1], 10)
    if (!id) { console.error('Error: id required'); process.exit(1) }
    const flags = parseFlags(args.slice(2))
    const item = transitionTodo(PROJECT, id, 'defer', { reason: flags.reason as string })
    console.log(`Deferred #${id}: ${item.description}`)
    if (item.reason) console.log(`  Reason: ${item.reason}`)
    break
  }

  case 'drop': {
    const id = parseInt(args[1], 10)
    if (!id) { console.error('Error: id required'); process.exit(1) }
    const flags = parseFlags(args.slice(2))
    const item = transitionTodo(PROJECT, id, 'drop', { reason: flags.reason as string })
    console.log(`Dropped #${id}: ${item.description}`)
    if (item.reason) console.log(`  Reason: ${item.reason}`)
    break
  }

  case 'list': {
    const filter = args[1] || 'active'
    const items = listTodos(PROJECT)

    console.log(`\n=== ${PROJECT} — TODOs ===\n`)

    if (filter === 'active' || filter === 'all') {
      const active = items.filter(i => i.status === 'active')
        .sort((a, b) => {
          const ord: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
          return ord[a.priority] - ord[b.priority]
        })
      if (active.length > 0) {
        console.log('Active:')
        active.forEach(i => console.log(formatItem(i)))
        console.log()
      }
    }

    if (filter === 'backlog' || filter === 'all') {
      const deferred = items.filter(i => i.status === 'deferred')
      if (deferred.length > 0) {
        console.log('Backlog:')
        deferred.forEach(i => console.log(formatItem(i)))
        console.log()
      }
    }

    if (filter === 'done' || filter === 'all') {
      const done = items.filter(i => i.status === 'completed' || i.status === 'dropped')
      if (done.length > 0) {
        console.log('Done:')
        done.forEach(i => console.log(formatItem(i)))
        console.log()
      }
    }
    break
  }

  case 'reprioritise': {
    const id = parseInt(args[1], 10)
    const pri = args[2] as TodoPriority
    if (!id || !pri) { console.error('Error: id and priority required'); process.exit(1) }
    if (!['critical', 'high', 'medium', 'low'].includes(pri)) {
      console.error('Error: priority must be critical|high|medium|low')
      process.exit(1)
    }
    const item = reprioritiseTodo(PROJECT, id, pri)
    console.log(`Reprioritised #${id}: ${item.description} → ${pri}`)
    break
  }

  case 'note': {
    const id = parseInt(args[1], 10)
    const text = args[2]
    if (!id || !text) { console.error('Error: id and note text required'); process.exit(1) }
    const item = addNote(PROJECT, id, text)
    console.log(`Note added to #${id}: ${item.description}`)
    break
  }

  case 'dendrite': {
    const summary = todoDendriteSummary(PROJECT)
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
    const tagList = summary.tags.join(',')

    // YAML frontmatter
    console.log('---')
    console.log('type: todo-state')
    console.log(`project: ${PROJECT}`)
    console.log(`collected_at: ${now}`)
    console.log(`active: ${summary.active}`)
    console.log(`completed: ${summary.completed}`)
    console.log(`deferred: ${summary.deferred}`)
    console.log(`dropped: ${summary.dropped}`)
    console.log(`stale: ${summary.stale}`)
    if (tagList) console.log(`tags: [${tagList}]`)
    console.log('---')
    console.log()

    // By priority
    console.log('# Active by Priority')
    for (const pri of ['critical', 'high', 'medium', 'low'] as TodoPriority[]) {
      const group = summary.byPriority[pri]
      if (group.length === 0) continue
      console.log(`\n## ${pri.charAt(0).toUpperCase() + pri.slice(1)} (${group.length})`)
      for (const item of group) {
        const tags = item.tags ? ` [${item.tags.join(', ')}]` : ''
        const age = Math.floor((Date.now() - new Date(item.created).getTime()) / 86400000)
        console.log(`- #${item.id} ${item.description}${tags} — ${age}d old`)
      }
    }

    // By tag
    if (summary.tags.length > 0) {
      console.log('\n# By Tag')
      const tagCounts: Record<string, number> = {}
      for (const item of summary.items.filter(i => i.status === 'active')) {
        if (item.tags) item.tags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1 })
      }
      for (const [tag, count] of Object.entries(tagCounts).sort((a, b) => b[1] - a[1])) {
        console.log(`- ${tag}: ${count} items`)
      }
    }

    // Velocity
    console.log('\n# Velocity')
    console.log(`- Completed this week: ${summary.completedThisWeek}`)
    console.log(`- Stale (>3d): ${summary.stale}`)
    console.log(`- Total active: ${summary.active}`)
    break
  }

  default:
    console.error(`Unknown command: ${subcmd}`)
    usage()
}
