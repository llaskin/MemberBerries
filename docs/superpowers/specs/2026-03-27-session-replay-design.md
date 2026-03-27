# Session Replay Design

**Date:** 2026-03-27
**Status:** Approved

## Overview

Add a session replay feature to MemberBerries that lets users rewatch past AI coding sessions. Inspired by [tesslio/demo-claude-usage-replay](https://github.com/tesslio/demo-claude-usage-replay), which uses the same JSONL format MemberBerries already parses.

Replay opens as a **slide-in side panel** alongside the sessions list. Text streams character-by-character, tool calls appear inline, and playback is controlled via play/pause/scrub/speed buttons — like a VCR for your coding sessions.

---

## Decisions

| Question | Decision |
|---|---|
| Where does the player live? | Slide-in side panel (sessions list stays visible) |
| Playback style | Animated streaming — text types out, real inter-message timing |
| Agent scope | All agents — Claude gets full animated replay, others get 3s-delay step-through |
| Trigger points | Hover button on session card + button in expanded detail panel |
| Architecture | On-demand JSONL parse (no DB schema changes) |
| Long sessions / breaks | Real timestamps, inter-message gaps capped at 5 seconds |

---

## Architecture

Three new pieces, all building on existing infrastructure. No changes to the SQLite schema.

### 1. `/api/mb/sessions/:id/transcript` (new API endpoint)

Added to `axonMiddleware.ts`. On request:
- Reads the JSONL file for the session from `~/.claude/projects/.../sessionId.jsonl`
- Parses into a normalized `ParsedMessage[]` array
- Applies `redact.ts` to all text content
- Strips `pastedContents` from all messages
- Returns `{ messages: ParsedMessage[], agentType: string, sessionMeta: object }`

For non-Claude agents (Codex, Cursor, Copilot): returns whatever structured data is available from their respective storage formats.

### 2. `usePlayback` hook (`desktop/src/hooks/usePlayback.ts`)

Ported and adapted from the demo. Accepts `messages[]` and drives all playback state:

- `currentIndex` — which message is "now"
- `streamProgress` — 0–1 float for character-level reveal of the current assistant message (~50 chars/sec)
- Inter-message timing uses real timestamps from the JSONL, with gaps capped at **5 seconds max**
- For non-Claude agents (no timestamps): fixed **3-second delay** between each message
- Exposes: `play()`, `pause()`, `seek(index)`, `setSpeed(n)`, `visibleMessages`, `isPlaying`, `elapsed`, `total`

### 3. `ReplayPanel` component (`desktop/src/components/ReplayPanel/`)

Slide-in right panel. Visibility managed by `uiStore.activeReplayId`. Contains:

- **`ReplayTranscript`** — scrollable message area, renders `visibleMessages`. User messages: `> text` with blue left border. Assistant messages: text blocks (with streaming reveal), thinking blocks (collapsed by default, expandable), tool call blocks inline. Auto-scrolls to bottom as content appears.
- **`ToolCallBlock`** — renders `⏺ ToolName(arg)` with result summary. Edit calls show a collapsed diff (expandable). Yellow = success, red = error.
- **`ReplayControls`** — bottom bar with: scrubber (click to seek), ⏮ / ⏸▶ / ⏭ buttons, elapsed/total time, speed buttons (1× / 2× / 4×). Keyboard shortcuts: `Space` play/pause, `←`/`→` skip one message (active only when panel is open).

---

## Data Flow

```
User hovers session card → "Replay" button appears
User clicks "Replay"
→ uiStore.openReplay(sessionId)
→ ReplayPanel slides in (CSS transition)
→ fetches GET /api/mb/sessions/:id/transcript
    → server reads JSONL from ~/.claude/projects/.../sessionId.jsonl
    → parses + normalizes messages
    → applies redact.ts to all text
    → strips pastedContents
    → returns { messages[], agentType, sessionMeta }
→ usePlayback receives messages[], starts paused
→ user presses ▶
→ rAF loop streams text at ~50 chars/sec
→ inter-message gaps: real timestamps capped at 5s (Claude) or fixed 3s (others)
→ ReplayTranscript renders visibleMessages, auto-scrolls
→ user can scrub, change speed, or close panel
→ close → uiStore.activeReplayId = null → panel slides out
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| JSONL file missing / unreadable | Inline error state in panel: "Session file not found" |
| Large session (100+ msgs, multi-MB) | Loading spinner shown if parse takes >2s |
| Empty JSONL / zero messages | Panel shows "Nothing to replay" with session metadata |
| Non-Claude agent with no parseable data | Shows session metadata + note that transcript isn't available |
| User switches project while panel is open | `uiStore` clears `activeReplayId`, panel closes |
| Keyboard shortcuts (`Space`, `←`, `→`) | Only fire when replay panel is open, no conflict with rest of app |

---

## Files Affected

**New files:**
- `desktop/src/hooks/usePlayback.ts`
- `desktop/src/components/ReplayPanel/index.tsx`
- `desktop/src/components/ReplayPanel/ReplayTranscript.tsx`
- `desktop/src/components/ReplayPanel/ToolCallBlock.tsx`
- `desktop/src/components/ReplayPanel/ReplayControls.tsx`

**Modified files:**
- `desktop/src/server/axonMiddleware.ts` — add `/api/mb/sessions/:id/transcript` endpoint
- `desktop/src/store/uiStore.ts` — add `activeReplayId` state + `openReplay`/`closeReplay` actions
- `desktop/src/views/SessionsView.tsx` — add "Replay" hover button on session cards + in expanded detail panel, render `ReplayPanel`

---

## Non-Goals

- No changes to the SQLite schema or indexer
- No server-side caching (can be added later if cold-start latency is noticeable)
- No timeline scrubbing tied to file diffs or git history
- No recording or export of replays
