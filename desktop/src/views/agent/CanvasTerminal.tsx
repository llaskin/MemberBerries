import { useEffect, useRef, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useTerminalStore } from '@/store/terminalStore'

function resolveTerminalTheme(): Record<string, string> {
  const s = getComputedStyle(document.documentElement)
  const get = (prop: string, fallback: string) =>
    s.getPropertyValue(prop).trim() || fallback
  return {
    background: get('--ax-bg-sunken', '#1a1915'),
    foreground: get('--ax-text-primary', '#e8e4dc'),
    cursor: get('--ax-brand-primary', '#C8956C'),
    cursorAccent: get('--ax-bg-sunken', '#1a1915'),
    selectionBackground: 'rgba(200, 149, 108, 0.3)',
    black: get('--ax-bg-sunken', '#1a1915'),
    red: get('--ax-error', '#B85450'),
    green: get('--ax-success', '#7B9E7B'),
    yellow: get('--ax-warning', '#C4933B'),
    blue: get('--ax-info', '#6B8FAD'),
    magenta: '#b87fd9',
    cyan: '#5cc8c8',
    white: get('--ax-text-primary', '#e8e4dc'),
    brightBlack: get('--ax-text-ghost', '#6b6560'),
    brightRed: '#d4706c',
    brightGreen: '#93b893',
    brightYellow: '#d4a84d',
    brightBlue: '#85a9c3',
    brightMagenta: '#c993e8',
    brightCyan: '#6bd9d9',
    brightWhite: '#ffffff',
  }
}

interface CanvasTerminalProps {
  terminalId: string
  width: number
  height: number
}

export function CanvasTerminal({ terminalId, width, height }: CanvasTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  const store = useTerminalStore
  const status = useTerminalStore(s => s.terminals[terminalId]?.status)

  // Initialize xterm
  useEffect(() => {
    if (!containerRef.current || xtermRef.current) return

    const term = new XTerm({
      fontFamily: "'Berkeley Mono', 'SF Mono', 'JetBrains Mono', Menlo, monospace",
      fontSize: 11,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'bar' as const,
      theme: resolveTerminalTheme(),
      smoothScrollDuration: 100,

      scrollSensitivity: 3,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)

    fitAddon.fit()
    setTimeout(() => fitAddon.fit(), 50)

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    // Attach data listener to global store
    const listener = (data: string) => term.write(data)
    store.getState().attach(terminalId, listener)

    return () => {
      store.getState().detach(terminalId, listener)
      term.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [terminalId, store])

  // Wire xterm input → store when connected
  useEffect(() => {
    const term = xtermRef.current
    if (!term || status !== 'connected') return
    const disposable = term.onData((data) => store.getState().sendInput(terminalId, data))
    return () => disposable.dispose()
  }, [terminalId, status, store])

  // Re-fit when dimensions change
  const fit = useCallback(() => {
    if (fitAddonRef.current && containerRef.current?.offsetHeight) {
      try {
        fitAddonRef.current.fit()
        const dims = fitAddonRef.current.proposeDimensions()
        if (dims) store.getState().sendResize(terminalId, dims.cols, dims.rows)
      } catch { /* not visible */ }
    }
  }, [terminalId, store])

  useEffect(() => {
    fit()
  }, [width, height, fit])

  // ResizeObserver for when the tile is resized
  useEffect(() => {
    let raf: number
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(fit)
    })
    if (containerRef.current) observer.observe(containerRef.current)
    return () => { cancelAnimationFrame(raf); observer.disconnect() }
  }, [fit])

  // Theme sync
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (xtermRef.current) xtermRef.current.options.theme = resolveTerminalTheme()
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  // Re-fit when carousel slides this view back into visibility.
  // ResizeObserver won't fire because the container size doesn't change
  // (it's just translated off-screen), so we listen for a custom event.
  useEffect(() => {
    const refit = () => {
      requestAnimationFrame(() => {
        fit()
        xtermRef.current?.scrollToBottom()
      })
    }
    window.addEventListener('terminal-refit', refit)
    return () => window.removeEventListener('terminal-refit', refit)
  }, [fit])

  // Stop wheel events from escaping to canvas zoom (native listener needed
  // because the canvas uses native addEventListener, not React onWheel)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const stop = (e: WheelEvent) => e.stopPropagation()
    el.addEventListener('wheel', stop, { passive: true })
    return () => el.removeEventListener('wheel', stop)
  }, [])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ padding: '4px' }}
      onMouseDown={(e) => e.stopPropagation()}
    />
  )
}
