import { useMemo } from 'react'

const BRANCH_CHARS = '│─┐┘┌└├┤'
const COLS = 140
const ROWS = 50

interface Branch {
  x: number
  y: number
  dx: number
  dy: number
  textIdx: number
  charIdx: number
  life: number
}

function generateNeuralPattern(messages: string[]): string[][] {
  const grid: string[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ' ')
  )

  if (messages.length === 0) return grid

  const allText = messages.join(' ')
  const branches: Branch[] = []

  // Seed branches from edges
  for (let i = 0; i < 12; i++) {
    const side = Math.floor(Math.random() * 4)
    let x: number, y: number, dx: number, dy: number

    switch (side) {
      case 0: // top
        x = Math.floor(Math.random() * COLS); y = 0; dx = (Math.random() - 0.5) * 0.8; dy = 0.8
        break
      case 1: // bottom
        x = Math.floor(Math.random() * COLS); y = ROWS - 1; dx = (Math.random() - 0.5) * 0.8; dy = -0.8
        break
      case 2: // left
        x = 0; y = Math.floor(Math.random() * ROWS); dx = 0.8; dy = (Math.random() - 0.5) * 0.8
        break
      default: // right
        x = COLS - 1; y = Math.floor(Math.random() * ROWS); dx = -0.8; dy = (Math.random() - 0.5) * 0.8
    }

    branches.push({
      x, y, dx, dy,
      textIdx: Math.floor(Math.random() * messages.length),
      charIdx: Math.floor(Math.random() * allText.length),
      life: 20 + Math.floor(Math.random() * 40),
    })
  }

  // Grow branches
  const newBranches: Branch[] = []

  for (const branch of [...branches]) {
    let { x, y, dx, dy, textIdx, charIdx, life } = branch

    for (let step = 0; step < life; step++) {
      const gx = Math.round(x)
      const gy = Math.round(y)

      if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) break
      if (grid[gy][gx] !== ' ') break

      // Decide character
      if (step === 0) {
        grid[gy][gx] = BRANCH_CHARS[Math.floor(Math.random() * BRANCH_CHARS.length)]
      } else if (Math.random() < 0.4) {
        // Use text from commit messages
        const c = allText[charIdx % allText.length]
        grid[gy][gx] = c === ' ' ? '·' : c
        charIdx++
      } else {
        // Structural character
        const isHorizontal = Math.abs(dx) > Math.abs(dy)
        grid[gy][gx] = isHorizontal ? '─' : '│'
      }

      // Move
      x += dx + (Math.random() - 0.5) * 0.3
      y += dy + (Math.random() - 0.5) * 0.3

      // Fork (18% chance)
      if (step > 3 && Math.random() < 0.18 && newBranches.length < 30) {
        const forkAngle = (Math.random() - 0.5) * 1.5
        const fgx = Math.round(x)
        const fgy = Math.round(y)
        if (fgx >= 0 && fgx < COLS && fgy >= 0 && fgy < ROWS) {
          grid[fgy]?.[fgx] !== undefined && (grid[fgy][fgx] = '├')
        }
        newBranches.push({
          x, y,
          dx: dx * Math.cos(forkAngle) - dy * Math.sin(forkAngle),
          dy: dx * Math.sin(forkAngle) + dy * Math.cos(forkAngle),
          textIdx: (textIdx + 1) % Math.max(messages.length, 1),
          charIdx: charIdx + Math.floor(Math.random() * 10),
          life: 8 + Math.floor(Math.random() * 20),
        })
      }
    }
  }

  // Grow forked branches
  for (const branch of newBranches) {
    let { x, y, dx, dy, charIdx, life } = branch

    for (let step = 0; step < life; step++) {
      const gx = Math.round(x)
      const gy = Math.round(y)

      if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) break
      if (grid[gy][gx] !== ' ') break

      if (Math.random() < 0.5) {
        const c = allText[charIdx % allText.length]
        grid[gy][gx] = c === ' ' ? '·' : c
        charIdx++
      } else {
        grid[gy][gx] = Math.abs(dx) > Math.abs(dy) ? '─' : '│'
      }

      x += dx + (Math.random() - 0.5) * 0.2
      y += dy + (Math.random() - 0.5) * 0.2
    }
  }

  return grid
}

function charOpacity(char: string): string {
  if (BRANCH_CHARS.includes(char) || char === '·') return 'ax-ascii-dim'
  if (char === ' ') return ''
  return Math.random() > 0.6 ? 'ax-ascii-bright' : 'ax-ascii-default'
}

interface Props {
  messages?: string[]
}

export function NeuralBackground({ messages = [] }: Props) {
  const defaultMessages = [
    'fix auth token refresh',
    'add coupon validation tests',
    'refactor price normaliser',
    'implement rollup timeline',
    'harden nightly loop',
    'wire filesystem data layer',
    'build morning briefing',
    'scaffold Tauri desktop app',
  ]

  const input = messages.length > 0 ? messages : defaultMessages

  const rendered = useMemo(() => {
    const grid = generateNeuralPattern(input)
    return grid.map((row) =>
      row.map((char) => {
        if (char === ' ') return char
        const cls = charOpacity(char)
        return `<span class="${cls}">${char.replace(/</g, '&lt;')}</span>`
      }).join('')
    ).join('\n')
  }, [input])

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none select-none ax-neural-bg"
      style={{
        maskImage: 'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 40%, black 90%)',
        WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 40%, black 90%)',
      }}
    >
      <pre
        className="font-mono text-[10px] leading-[14px] whitespace-pre m-0 p-4"
        style={{ color: 'var(--ax-text-ghost)' }}
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
    </div>
  )
}
