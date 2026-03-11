import type { RollupEpisode, EnergyLevel } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { renderInlineFormatting } from '@/components/shared/InlineMarkdown'

function EnergyDots({ energy }: { energy?: EnergyLevel }) {
  if (!energy) return null
  const filled = energy === 'low' ? 1 : energy === 'medium' ? 2 : 3
  const colorMap = {
    low: 'bg-ax-energy-low',
    medium: 'bg-ax-energy-medium',
    high: 'bg-ax-energy-high',
  }
  return (
    <div className="flex gap-[3px] items-center">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`w-[5px] h-[5px] rounded-full ${
            i < filled ? colorMap[energy] : 'bg-ax-border'
          }`}
        />
      ))}
    </div>
  )
}

function Metrics({ frontmatter }: { frontmatter: RollupEpisode['frontmatter'] }) {
  const items: string[] = []
  if (frontmatter.commits != null) items.push(`${frontmatter.commits} commits`)
  if (frontmatter.decisions != null) items.push(`${frontmatter.decisions} decisions`)
  if (frontmatter.openLoops != null) items.push(`${frontmatter.openLoops} open`)
  if (items.length === 0) return null

  return (
    <div className="font-mono text-small text-ax-text-secondary">
      {items.map((item, i) => (
        <span key={item}>
          {i > 0 && <span className="mx-2 opacity-40">&middot;</span>}
          {item}
        </span>
      ))}
    </div>
  )
}

export function RollupCard({ rollup, index, onClick }: { rollup: RollupEpisode; index: number; onClick?: () => void }) {
  const { frontmatter, summary } = rollup

  return (
    <article
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } }}
      tabIndex={0}
      role="button"
      aria-label={`${frontmatter.headline || 'Rollup'} — ${formatDate(frontmatter.date)}`}
      className="animate-fade-in-up bg-ax-elevated rounded-xl border border-ax-border p-6
        cursor-pointer group
        shadow-[0_1px_3px_rgba(var(--ax-shadow-color),0.04)]
        transition-all duration-200
        hover:-translate-y-0.5
        hover:border-l-[3px] hover:border-l-ax-brand
        hover:shadow-[0_8px_30px_rgba(var(--ax-shadow-color),0.1)]
        focus:outline-none focus-visible:ring-2 focus-visible:ring-ax-brand focus-visible:ring-offset-2 focus-visible:ring-offset-ax-base"
      style={{ animationDelay: `${Math.min(index, 5) * 60}ms` }}
    >
      {/* Date + Energy */}
      <div className="flex items-center justify-between mb-3">
        <time className="font-mono text-small text-ax-text-tertiary tracking-wide">
          {formatDate(frontmatter.date)}
        </time>
        <EnergyDots energy={frontmatter.energy} />
      </div>

      {/* Headline */}
      <h2 className="font-serif text-h3 text-ax-text-primary mb-3 group-hover:text-ax-brand transition-colors duration-200">
        {frontmatter.headline || (frontmatter.type === 'genesis' ? 'Genesis Rollup' : 'Daily Rollup')}
      </h2>

      {/* Tags */}
      {frontmatter.tags && frontmatter.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {frontmatter.tags.map((tag) => (
            <span key={tag} className="font-mono text-micro px-2 py-0.5 rounded-full
              bg-ax-sunken text-ax-text-primary/70">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-ax-border-subtle my-4" />

      {/* Summary */}
      {summary && (
        <p className="text-body text-ax-text-secondary leading-relaxed line-clamp-3 mb-4">
          {renderInlineFormatting(summary)}
        </p>
      )}

      {/* Metrics */}
      <Metrics frontmatter={frontmatter} />
    </article>
  )
}
