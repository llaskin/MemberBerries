import { useUIStore } from '@/store/uiStore'
import { Sun, Moon } from 'lucide-react'

export function SettingsView() {
  const { theme, toggleTheme } = useUIStore()

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-serif italic text-h2 text-ax-text-primary">Settings</h1>
        <p className="text-body text-ax-text-secondary mt-2">MemberBerries configuration</p>
      </header>

      {/* Theme */}
      <div className="bg-ax-elevated rounded-xl border border-ax-border p-5 mb-4">
        <h3 className="font-mono text-micro text-ax-text-tertiary uppercase tracking-wider mb-3">Appearance</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-body text-ax-text-primary">Theme</p>
            <p className="text-small text-ax-text-secondary">Switch between light and dark mode</p>
          </div>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-ax-sunken hover:bg-ax-base transition-colors
              border border-ax-border-subtle text-ax-text-primary font-mono text-small"
          >
            {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
            {theme === 'dark' ? 'Dark' : 'Light'}
          </button>
        </div>
      </div>

      {/* About */}
      <div className="bg-ax-elevated rounded-xl border border-ax-border p-5">
        <h3 className="font-mono text-micro text-ax-text-tertiary uppercase tracking-wider mb-3">About</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-small text-ax-text-secondary">Version</span>
            <span className="font-mono text-small text-ax-text-primary">0.2.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-small text-ax-text-secondary">Data Location</span>
            <span className="font-mono text-small text-ax-text-primary">~/.memberberries/sessions.db</span>
          </div>
          <div className="flex justify-between">
            <span className="text-small text-ax-text-secondary">Source</span>
            <a
              href="https://github.com/llaskin/MemberBerries"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-small text-ax-brand hover:underline"
            >
              github.com/llaskin/MemberBerries
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
