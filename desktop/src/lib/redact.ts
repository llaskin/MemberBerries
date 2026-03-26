/**
 * Redaction module — scrubs sensitive patterns from text before
 * it enters the rollup pipeline or is displayed in the UI.
 *
 * All regexes are compiled at module load time for performance.
 * Full redaction of 1,500 entries targets < 2 seconds.
 */

interface RedactionRule {
  pattern: RegExp;
  replacement: string;
}

const RULES: RedactionRule[] = [
  // Private keys (multiline — must be before single-line patterns)
  {
    pattern: /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]',
  },

  // Bearer / Authorization headers (before JWT to catch "Bearer eyJ...")
  {
    pattern: /\b(Authorization:\s*)(Bearer\s+\S+|Basic\s+\S+)/gi,
    replacement: '$1[REDACTED_AUTH]',
  },

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
  {
    pattern: /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+/g,
    replacement: '[REDACTED_JWT]',
  },

  // Connection strings (postgres://, mongodb+srv://, mysql://, redis://)
  {
    pattern: /\b(postgres|postgresql|mongodb\+srv|mongodb|mysql|redis):\/\/[^\s'"]+/gi,
    replacement: '[REDACTED_CONNECTION_STRING]',
  },

  // .env style secrets (UPPER_CASE_KEY=value with secret-like name)
  {
    pattern:
      /\b([A-Z][A-Z0-9]*_[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASS|CREDENTIAL|AUTH)[A-Z0-9_]*)=\S+/g,
    replacement: '$1=[REDACTED_ENV]',
  },

  // Generic key=value secrets
  {
    pattern: /\b(password|secret|token|api_key|apikey|access_token|client_secret)=\S+/gi,
    replacement: '$1=[REDACTED_SECRET]',
  },
];

/**
 * Redact sensitive patterns from text.
 * @param text Input text to redact
 * @param extraPatterns Additional regex strings from user config
 * @returns Redacted text (empty string for null/undefined input)
 */
export function redactText(
  text: string | null | undefined,
  extraPatterns?: string[],
): string {
  if (!text) return '';

  let result = text;

  for (const rule of RULES) {
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
