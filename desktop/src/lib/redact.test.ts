import { describe, it, expect } from 'vitest';
import { redactText } from './redact';

describe('redactText', () => {
  // ── API keys ──────────────────────────────────────────────
  it('redacts Anthropic API keys (sk-ant-)', () => {
    expect(redactText('key is sk-ant-api03-abc123def456')).toBe(
      'key is [REDACTED_API_KEY]',
    );
  });
  it('redacts sk-proj keys', () => {
    expect(redactText('sk-proj-abcdef123456')).toBe('[REDACTED_API_KEY]');
  });

  // ── GitHub tokens ─────────────────────────────────────────
  it('redacts ghp_ tokens', () => {
    expect(
      redactText('ghp_1234567890abcdef1234567890abcdef12345678'),
    ).toBe('[REDACTED_GITHUB_TOKEN]');
  });
  it('redacts github_pat_ tokens', () => {
    expect(redactText('github_pat_abcDEF123_xyz')).toBe(
      '[REDACTED_GITHUB_TOKEN]',
    );
  });
  it('redacts gho_ tokens', () => {
    expect(redactText('gho_abc123def456')).toBe('[REDACTED_GITHUB_TOKEN]');
  });

  // ── Slack tokens ──────────────────────────────────────────
  it('redacts xoxb tokens', () => {
    expect(redactText('xoxb-123-456-abc')).toBe('[REDACTED_SLACK_TOKEN]');
  });
  it('redacts xoxp tokens', () => {
    expect(redactText('xoxp-123-456-abc')).toBe('[REDACTED_SLACK_TOKEN]');
  });

  // ── Bearer / Auth ─────────────────────────────────────────
  it('redacts Bearer auth headers', () => {
    expect(
      redactText(
        'Authorization: Bearer eyJhbGciOiJIUz.payload.sig',
      ),
    ).toBe('Authorization: [REDACTED_AUTH]');
  });

  // ── JWTs ──────────────────────────────────────────────────
  it('redacts standalone JWTs', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    expect(redactText(`token ${jwt}`)).toBe('token [REDACTED_JWT]');
  });

  // ── AWS keys ──────────────────────────────────────────────
  it('redacts AWS access keys', () => {
    expect(redactText('AKIAIOSFODNN7EXAMPLE')).toBe('[REDACTED_AWS_KEY]');
  });

  // ── Connection strings ────────────────────────────────────
  it('redacts postgres connection strings', () => {
    expect(redactText('postgres://admin:s3cret@db.host:5432/mydb')).toBe(
      '[REDACTED_CONNECTION_STRING]',
    );
  });
  it('redacts mongodb+srv connection strings', () => {
    expect(
      redactText('mongodb+srv://user:pass@cluster.mongodb.net/db'),
    ).toBe('[REDACTED_CONNECTION_STRING]');
  });

  // ── Generic secrets ───────────────────────────────────────
  it('redacts password= values', () => {
    expect(redactText('password=supersecret123')).toBe(
      'password=[REDACTED_SECRET]',
    );
  });
  it('redacts secret= values', () => {
    expect(redactText('secret=abc123')).toBe('secret=[REDACTED_SECRET]');
  });
  it('redacts token= in URLs', () => {
    expect(
      redactText('https://api.example.com?token=abc123'),
    ).toBe('https://api.example.com?token=[REDACTED_SECRET]');
  });

  // ── Private keys ──────────────────────────────────────────
  it('redacts private key blocks', () => {
    const key =
      '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----';
    expect(redactText(key)).toBe('[REDACTED_PRIVATE_KEY]');
  });

  // ── .env patterns ─────────────────────────────────────────
  it('redacts UPPER_CASE secret env vars', () => {
    expect(
      redactText(
        'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      ),
    ).toBe('AWS_SECRET_ACCESS_KEY=[REDACTED_ENV]');
  });

  // ── Should NOT redact ─────────────────────────────────────
  it('does not redact normal URLs', () => {
    const url = 'https://github.com/user/repo';
    expect(redactText(url)).toBe(url);
  });
  it('does not redact customer names', () => {
    expect(redactText('working on Cyera POV')).toBe('working on Cyera POV');
  });
  it('does not redact project paths', () => {
    const p = '/Users/Tessl-Leo/Development/axon';
    expect(redactText(p)).toBe(p);
  });

  // ── Edge cases ────────────────────────────────────────────
  it('handles empty string', () => {
    expect(redactText('')).toBe('');
  });
  it('handles null', () => {
    expect(redactText(null as any)).toBe('');
  });
  it('handles undefined', () => {
    expect(redactText(undefined as any)).toBe('');
  });

  // ── Custom patterns ───────────────────────────────────────
  it('applies custom extra patterns', () => {
    expect(redactText('TESSL_KEY_abc123', ['TESSL_KEY_\\w+'])).toBe(
      '[REDACTED]',
    );
  });
});
