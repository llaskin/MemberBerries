import { useUIStore } from '@/store/uiStore'
import { useProjectStore } from '@/store/projectStore'
import { useRollups } from '@/hooks/useRollups'
import { parseDecisionTraces } from '@/lib/parser'
import { formatDate } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'
import type { RollupEpisode } from '@/lib/types'

function DecisionCard({ dt }: { dt: { id: string; title: string; input: string; constraint: string; tradeoff: string; decision: string } }) {
  return (
    <div className="bg-ax-elevated rounded-xl border border-ax-border p-5 animate-fade-in-up">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="font-mono text-micro text-ax-brand font-medium px-1.5 py-0.5 bg-ax-brand-subtle rounded">
          {dt.id}
        </span>
        <h3 className="font-serif text-h4 text-ax-text-primary">{dt.title}</h3>
      </div>
      <div className="space-y-2 text-body text-ax-text-secondary">
        {dt.input && (
          <div>
            <span className="font-mono text-micro text-ax-text-tertiary uppercase tracking-wider">Input</span>
            <p className="mt-0.5 leading-relaxed">{dt.input}</p>
          </div>
        )}
        {dt.constraint && (
          <div>
            <span className="font-mono text-micro text-ax-text-tertiary uppercase tracking-wider">Constraint</span>
            <p className="mt-0.5 leading-relaxed">{dt.constraint}</p>
          </div>
        )}
        {dt.tradeoff && (
          <div>
            <span className="font-mono text-micro text-ax-text-tertiary uppercase tracking-wider">Tradeoff</span>
            <p className="mt-0.5 leading-relaxed">{dt.tradeoff}</p>
          </div>
        )}
        {dt.decision && (
          <div>
            <span className="font-mono text-micro text-ax-brand uppercase tracking-wider font-medium">Decision</span>
            <p className="mt-0.5 leading-relaxed font-medium text-ax-text-primary">{dt.decision}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function RollupBody({ body }: { body: string }) {
  // Render markdown sections as simple structured blocks
  const sections = body.split(/\n(?=##\s)/).filter(s => s.trim())

  return (
    <div className="space-y-6">
      {sections.map((section, i) => {
        const lines = section.split('\n')
        const heading = lines[0]?.replace(/^#+\s*/, '')
        const content = lines.slice(1).join('\n').trim()

        // Skip decision trace sections — they're rendered as cards
        if (heading?.toLowerCase().includes('decision')) return null

        if (!content) return null

        return (
          <div key={i} className="animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
            {heading && (
              <h3 className="font-serif text-h4 text-ax-text-primary mb-2">{heading}</h3>
            )}
            <div className="text-body text-ax-text-secondary leading-relaxed whitespace-pre-wrap">
              {content.split('\n').map((line, j) => {
                // Render bullet points
                if (line.match(/^\s*[-*]\s/)) {
                  const text = line.replace(/^\s*[-*]\s/, '')
                  return (
                    <div key={j} className="flex gap-2 mb-1">
                      <span className="text-ax-text-tertiary shrink-0 mt-0.5">&bull;</span>
                      <span>{renderInlineFormatting(text)}</span>
                    </div>
                  )
                }
                // Render checkboxes
                if (line.match(/^\s*-\s*\[[ x>]\]/)) {
                  const checked = line.includes('[x]')
                  const text = line.replace(/^\s*-\s*\[[ x>]\]\s*/, '')
                  return (
                    <div key={j} className="flex gap-2 mb-1">
                      <span className={`shrink-0 mt-0.5 ${checked ? 'text-ax-success' : 'text-ax-text-tertiary'}`}>
                        {checked ? '✓' : '○'}
                      </span>
                      <span className={checked ? 'line-through text-ax-text-tertiary' : ''}>{renderInlineFormatting(text)}</span>
                    </div>
                  )
                }
                // Tables
                if (line.includes('|') && !line.match(/^\s*\|?\s*-+/)) {
                  const cells = line.split('|').filter(c => c.trim())
                  if (cells.length > 0) {
                    return (
                      <div key={j} className="flex gap-4 font-mono text-small py-1 border-b border-ax-border-subtle">
                        {cells.map((cell, k) => (
                          <span key={k} className={k === 0 ? 'w-32 shrink-0 text-ax-text-tertiary' : 'flex-1'}>
                            {renderInlineFormatting(cell.trim())}
                          </span>
                        ))}
                      </div>
                    )
                  }
                }
                // Skip table separator lines
                if (line.match(/^\s*\|?\s*-+/)) return null
                // Regular text
                if (line.trim()) {
                  return <p key={j} className="mb-1">{renderInlineFormatting(line)}</p>
                }
                return <div key={j} className="h-2" />
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function renderInlineFormatting(text: string) {
  // Bold
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-ax-text-primary font-medium">{part.slice(2, -2)}</strong>
    }
    // Inline code
    const codeParts = part.split(/(`[^`]+`)/)
    return codeParts.map((cp, j) => {
      if (cp.startsWith('`') && cp.endsWith('`')) {
        return <code key={`${i}-${j}`} className="font-mono text-small bg-ax-sunken px-1.5 py-0.5 rounded">{cp.slice(1, -1)}</code>
      }
      return <span key={`${i}-${j}`}>{cp}</span>
    })
  })
}

function RollupHeader({ rollup }: { rollup: RollupEpisode }) {
  const goBack = useUIStore((s) => s.goBack)
  const { frontmatter } = rollup

  return (
    <header className="mb-8">
      <button
        onClick={goBack}
        className="flex items-center gap-1.5 text-small text-ax-text-tertiary hover:text-ax-brand
          transition-colors duration-150 mb-6 group"
      >
        <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
        <span>Timeline</span>
      </button>

      <time className="font-mono text-small text-ax-text-tertiary tracking-wide block mb-2">
        {formatDate(frontmatter.date)}
      </time>

      <h1 className="font-serif italic text-h1 text-ax-text-primary tracking-tight mb-3">
        {frontmatter.headline || (frontmatter.type === 'genesis' ? 'Genesis Rollup' : 'Daily Rollup')}
      </h1>

      {frontmatter.tags && frontmatter.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {frontmatter.tags.map(tag => (
            <span key={tag} className="font-mono text-micro px-2 py-0.5 rounded-full bg-ax-sunken text-ax-text-primary/70">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-6 font-mono text-small text-ax-text-secondary">
        {frontmatter.commits != null && <span>{frontmatter.commits} commits</span>}
        {frontmatter.decisions != null && <span>{frontmatter.decisions} decisions</span>}
        {frontmatter.openLoops != null && <span>{frontmatter.openLoops} open loops</span>}
        {frontmatter.energy && <span>Energy: {frontmatter.energy}</span>}
      </div>
    </header>
  )
}

export function RollupDetailView() {
  const selectedRollup = useUIStore((s) => s.selectedRollup)
  const goBack = useUIStore((s) => s.goBack)
  const activeProject = useProjectStore((s) => s.activeProject)
  const { rollups, loading } = useRollups(activeProject)

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-4 bg-ax-sunken rounded w-16" />
        <div className="h-8 bg-ax-sunken rounded w-3/4" />
        <div className="h-4 bg-ax-sunken rounded w-1/2" />
        <div className="h-64 bg-ax-sunken rounded" />
      </div>
    )
  }

  const rollup = rollups.find(r => r.filename === selectedRollup)

  if (!rollup) {
    return (
      <div className="text-center py-20">
        <p className="font-serif italic text-h3 text-ax-text-tertiary mb-4">Rollup not found</p>
        <button onClick={goBack} className="text-ax-brand hover:text-ax-brand-hover text-body transition-colors">
          Back to timeline
        </button>
      </div>
    )
  }

  const decisions = parseDecisionTraces(rollup.body)

  return (
    <div>
      <RollupHeader rollup={rollup} />

      <div className="border-t border-ax-border my-6" />

      {/* Decision Traces */}
      {decisions.length > 0 && (
        <section className="mb-8">
          <h2 className="font-serif text-h3 text-ax-text-primary mb-4">
            Decision Traces
            <span className="font-mono text-micro text-ax-text-tertiary ml-2">{decisions.length}</span>
          </h2>
          <div className="space-y-3">
            {decisions.map((dt) => (
              <DecisionCard key={dt.id} dt={dt} />
            ))}
          </div>
        </section>
      )}

      {/* Full Rollup Body */}
      <section>
        <RollupBody body={rollup.body} />
      </section>
    </div>
  )
}
