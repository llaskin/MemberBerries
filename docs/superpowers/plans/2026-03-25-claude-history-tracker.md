# Claude History Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt Axon to track daily Claude Code session activity with redaction, three view modes (day/session/project), prompt timeline drill-down, and a session-to-rollup bridge dendrite.

**Architecture:** Build on existing session infrastructure (sessionDb, sessionIndexer, SessionsView). Add a redaction module, prompt timeline parser, two new API endpoints, view mode tabs in SessionsView, a TypeScript dendrite for the rollup pipeline, and an adapted rollup prompt. All data stays local; only redacted text reaches the Anthropic API during rollups.

**Tech Stack:** TypeScript, React 19, Zustand, better-sqlite3, Express 5, Vitest, bash (CLI scripts)

**Spec:** `docs/superpowers/specs/2026-03-25-claude-history-tracker-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `desktop/src/lib/redact.ts` | Regex-based secret redaction module |
| `desktop/src/lib/redact.test.ts` | Unit tests for all redaction patterns |
| `desktop/src/lib/promptTimeline.ts` | Parse history.jsonl, cache by sessionId, apply redaction |
| `desktop/src/lib/promptTimeline.test.ts` | Unit tests for parser edge cases |
| `cli/lib/session-dendrite.ts` | TypeScript dendrite: query SQLite + history.jsonl, output markdown |
| `docs/data-flow-diagram.md` | Data flow diagram deliverable |

### Modified Files
| File | What Changes |
|------|-------------|
| `desktop/src/server/axonMiddleware.ts` | Add `GET /sessions/:id/prompts` and `GET /sessions/by-project` endpoints |
| `desktop/src/views/SessionsView.tsx` | Add mode tabs (day/sessions/projects), Day grouping, Project grouping, prompt timeline in detail panel, related sessions |
| `desktop/src/hooks/useSessions.ts` | Add `usePromptTimeline` and `useSessionsByProject` hooks |
| `cli/axon-collect` | Add `claude-sessions` dendrite type block |
| `cli/axon-rollup` | Add per-workspace `allowed_tools` config check, session-oriented rollup prompt |

---

### Task 1: Redaction Module

**Files:**
- Create: `desktop/src/lib/redact.ts`
- Create: `desktop/src/lib/redact.test.ts`

- [ ] **Step 1: Write failing tests for redaction patterns**

```typescript
// desktop/src/lib/redact.test.ts
import { describe, it, expect } from 'vitest';
import { redactText } from './redact';

describe('redactText', () => {
  // API keys
  it('redacts Anthropic API keys', () => {
    expect(redactText('key is sk-ant-api03-abc123def456')).toBe('key is [REDACTED_API_KEY]');
  });
  it('redacts sk-proj keys', () => {
    expect(redactText('sk-proj-abcdef123456')).toBe('[REDACTED_API_KEY]');
  });

  // GitHub tokens
  it('redacts ghp_ tokens', () => {
    expect(redactText('ghp_1234567890abcdef1234567890abcdef12345678')).toBe('[REDACTED_GITHUB_TOKEN]');
  });
  it('redacts github_pat_ tokens', () => {
    expect(redactText('github_pat_abcDEF123_xyz')).toBe('[REDACTED_GITHUB_TOKEN]');
  });
  it('redacts gho_ tokens', () => {
    expect(redactText('gho_abc123def456')).toBe('[REDACTED_GITHUB_TOKEN]');
  });

  // Slack tokens
  it('redacts xoxb tokens', () => {
    expect(redactText('xoxb-123-456-abc')).toBe('[REDACTED_SLACK_TOKEN]');
  });
  it('redacts xoxp tokens', () => {
    expect(redactText('xoxp-123-456-abc')).toBe('[REDACTED_SLACK_TOKEN]');
  });

  // Bearer / Auth
  it('redacts Bearer tokens', () => {
    expect(redactText('Authorization: Bearer eyJhbGciOiJIUz.payload.sig')).toBe('Authorization: [REDACTED_AUTH]');
  });

  // JWTs
  it('redacts standalone JWTs', () => {
    expect(redactText('token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'))
      .toBe('token [REDACTED_JWT]');
  });

  // AWS keys
  it('redacts AWS access keys', () => {
    expect(redactText('AKIAIOSFODNN7EXAMPLE')).toBe('[REDACTED_AWS_KEY]');
  });

  // Connection strings
  it('redacts postgres connection strings', () => {
    expect(redactText('postgres://admin:s3cret@db.host:5432/mydb')).toBe('[REDACTED_CONNECTION_STRING]');
  });
  it('redacts mongodb+srv connection strings', () => {
    expect(redactText('mongodb+srv://user:pass@cluster.mongodb.net/db')).toBe('[REDACTED_CONNECTION_STRING]');
  });

  // Generic secrets
  it('redacts password= values', () => {
    expect(redactText('password=supersecret123')).toBe('password=[REDACTED_SECRET]');
  });
  it('redacts secret= values', () => {
    expect(redactText('secret=abc123')).toBe('secret=[REDACTED_SECRET]');
  });
  it('redacts token= values in URLs', () => {
    expect(redactText('https://api.example.com?token=abc123')).toBe('https://api.example.com?token=[REDACTED_SECRET]');
  });

  // Private keys
  it('redacts private key blocks', () => {
    const key = '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----';
    expect(redactText(key)).toBe('[REDACTED_PRIVATE_KEY]');
  });

  // .env patterns
  it('redacts KEY=value .env lines', () => {
    expect(redactText('AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')).toBe('AWS_SECRET_ACCESS_KEY=[REDACTED_ENV]');
  });

  // Should NOT redact
  it('does not redact normal URLs', () => {
    const url = 'https://github.com/user/repo';
    expect(redactText(url)).toBe(url);
  });
  it('does not redact customer names', () => {
    expect(redactText('working on Cyera POV')).toBe('working on Cyera POV');
  });
  it('does not redact project paths', () => {
    const path = '/Users/Tessl-Leo/Development/axon';
    expect(redactText(path)).toBe(path);
  });
  it('handles empty string', () => {
    expect(redactText('')).toBe('');
  });
  it('handles null/undefined gracefully', () => {
    expect(redactText(null as any)).toBe('');
    expect(redactText(undefined as any)).toBe('');
  });

  // Custom patterns
  it('applies custom regex patterns', () => {
    expect(redactText('TESSL_KEY_abc123', ['TESSL_KEY_\\w+'])).toBe('[REDACTED]');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/Tessl-Leo/Development/axon/desktop && npx vitest run src/lib/redact.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement redaction module**

```typescript
// desktop/src/lib/redact.ts

interface RedactionRule {
  pattern: RegExp;
  replacement: string;
}

const RULES: RedactionRule[] = [
  // Private keys (multiline — must be before single-line patterns)
  { pattern: /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g, replacement: '[REDACTED_PRIVATE_KEY]' },

  // Bearer / Authorization headers (must be before JWT to catch "Bearer eyJ...")
  { pattern: /\b(Authorization:\s*)(Bearer\s+\S+|Basic\s+\S+)/gi, replacement: '$1[REDACTED_AUTH]' },

  // Anthropic API keys
  { pattern: /\bsk-ant-[a-zA-Z0-9_-]+/g, replacement: '[REDACTED_API_KEY]' },
  { pattern: /\bsk-proj-[a-zA-Z0-9_-]+/g, replacement: '[REDACTED_API_KEY]' },

  // GitHub tokens
  { pattern: /\bghp_[a-zA-Z0-9]{36,}/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { pattern: /\bgho_[a-zA-Z0-9]+/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { pattern: /\bgithub_pat_[a-zA-Z0-9_]+/g, replacement: '[REDACTED_GITHUB_TOKEN]' },

  // Slack tokens
  { pattern: /\bxox[bp]-[a-zA-Z0-9-]+/g, replacement: '[REDACTED_SLACK_TOKEN]' },

  // AWS access keys (AKIA followed by 16 alphanumeric chars)
  { pattern: /\bAKIA[A-Z0-9]{16}\b/g, replacement: '[REDACTED_AWS_KEY]' },

  // JWTs (three base64url segments separated by dots)
  { pattern: /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+/g, replacement: '[REDACTED_JWT]' },

  // Connection strings (postgres://, mongodb+srv://, mysql://, redis://)
  { pattern: /\b(postgres|postgresql|mongodb\+srv|mongodb|mysql|redis):\/\/[^\s'"]+/gi, replacement: '[REDACTED_CONNECTION_STRING]' },

  // .env style secrets (UPPER_CASE_KEY=value, at least one underscore to avoid false positives)
  { pattern: /\b([A-Z][A-Z0-9]*_[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASS|CREDENTIAL|AUTH)[A-Z0-9_]*)=\S+/g, replacement: '$1=[REDACTED_ENV]' },

  // Generic key=value secrets
  { pattern: /\b(password|secret|token|api_key|apikey|access_token|client_secret)=\S+/gi, replacement: '$1=[REDACTED_SECRET]' },
];

/**
 * Redact sensitive patterns from text.
 * Compiled regexes are reused across calls (module-level RULES array).
 * @param text Input text to redact
 * @param extraPatterns Additional regex strings from config
 * @returns Redacted text
 */
export function redactText(text: string | null | undefined, extraPatterns?: string[]): string {
  if (!text) return '';

  let result = text;

  for (const rule of RULES) {
    // Reset lastIndex for global regexes
    rule.pattern.lastIndex = 0;
    result = result.replace(rule.pattern, rule.replacement);
  }

  if (extraPatterns) {
    for (const pat of extraPatterns) {
      result = result.replace(new RegExp(pat, 'g'), '[REDACTED]');
    }
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/Tessl-Leo/Development/axon/desktop && npx vitest run src/lib/redact.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/Tessl-Leo/Development/axon
git add desktop/src/lib/redact.ts desktop/src/lib/redact.test.ts
git commit -m "feat: add redaction module with tests for secret scrubbing"
```

---

### Task 2: Prompt Timeline Parser

**Files:**
- Create: `desktop/src/lib/promptTimeline.ts`
- Create: `desktop/src/lib/promptTimeline.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// desktop/src/lib/promptTimeline.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseHistoryFile, getPromptsForSession, PromptEntry } from './promptTimeline';

const SAMPLE_JSONL = [
  '{"display":"prompt 1","pastedContents":{"file.ts":"code"},"timestamp":1000,"project":"/home","sessionId":"sess-1"}',
  '{"display":"prompt 2","pastedContents":{},"timestamp":2000,"project":"/home","sessionId":"sess-1"}',
  '{"display":"prompt 3","pastedContents":{},"timestamp":3000,"project":"/work","sessionId":"sess-2"}',
].join('\n');

const JSONL_WITH_SECRET = [
  '{"display":"my key is sk-ant-api03-abc123","pastedContents":{},"timestamp":1000,"project":"/home","sessionId":"sess-3"}',
].join('\n');

describe('parseHistoryFile', () => {
  it('parses valid JSONL into session map', () => {
    const map = parseHistoryFile(SAMPLE_JSONL);
    expect(map.get('sess-1')).toHaveLength(2);
    expect(map.get('sess-2')).toHaveLength(1);
  });

  it('strips pastedContents from entries', () => {
    const map = parseHistoryFile(SAMPLE_JSONL);
    const entries = map.get('sess-1')!;
    expect(entries[0]).not.toHaveProperty('pastedContents');
  });

  it('applies redaction to display text', () => {
    const map = parseHistoryFile(JSONL_WITH_SECRET);
    const entries = map.get('sess-3')!;
    expect(entries[0].display).toBe('my key is [REDACTED_API_KEY]');
  });

  it('skips lines with missing required fields', () => {
    const bad = '{"display":"ok","timestamp":1000}\n{"display":"good","timestamp":2000,"sessionId":"s1","project":"/x"}';
    const map = parseHistoryFile(bad);
    expect(map.get('s1')).toHaveLength(1);
  });

  it('handles empty input', () => {
    const map = parseHistoryFile('');
    expect(map.size).toBe(0);
  });

  it('handles malformed JSON lines gracefully', () => {
    const bad = 'not json\n{"display":"ok","timestamp":1000,"sessionId":"s1","project":"/x"}';
    const map = parseHistoryFile(bad);
    expect(map.get('s1')).toHaveLength(1);
  });
});

describe('getPromptsForSession', () => {
  it('returns prompts sorted by timestamp', () => {
    const map = parseHistoryFile(SAMPLE_JSONL);
    const prompts = getPromptsForSession(map, 'sess-1');
    expect(prompts[0].timestamp).toBe(1000);
    expect(prompts[1].timestamp).toBe(2000);
  });

  it('returns empty array for unknown session', () => {
    const map = parseHistoryFile(SAMPLE_JSONL);
    expect(getPromptsForSession(map, 'nonexistent')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/Tessl-Leo/Development/axon/desktop && npx vitest run src/lib/promptTimeline.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement prompt timeline parser**

```typescript
// desktop/src/lib/promptTimeline.ts
import { redactText } from './redact';

export interface PromptEntry {
  display: string;
  timestamp: number;
}

interface RawHistoryEntry {
  display?: string;
  pastedContents?: Record<string, string>;
  timestamp?: number;
  project?: string;
  sessionId?: string;
}

/**
 * Parse history.jsonl content into a Map keyed by sessionId.
 * Applies redaction and strips pastedContents.
 */
export function parseHistoryFile(content: string, extraPatterns?: string[]): Map<string, PromptEntry[]> {
  const map = new Map<string, PromptEntry[]>();
  if (!content) return map;

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry: RawHistoryEntry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue; // skip malformed lines
    }

    if (!entry.sessionId || !entry.display || entry.timestamp == null) {
      continue; // skip entries missing required fields
    }

    const prompt: PromptEntry = {
      display: redactText(entry.display, extraPatterns),
      timestamp: entry.timestamp,
    };

    const existing = map.get(entry.sessionId);
    if (existing) {
      existing.push(prompt);
    } else {
      map.set(entry.sessionId, [prompt]);
    }
  }

  // Sort each session's prompts by timestamp
  for (const [, prompts] of map) {
    prompts.sort((a, b) => a.timestamp - b.timestamp);
  }

  return map;
}

/**
 * Get prompts for a specific session from a pre-parsed map.
 */
export function getPromptsForSession(map: Map<string, PromptEntry[]>, sessionId: string): PromptEntry[] {
  return map.get(sessionId) ?? [];
}

/**
 * Load and cache history.jsonl from disk.
 * Watches for file changes and rebuilds cache.
 */
export class PromptTimelineCache {
  private cache: Map<string, PromptEntry[]> | null = null;
  private filePath: string;
  private lastMtime: number = 0;
  private extraPatterns?: string[];

  constructor(filePath: string, extraPatterns?: string[]) {
    this.filePath = filePath;
    this.extraPatterns = extraPatterns;
  }

  async getPrompts(sessionId: string): Promise<PromptEntry[]> {
    await this.ensureLoaded();
    return this.cache ? getPromptsForSession(this.cache, sessionId) : [];
  }

  async getAllSessions(): Promise<Map<string, PromptEntry[]>> {
    await this.ensureLoaded();
    return this.cache ?? new Map();
  }

  private async ensureLoaded(): Promise<void> {
    const fs = await import('fs');
    try {
      const stat = fs.statSync(this.filePath);
      const mtime = stat.mtimeMs;

      if (this.cache && mtime === this.lastMtime) return;

      const content = fs.readFileSync(this.filePath, 'utf-8');
      this.cache = parseHistoryFile(content, this.extraPatterns);
      this.lastMtime = mtime;
    } catch {
      // File doesn't exist or can't be read — return empty cache
      this.cache = new Map();
    }
  }

  invalidate(): void {
    this.cache = null;
    this.lastMtime = 0;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/Tessl-Leo/Development/axon/desktop && npx vitest run src/lib/promptTimeline.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/Tessl-Leo/Development/axon
git add desktop/src/lib/promptTimeline.ts desktop/src/lib/promptTimeline.test.ts
git commit -m "feat: add prompt timeline parser with history.jsonl caching and redaction"
```

---

### Task 3: API Endpoints

**Files:**
- Modify: `desktop/src/server/axonMiddleware.ts` (add after existing session endpoints ~line 2185)
- Modify: `desktop/src/hooks/useSessions.ts` (add new hooks)

- [ ] **Step 1: Add prompt timeline endpoint to axonMiddleware.ts**

Add after the existing `GET /api/axon/sessions` handler (around line 2185). Find the section with session endpoints and add:

```typescript
// GET /api/axon/sessions/:id/prompts — prompt timeline from history.jsonl
// Insert this BEFORE the GET /api/axon/sessions/:id handler (which matches any UUID)
```

The endpoint handler:
```typescript
// Match: /api/axon/sessions/{uuid}/prompts
if (method === 'GET' && /^\/api\/axon\/sessions\/([0-9a-f-]{36})\/prompts$/.test(pathname)) {
  const sessionId = pathname.match(/\/sessions\/([0-9a-f-]{36})\/prompts/)![1];
  try {
    const prompts = await promptTimelineCache.getPrompts(sessionId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ prompts }));
  } catch (err: any) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
  return;
}
```

Also need to instantiate `PromptTimelineCache` at the top of the middleware setup, reading the history path from config or defaulting to `~/.claude/history.jsonl`.

- [ ] **Step 2: Add by-project endpoint to axonMiddleware.ts**

```typescript
// Match: /api/axon/sessions/by-project
if (method === 'GET' && pathname === '/api/axon/sessions/by-project') {
  try {
    const allSessions = getSessions();
    const meta = getAllSessionMeta();

    // Group by project_name
    const projectMap = new Map<string, {
      projectName: string;
      projectPath: string;
      sessions: any[];
      totalCost: number;
      lastActive: string | null;
    }>();

    for (const s of allSessions) {
      const name = s.project_name || 'Unknown';
      const entry = projectMap.get(name) || {
        projectName: name,
        projectPath: s.project_path || '',
        sessions: [],
        totalCost: 0,
        lastActive: null,
      };
      const m = meta.sessions?.[s.id] || {};
      entry.sessions.push({ ...s, tags: m.tags || [], pinned: m.pinned || false, nickname: m.nickname || null });
      entry.totalCost += s.estimated_cost_usd || 0;
      if (!entry.lastActive || (s.modified_at && s.modified_at > entry.lastActive)) {
        entry.lastActive = s.modified_at;
      }
      projectMap.set(name, entry);
    }

    // Sort projects by lastActive descending
    const projects = Array.from(projectMap.values())
      .sort((a, b) => (b.lastActive || '').localeCompare(a.lastActive || ''));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ projects }));
  } catch (err: any) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
  return;
}
```

- [ ] **Step 3: Add React hooks for new endpoints**

Append to `desktop/src/hooks/useSessions.ts`:

```typescript
export interface ProjectGroup {
  projectName: string;
  projectPath: string;
  sessions: SessionSummary[];
  totalCost: number;
  lastActive: string | null;
}

export function useSessionsByProject() {
  const [projects, setProjects] = useState<ProjectGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/axon/sessions/by-project');
      const data = await res.json();
      setProjects(data.projects || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  return { projects, loading, error, refetch: fetchProjects };
}

export function usePromptTimeline(sessionId: string | null) {
  const [prompts, setPrompts] = useState<Array<{ display: string; timestamp: number }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) { setPrompts([]); return; }
    setLoading(true);
    fetch(`/api/axon/sessions/${sessionId}/prompts`)
      .then(r => r.json())
      .then(data => setPrompts(data.prompts || []))
      .catch(() => setPrompts([]))
      .finally(() => setLoading(false));
  }, [sessionId]);

  return { prompts, loading };
}
```

- [ ] **Step 4: Verify the server starts without errors**

Run: `cd /Users/Tessl-Leo/Development/axon/desktop && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
cd /Users/Tessl-Leo/Development/axon
git add desktop/src/server/axonMiddleware.ts desktop/src/hooks/useSessions.ts
git commit -m "feat: add prompt timeline and by-project API endpoints with React hooks"
```

---

### Task 4: SessionsView — Mode Tabs & Day View

**Files:**
- Modify: `desktop/src/views/SessionsView.tsx`

- [ ] **Step 1: Add mode state and tab bar**

At the top of the `SessionsView` component (around line 699), add mode state:

```typescript
const [viewMode, setViewMode] = useState<'sessions' | 'day' | 'projects'>('day');
```

Add a tab bar component rendered above the existing content:

```typescript
function ViewModeTabs({ mode, setMode }: { mode: string; setMode: (m: any) => void }) {
  const tabs = [
    { id: 'day', label: 'Day' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'projects', label: 'Projects' },
  ];
  return (
    <div style={{ display: 'flex', gap: '2px', padding: '8px 16px', borderBottom: '1px solid var(--border-color, #333)' }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => setMode(t.id)}
          style={{
            padding: '6px 16px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: mode === t.id ? 600 : 400,
            background: mode === t.id ? 'var(--accent-bg, rgba(99,102,241,0.15))' : 'transparent',
            color: mode === t.id ? 'var(--accent-color, #818cf8)' : 'var(--text-secondary, #888)',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add Day View grouping logic**

Add a `groupByDay` helper near the existing `groupByTime` function:

```typescript
interface DayGroup {
  date: string; // YYYY-MM-DD
  label: string; // "March 25, 2026" or "Unknown date"
  sessions: SessionSummary[];
  sessionCount: number;
  totalCost: number;
  projects: Set<string>;
}

function groupByDay(sessions: SessionSummary[]): DayGroup[] {
  const dayMap = new Map<string, DayGroup>();

  for (const s of sessions) {
    let dateKey: string;
    let label: string;

    if (s.created_at) {
      const d = new Date(s.created_at);
      dateKey = d.toISOString().slice(0, 10);
      label = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } else {
      dateKey = 'unknown';
      label = 'Unknown date';
    }

    const existing = dayMap.get(dateKey) || {
      date: dateKey,
      label,
      sessions: [],
      sessionCount: 0,
      totalCost: 0,
      projects: new Set<string>(),
    };
    existing.sessions.push(s);
    existing.sessionCount++;
    existing.totalCost += s.estimated_cost_usd || 0;
    if (s.project_name) existing.projects.add(s.project_name);
    dayMap.set(dateKey, existing);
  }

  return Array.from(dayMap.values())
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first, unknown last
}
```

- [ ] **Step 3: Render Day View mode**

In SessionsView, conditionally render based on `viewMode`:

```typescript
// Inside the main render, after the tab bar:
{viewMode === 'day' && (
  <DayViewList sessions={sessions} onSelectSession={setExpandedId} expandedId={expandedId} />
)}
{viewMode === 'sessions' && (
  // existing SessionList component
  <SessionList ... />
)}
{viewMode === 'projects' && (
  <ProjectViewList onSelectSession={setExpandedId} expandedId={expandedId} />
)}
```

The `DayViewList` component:
```typescript
function DayViewList({ sessions, onSelectSession, expandedId }: { sessions: SessionSummary[]; onSelectSession: (id: string) => void; expandedId: string | null }) {
  const days = useMemo(() => groupByDay(sessions), [sessions]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set([days[0]?.date])); // expand today by default

  const toggleDay = (date: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  return (
    <div style={{ padding: '12px' }}>
      {days.map(day => (
        <div key={day.date} style={{ marginBottom: '16px' }}>
          <div
            onClick={() => toggleDay(day.date)}
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '8px', background: 'var(--card-bg, rgba(255,255,255,0.03))' }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '15px' }}>{day.label}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary, #888)', marginTop: '2px' }}>
                {day.sessionCount} session{day.sessionCount !== 1 ? 's' : ''} · {day.projects.size} project{day.projects.size !== 1 ? 's' : ''} · ${day.totalCost.toFixed(2)}
              </div>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary, #666)' }}>
              {expandedDays.has(day.date) ? '▼' : '▶'}
            </span>
          </div>
          {expandedDays.has(day.date) && (
            <div style={{ marginTop: '8px', paddingLeft: '12px', borderLeft: '2px solid var(--border-color, #333)' }}>
              {day.sessions.map(s => (
                <SessionCard key={s.id} session={s} expanded={expandedId === s.id} onToggle={() => onSelectSession(s.id)} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Verify the component renders without errors**

Run: `cd /Users/Tessl-Leo/Development/axon/desktop && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
cd /Users/Tessl-Leo/Development/axon
git add desktop/src/views/SessionsView.tsx
git commit -m "feat: add Day View mode with day-grouped session cards and mode tab bar"
```

---

### Task 5: SessionsView — Project View

**Files:**
- Modify: `desktop/src/views/SessionsView.tsx`

- [ ] **Step 1: Add ProjectViewList component**

```typescript
function ProjectViewList({ onSelectSession, expandedId }: { onSelectSession: (id: string) => void; expandedId: string | null }) {
  const { projects, loading } = useSessionsByProject();
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  if (loading) return <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>Loading projects...</div>;

  return (
    <div style={{ padding: '12px' }}>
      {projects.map(project => (
        <div key={project.projectName} style={{ marginBottom: '16px' }}>
          <div
            onClick={() => setExpandedProject(expandedProject === project.projectName ? null : project.projectName)}
            style={{ cursor: 'pointer', padding: '10px 14px', borderRadius: '8px', background: 'var(--card-bg, rgba(255,255,255,0.03))' }}
          >
            <div style={{ fontWeight: 600, fontSize: '15px' }}>{project.projectName}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary, #888)', marginTop: '2px' }}>
              {project.projectPath}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary, #888)', marginTop: '4px' }}>
              {project.sessions.length} session{project.sessions.length !== 1 ? 's' : ''} · ${project.totalCost.toFixed(2)} · Last active: {project.lastActive ? new Date(project.lastActive).toLocaleDateString() : 'unknown'}
            </div>
          </div>
          {expandedProject === project.projectName && (
            <div style={{ marginTop: '8px', paddingLeft: '12px', borderLeft: '2px solid var(--border-color, #333)' }}>
              {project.sessions
                .sort((a, b) => (b.modified_at || '').localeCompare(a.modified_at || ''))
                .map(s => (
                  <SessionCard key={s.id} session={s} expanded={expandedId === s.id} onToggle={() => onSelectSession(s.id)} />
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add import for useSessionsByProject**

At the top of SessionsView.tsx, update the import from useSessions:

```typescript
import { useSessions, useSessionSearch, useSessionsByProject, usePromptTimeline } from '../hooks/useSessions';
```

- [ ] **Step 3: Verify type-checks pass**

Run: `cd /Users/Tessl-Leo/Development/axon/desktop && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
cd /Users/Tessl-Leo/Development/axon
git add desktop/src/views/SessionsView.tsx
git commit -m "feat: add Project View mode with project-grouped session list"
```

---

### Task 6: Session Drill-Down — Prompt Timeline & Related Sessions

**Files:**
- Modify: `desktop/src/views/SessionsView.tsx` (SessionDetailPanel)

- [ ] **Step 1: Add prompt timeline to detail panel**

Inside the `SessionDetailPanel` component (around line 120-271), add a new section after the existing detail content:

```typescript
// Inside SessionDetailPanel, after existing content
function PromptTimeline({ sessionId }: { sessionId: string }) {
  const { prompts, loading } = usePromptTimeline(sessionId);
  const [showAll, setShowAll] = useState(false);

  if (loading) return <div style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '8px 0' }}>Loading prompts...</div>;
  if (prompts.length === 0) return <div style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '8px 0', fontStyle: 'italic' }}>No prompt timeline available</div>;

  const visible = showAll ? prompts : prompts.slice(0, 5);
  const remaining = prompts.length - 5;

  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary, #888)', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '8px' }}>
        Prompt Timeline
      </div>
      <div style={{ borderLeft: '2px solid var(--border-color, #333)', paddingLeft: '12px' }}>
        {visible.map((p, i) => (
          <div key={i} style={{ marginBottom: '10px', position: 'relative' }}>
            <div style={{ position: 'absolute', left: '-17px', top: '4px', width: '8px', height: '8px', borderRadius: '50%', background: i < 3 ? 'var(--accent-color, #6366f1)' : 'var(--text-tertiary, #666)' }} />
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {new Date(p.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div style={{ fontSize: '13px', marginTop: '2px', lineHeight: 1.4 }}>
              {renderRedactedText(p.display.length > 200 ? p.display.slice(0, 200) + '...' : p.display)}
            </div>
          </div>
        ))}
        {!showAll && remaining > 0 && (
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }} onClick={() => setShowAll(true)}>
            <em>+ {remaining} more...</em> <span style={{ color: 'var(--accent-color, #6366f1)', fontWeight: 500 }}>Show all</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Render text with [REDACTED_*] tokens styled as muted badges */
function renderRedactedText(text: string): React.ReactNode {
  const parts = text.split(/(\[REDACTED_[A-Z_]+\])/g);
  return parts.map((part, i) =>
    part.startsWith('[REDACTED_') ? (
      <span key={i} style={{ background: 'var(--bg-tertiary, #333)', color: 'var(--text-tertiary, #666)', padding: '1px 6px', borderRadius: '3px', fontSize: '11px', fontFamily: 'monospace' }}>
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}
```

- [ ] **Step 2: Add related sessions section**

```typescript
function RelatedSessions({ sessionId, projectName, onSelect }: { sessionId: string; projectName: string; onSelect: (id: string) => void }) {
  const { sessions } = useSessions(null); // all sessions
  const related = useMemo(() =>
    (sessions || [])
      .filter(s => s.project_name === projectName && s.id !== sessionId)
      .sort((a, b) => (b.modified_at || '').localeCompare(a.modified_at || ''))
      .slice(0, 5),
    [sessions, projectName, sessionId]
  );

  if (related.length === 0) return null;

  return (
    <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-color, #333)' }}>
      <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary, #888)', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '8px' }}>
        Related Sessions
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {related.map(s => (
          <div
            key={s.id}
            onClick={() => onSelect(s.id)}
            style={{ background: 'var(--card-bg)', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: '1px solid var(--border-color, #333)' }}
          >
            <span style={{ color: 'var(--accent-color, #6366f1)', fontWeight: 600 }}>#{s.id.slice(0, 8)}</span>
            {' '}
            <span style={{ color: 'var(--text-secondary)' }}>
              {s.modified_at ? new Date(s.modified_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire PromptTimeline and RelatedSessions into SessionDetailPanel**

Add these components at the bottom of the SessionDetailPanel render, before the closing div:

```typescript
<PromptTimeline sessionId={session.id} />
<RelatedSessions sessionId={session.id} projectName={session.project_name} onSelect={onSelectRelated} />
```

Where `onSelectRelated` is passed down to handle navigating to a related session.

- [ ] **Step 4: Verify type-checks**

Run: `cd /Users/Tessl-Leo/Development/axon/desktop && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
cd /Users/Tessl-Leo/Development/axon
git add desktop/src/views/SessionsView.tsx
git commit -m "feat: add prompt timeline and related sessions to session detail panel"
```

---

### Task 7: Session Dendrite for Rollup Pipeline

**Files:**
- Create: `cli/lib/session-dendrite.ts`

- [ ] **Step 1: Create the TypeScript dendrite script**

```typescript
// cli/lib/session-dendrite.ts
//
// Generates a claude-sessions dendrite markdown file from session data.
// Invoked by axon-collect: npx tsx cli/lib/session-dendrite.ts dendrite --workspace $WORKSPACE --since $SINCE
//
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { redactText } from '../../desktop/src/lib/redact';
import { parseHistoryFile, getPromptsForSession } from '../../desktop/src/lib/promptTimeline';

const args = process.argv.slice(2);
const command = args[0];

if (command !== 'dendrite') {
  console.error('Usage: session-dendrite.ts dendrite --workspace <path> --since <iso8601>');
  process.exit(1);
}

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const workspace = getArg('workspace');
const since = getArg('since');

if (!workspace) {
  console.error('--workspace is required');
  process.exit(1);
}

// Read config
const configPath = path.join(workspace, 'config.yaml');
let historyPath = path.join(process.env.HOME || '~', '.claude', 'history.jsonl');
let maxPromptsPerSession = 50;
let extraPatterns: string[] = [];

if (fs.existsSync(configPath)) {
  const configText = fs.readFileSync(configPath, 'utf-8');
  // Simple YAML parsing for the fields we need
  const historyMatch = configText.match(/history_path:\s*(.+)/);
  if (historyMatch) historyPath = historyMatch[1].trim().replace(/^~/, process.env.HOME || '~');
  const maxMatch = configText.match(/max_prompts_per_session:\s*(\d+)/);
  if (maxMatch) maxPromptsPerSession = parseInt(maxMatch[1], 10);
  const patternMatches = configText.match(/extra_patterns:\s*\n((?:\s+-\s+.+\n?)*)/);
  if (patternMatches) {
    extraPatterns = patternMatches[1].split('\n')
      .map(l => l.replace(/^\s+-\s+['"]?/, '').replace(/['"]?\s*$/, ''))
      .filter(Boolean);
  }
}

// Open sessions DB
const dbPath = path.join(process.env.HOME || '~', '.axon', 'sessions.db');
if (!fs.existsSync(dbPath)) {
  console.error(`Sessions database not found: ${dbPath}`);
  process.exit(1);
}
const db = new Database(dbPath, { readonly: true });

// Query sessions since cutoff
const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const sessions = db.prepare(`
  SELECT id, project_name, project_path, first_prompt, heuristic_summary,
         tool_call_count, files_touched_count, estimated_cost_usd,
         tool_calls_json, created_at, modified_at, message_count, errors
  FROM sessions
  WHERE modified_at > ?
  ORDER BY created_at ASC
`).all(sinceDate) as any[];

if (sessions.length === 0) {
  console.log('No sessions modified since', sinceDate);
  process.exit(0);
}

// Load history.jsonl for prompt timelines
let promptMap = new Map<string, any[]>();
if (fs.existsSync(historyPath)) {
  const content = fs.readFileSync(historyPath, 'utf-8');
  promptMap = parseHistoryFile(content, extraPatterns);
}

// Build dendrite markdown
const now = new Date().toISOString();
const today = now.slice(0, 10);
const projects = new Map<string, { name: string; path: string; count: number }>();
let totalPrompts = 0;
let totalCost = 0;

for (const s of sessions) {
  const name = s.project_name || 'unknown';
  const existing = projects.get(name) || { name, path: s.project_path || '', count: 0 };
  existing.count++;
  projects.set(name, existing);
  totalPrompts += s.message_count || 0;
  totalCost += s.estimated_cost_usd || 0;
}

const projectsYaml = Array.from(projects.values())
  .map(p => `  - name: ${p.name}\n    path: ${p.path}\n    sessions: ${p.count}`)
  .join('\n');

let md = `---
type: claude-sessions
collected_at: ${now}
since: ${sinceDate}
session_count: ${sessions.length}
total_prompts: ${totalPrompts}
total_cost_usd: ${totalCost.toFixed(2)}
projects:
${projectsYaml}
---
# Claude Sessions: ${today}

`;

for (const s of sessions) {
  const duration = s.created_at && s.modified_at
    ? Math.round((new Date(s.modified_at).getTime() - new Date(s.created_at).getTime()) / 60000)
    : 0;
  const durationStr = duration >= 60 ? `${Math.floor(duration / 60)}h ${duration % 60}min` : `${duration} min`;
  const cost = (s.estimated_cost_usd || 0).toFixed(2);

  md += `## Session: ${s.id.slice(0, 8)} | ${s.project_name || 'unknown'} | ${durationStr} | $${cost}\n`;
  md += `**Summary:** ${s.heuristic_summary || 'No summary'}\n`;

  // Tool calls
  if (s.tool_calls_json) {
    try {
      const tools = JSON.parse(s.tool_calls_json) as Array<{ tool: string; count: number }>;
      md += `**Tools:** ${tools.map(t => `${t.tool}(${t.count})`).join(', ')}\n`;
    } catch { /* skip */ }
  }

  md += '\n';

  // Prompts
  const prompts = getPromptsForSession(promptMap, s.id);
  if (prompts.length > 0) {
    md += `### Prompts (redacted)\n`;
    const visible = prompts.slice(0, maxPromptsPerSession);
    for (const p of visible) {
      const time = new Date(p.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      const text = p.display.length > 120 ? p.display.slice(0, 120) + '...' : p.display;
      md += `- ${time} — "${text}"\n`;
    }
    if (prompts.length > maxPromptsPerSession) {
      md += `- ... (${prompts.length - maxPromptsPerSession} more)\n`;
    }
    md += '\n';
  }
}

// Write dendrite file
const dendritesDir = path.join(workspace, 'dendrites');
if (!fs.existsSync(dendritesDir)) fs.mkdirSync(dendritesDir, { recursive: true });

const timestamp = now.replace(/[-:]/g, '').replace('T', 'T').slice(0, 15) + 'Z';
const filename = `${timestamp}_claude-sessions.md`;
const outputPath = path.join(dendritesDir, filename);
fs.writeFileSync(outputPath, md);
console.log(`Wrote dendrite: ${outputPath}`);

db.close();
```

- [ ] **Step 2: Verify the script can be parsed**

Run: `cd /Users/Tessl-Leo/Development/axon && npx tsx cli/lib/session-dendrite.ts --help 2>&1 || true`
Expected: Shows usage error (no "dendrite" command), not a syntax error

- [ ] **Step 3: Commit**

```bash
cd /Users/Tessl-Leo/Development/axon
git add cli/lib/session-dendrite.ts
git commit -m "feat: add TypeScript session dendrite for rollup pipeline"
```

---

### Task 8: Integrate Dendrite into axon-collect

**Files:**
- Modify: `cli/axon-collect` (add new dendrite block after the todo-state block, ~line 306)

- [ ] **Step 1: Add claude-sessions dendrite type to axon-collect**

After the todo-state dendrite block (around line 306), add:

```bash
# ── claude-sessions dendrite ────────────────────────────────────
if dendrite_enabled "claude-sessions"; then
  log "Collecting claude-sessions dendrite..."
  if npx tsx "$SCRIPT_DIR/lib/session-dendrite.ts" dendrite \
      --workspace "$WORKSPACE" \
      --since "$GIT_SINCE" 2>/dev/null; then
    log "  ✓ claude-sessions dendrite collected"
  else
    log "  ⚠ claude-sessions dendrite skipped (no sessions DB or error)"
  fi
fi
```

- [ ] **Step 2: Commit**

```bash
cd /Users/Tessl-Leo/Development/axon
git add cli/axon-collect
git commit -m "feat: integrate claude-sessions dendrite into axon-collect"
```

---

### Task 9: Rollup Prompt Adaptation

**Files:**
- Modify: `cli/axon-rollup` (rollup prompt section ~lines 189-264, allowedTools ~line 264)

- [ ] **Step 1: Add per-workspace allowed_tools config check**

Before the Claude CLI invocation (around line 264), add config reading:

```bash
# Read per-workspace allowed_tools if set
ALLOWED_TOOLS="Read,Glob,Grep"  # default for git workspaces
if [ -f "$WORKSPACE/config.yaml" ]; then
  # Check for allowed_tools: [] (empty means no tools)
  _tools_line=$(grep -E '^\s+allowed_tools:' "$WORKSPACE/config.yaml" 2>/dev/null || true)
  if [ -n "$_tools_line" ]; then
    if echo "$_tools_line" | grep -q '\[\]'; then
      ALLOWED_TOOLS=""
    fi
  fi
fi
```

Then modify the Claude CLI invocation to conditionally include `--allowedTools`:

```bash
if [ -n "$ALLOWED_TOOLS" ]; then
  CLAUDE_ARGS="--allowedTools \"$ALLOWED_TOOLS\""
else
  CLAUDE_ARGS=""
fi
```

- [ ] **Step 2: Add session-oriented rollup prompt variant**

Add a conditional block that detects `claude-sessions` workspace and uses a different prompt:

```bash
# Detect workspace type for prompt variant
IS_SESSION_WORKSPACE=false
if grep -q 'claude-sessions: true' "$WORKSPACE/config.yaml" 2>/dev/null; then
  IS_SESSION_WORKSPACE=true
fi
```

Then in the prompt assembly section, swap the frontmatter and sections for the session variant. The session prompt replaces `commits` with `sessions`, `prompts`, `totalCost`, `projectsTouched` in the frontmatter, replaces "Files Most Touched" with "Projects Touched", and removes verification instructions.

- [ ] **Step 3: Commit**

```bash
cd /Users/Tessl-Leo/Development/axon
git add cli/axon-rollup
git commit -m "feat: adapt rollup prompt for claude-sessions workspace with per-workspace tool config"
```

---

### Task 10: Workspace Template & Config

**Files:**
- Create workspace directory and config template

- [ ] **Step 1: Create workspace initialization**

Add a section to the session-dendrite script (or a separate init command) that creates the workspace if it doesn't exist:

```bash
# In axon-collect or as a manual step:
mkdir -p ~/.axon/workspaces/claude-sessions/{episodes,dendrites,mornings}
```

- [ ] **Step 2: Create config.yaml template**

```yaml
# ~/.axon/workspaces/claude-sessions/config.yaml
# Claude Sessions workspace — tracks Claude Code activity
status: active
history_path: ~/.claude/history.jsonl
claude_projects_path: ~/.claude/projects

redaction:
  enabled: true
  strip_pasted_contents: true
  extra_patterns: []

rollup:
  schedule: "0 22 * * *"
  max_prompts_per_session: 50
  model: default
  allowed_tools: []

dendrite_enabled:
  claude-sessions: true
  git-log: false
  file-tree: false
```

- [ ] **Step 3: Create initial state.md**

```markdown
# Claude Sessions — State

## Active Projects
_(populated after first rollup)_

## Open Loops
_(populated after first rollup)_

## Continuity
First rollup pending.
```

- [ ] **Step 4: Commit**

```bash
cd /Users/Tessl-Leo/Development/axon
git add cli/lib/session-dendrite.ts  # if modified for init
git commit -m "feat: add claude-sessions workspace template and config"
```

---

### Task 11: Data Flow Diagram

**Files:**
- Create: `docs/data-flow-diagram.md`

- [ ] **Step 1: Write the data flow diagram document**

Create a comprehensive ASCII + description data flow diagram documenting where all processed data goes. Include:
- All data sources (history.jsonl, session JSONL files, sessions-index.json)
- Processing stages (indexer, redaction, dendrite, rollup)
- Storage locations (SQLite, ~/.axon/ files, dendrites, episodes)
- Network boundary (what crosses it — only redacted rollup text to Anthropic API)
- What stays local vs what leaves the machine

Use ASCII art for the diagram with detailed annotations.

- [ ] **Step 2: Commit**

```bash
cd /Users/Tessl-Leo/Development/axon
git add docs/data-flow-diagram.md
git commit -m "docs: add data flow diagram showing where all processed data goes"
```

---

### Task 12: Integration Testing & Final Verification

- [ ] **Step 1: Run all tests**

Run: `cd /Users/Tessl-Leo/Development/axon/desktop && npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Type-check the full project**

Run: `cd /Users/Tessl-Leo/Development/axon/desktop && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Verify the desktop app starts**

Run: `cd /Users/Tessl-Leo/Development/axon/desktop && npm run dev`
Expected: Vite dev server starts, app loads at localhost:1420

- [ ] **Step 4: Test session dendrite manually**

Run: `cd /Users/Tessl-Leo/Development/axon && npx tsx cli/lib/session-dendrite.ts dendrite --workspace ~/.axon/workspaces/claude-sessions --since 2026-03-24T00:00:00Z`
Expected: Writes a dendrite markdown file to ~/.axon/workspaces/claude-sessions/dendrites/

- [ ] **Step 5: Final commit — update spec status**

```bash
cd /Users/Tessl-Leo/Development/axon
# Update spec status from "Revised" to "Implemented"
git add docs/superpowers/specs/2026-03-25-claude-history-tracker-design.md
git commit -m "docs: mark design spec as implemented"
```
