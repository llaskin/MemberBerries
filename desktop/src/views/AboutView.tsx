import { useState, useEffect } from 'react'
import { ExternalLink, ArrowLeft } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'

const REPO_URL = 'https://github.com/llaskin/MemberBerries'

function GitHubIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  )
}

function XIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  )
}

function LinkedInIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  )
}

function useReadme() {
  const [readme, setReadme] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('https://api.github.com/repos/llaskin/MemberBerries/readme', {
      headers: { Accept: 'application/vnd.github.v3.html' },
    })
      .then(r => r.ok ? r.text() : null)
      .then(html => {
        if (html) {
          html = html.replace(
            /src="(docs\/[^"]+)"/g,
            'src="https://raw.githubusercontent.com/llaskin/MemberBerries/main/$1"'
          )
        }
        setReadme(html)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return { readme, loading }
}

export function AboutView() {
  const goBack = useUIStore(s => s.goBack)
  const { readme, loading } = useReadme()

  return (
    <div>
      <button
        onClick={goBack}
        className="flex items-center gap-1.5 text-small text-ax-text-tertiary hover:text-ax-text-secondary transition-colors mb-4"
      >
        <ArrowLeft size={14} />
        Back
      </button>

      <header className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <img src="/memberberries-icon.png" alt="" className="w-10 h-10 rounded" />
          <h1 className="font-serif italic text-display text-ax-text-primary tracking-tight">
            MemberBerries
          </h1>
        </div>
        <p className="text-body text-ax-text-secondary">
          Remember your sessions — local-first AI agent activity tracker
        </p>
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <a
            href="https://github.com/llaskin"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 font-mono text-micro text-ax-text-tertiary hover:text-ax-text-secondary transition-colors"
          >
            <GitHubIcon size={14} />
            @llaskin
            <ExternalLink size={10} />
          </a>
          <a
            href="https://x.com/leolaskin"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 font-mono text-micro text-ax-text-tertiary hover:text-ax-text-secondary transition-colors"
          >
            <XIcon />
            @leolaskin
            <ExternalLink size={10} />
          </a>
          <a
            href="https://www.linkedin.com/in/llaskin/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 font-mono text-micro text-ax-text-tertiary hover:text-ax-text-secondary transition-colors"
          >
            <LinkedInIcon />
            llaskin
            <ExternalLink size={10} />
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 font-mono text-micro text-ax-text-tertiary hover:text-ax-text-secondary transition-colors"
          >
            <GitHubIcon size={14} />
            MemberBerries
            <ExternalLink size={10} />
          </a>
        </div>
      </header>

      {/* Repo card */}
      <div className="bg-ax-elevated rounded-xl border border-ax-border p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 rounded-xl bg-ax-sunken text-ax-text-primary">
            <GitHubIcon size={28} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-mono text-body text-ax-text-primary font-medium">llaskin/MemberBerries</h3>
            <p className="text-small text-ax-text-tertiary mt-0.5">Local-first dashboard for tracking AI coding agent activity</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 font-mono text-micro px-4 py-2 rounded-lg bg-[#24292f] text-white hover:opacity-90 transition-opacity"
          >
            <GitHubIcon size={14} />
            View on GitHub
            <ExternalLink size={11} />
          </a>
          <a
            href={`${REPO_URL}/issues`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 font-mono text-micro px-4 py-2 rounded-lg border border-ax-border text-ax-text-secondary hover:bg-ax-sunken transition-colors"
          >
            Issues
            <ExternalLink size={11} />
          </a>
        </div>
      </div>

      {/* README */}
      <div className="bg-ax-elevated rounded-xl border border-ax-border overflow-hidden">
        <div className="px-5 py-3 border-b border-ax-border-subtle flex items-center gap-2">
          <span className="font-mono text-micro uppercase tracking-widest text-ax-text-tertiary">README.md</span>
        </div>
        <div className="px-6 py-5">
          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-6 bg-ax-sunken rounded w-2/3" />
              <div className="h-4 bg-ax-sunken rounded w-full" />
              <div className="h-4 bg-ax-sunken rounded w-5/6" />
            </div>
          ) : readme ? (
            <div
              className="readme-prose"
              dangerouslySetInnerHTML={{ __html: readme }}
            />
          ) : (
            <p className="text-small text-ax-text-tertiary italic">
              Could not load README.{' '}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-ax-brand hover:underline">
                View on GitHub
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
