import { AlertTriangle, X, ExternalLink } from 'lucide-react'
import { useErrorStore, buildIssueUrl } from '@/store/errorStore'

export function ErrorToast() {
  const toast = useErrorStore(s => s.toast)
  const dismiss = useErrorStore(s => s.dismissToast)

  if (!toast) return null

  const issueUrl = buildIssueUrl(toast)

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-[100] sm:max-w-sm animate-fade-in-up"
    >
      <div className="bg-ax-elevated rounded-xl border border-[var(--ax-error)]/30 shadow-[0_8px_30px_rgba(0,0,0,0.2)] overflow-hidden">
        <div className="flex items-start gap-3 px-4 py-3">
          <AlertTriangle size={16} className="text-[var(--ax-error)] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-ax-text-primary font-medium leading-snug">{toast.message}</p>
            {toast.detail && (
              <p className="text-[10px] font-mono text-ax-text-tertiary mt-1 truncate">{toast.detail}</p>
            )}
            <div className="flex items-center gap-3 mt-2">
              <span className="font-mono text-[9px] text-ax-text-ghost uppercase tracking-wider">{toast.source}</span>
              <a
                href={issueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-mono text-[9px] text-ax-brand hover:underline"
              >
                Report issue <ExternalLink size={8} />
              </a>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="text-ax-text-ghost hover:text-ax-text-secondary transition-colors shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2 -mt-1"
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
