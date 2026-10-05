/**
 * Pattern tables for content-based secret detection. Every pattern is stored
 * as `{ source, flags }` rather than a live `RegExp` instance: a shared
 * global `RegExp` carries `lastIndex` state across calls, which would make
 * repeated invocations of the exported classifier order-dependent. Callers
 * build a fresh `RegExp` per scan from these tables instead.
 * @module @deepseek-ai/dsh-memory-redact/patterns
 */

/** One named, reusable regular expression definition. */
export interface PatternSource {
  /** Short identifier for the pattern, useful in findings and test names. */
  id: string
  /** `RegExp` source, without delimiters. */
  source: string
  /** `RegExp` flags. Always includes `g` so callers can `matchAll` it. */
  flags: string
}

/**
 * Realistic secret **value** shapes an agent might otherwise write to
 * memory, independent of any surrounding key name. Matching one of these is
 * a confirmed finding, not merely an ambiguous one.
 */
export const SECRET_VALUE_SHAPES: PatternSource[] = [
  { id: 'aws-access-key-id', source: String.raw`\bAKIA[0-9A-Z]{16}\b`, flags: 'g' },
  { id: 'github-token', source: String.raw`\bgh[pousr]_[A-Za-z0-9]{36,}\b`, flags: 'g' },
  { id: 'github-fine-grained-token', source: String.raw`\bgithub_pat_[A-Za-z0-9_]{20,}\b`, flags: 'g' },
  { id: 'slack-token', source: String.raw`\bxox[baprs]-[A-Za-z0-9-]{10,}\b`, flags: 'g' },
  { id: 'google-api-key', source: String.raw`\bAIza[0-9A-Za-z_-]{35}\b`, flags: 'g' },
  { id: 'openai-style-key', source: String.raw`\bsk-[A-Za-z0-9]{20,}\b`, flags: 'g' },
  { id: 'stripe-key', source: String.raw`\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}\b`, flags: 'g' },
  { id: 'jwt', source: String.raw`\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b`, flags: 'g' },
  { id: 'bearer-token', source: String.raw`\bBearer\s+[A-Za-z0-9._~+/-]{10,}=*`, flags: 'gi' },
  {
    id: 'pem-private-key-block',
    source: String.raw`-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----`,
    flags: 'g',
  },
  {
    id: 'credentialed-connection-string',
    source: String.raw`\b[a-z][a-z0-9+.-]*://[^\s:@/]+:[^\s:@/]+@[^\s/]+`,
    flags: 'gi',
  },
]

/**
 * Key-name heuristic, extended from `@deepseek-ai/dsh-subprocess`'s
 * `SENSITIVE_ENV_PATTERN` (`/KEY|PASSWORD|SECRET|TOKEN/i`, an environment
 * **variable-name** match with no word boundaries — safe there because env
 * names are whole identifiers, not prose). Free text needs a boundary so
 * "monkey" or "turkey" do not match on the "key" substring, so this uses
 * letter-based lookaround (`(?<![A-Za-z])` / `(?![A-Za-z])`) rather than
 * `\b`: a plain `\b` treats `_` as a word character, which would silently
 * miss compound identifiers an agent is just as likely to write — e.g.
 * `internal_token:` or `DB_PASSWORD=...` — since there is no `\b` boundary
 * between `_` and the sensitive word. The letter-only lookaround still
 * matches `_token`/`_key` (preceded by `_`, not a letter) while continuing
 * to reject "monkey"/"turkey" (preceded by a letter). An assignment-shaped
 * tail (`name: value` / `name=value`) is required so a sentence that
 * merely mentions a security-adjacent word without attaching a value — "the
 * API key is stored in `.env`" — does not match at all: the word "key" is
 * not immediately followed by `:`/`=`, so this pattern is silent on it.
 *
 * `d` (hasIndices) is included so the classifier can locate the captured
 * value's exact offsets without re-searching the surrounding match.
 */
export const SENSITIVE_NAME_ASSIGNMENT: PatternSource = {
  id: 'name-value-assignment',
  source: String.raw`(?<![A-Za-z])(?:api[_-]?key|access[_-]?key|secret[_-]?key|private[_-]?key|secret|password|passwd|pwd|token|access[_-]?token|refresh[_-]?token|bearer|credential|authorization|conn(?:ection)?[_-]?string)(?![A-Za-z])\s*[:=]\s*["']?([^\s"']+)["']?`,
  flags: 'gid',
}
