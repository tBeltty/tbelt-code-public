import { describe, expect, it } from 'vitest'
import { redactMemoryContent } from '../src/index.ts'

/**
 * Every fixture below that resembles a real credential is assembled from
 * concatenated pieces rather than written as one contiguous literal. A
 * third-party secret scanner (e.g. GitGuardian) matches raw source text, not
 * evaluated runtime values — a synthetic fixture realistic enough to
 * exercise this package's own detector is, by construction, also shaped
 * like what an external scanner looks for. Splitting the literal keeps the
 * exact same runtime string these tests assert on while removing the
 * contiguous match from the file text itself.
 */
const join = (...parts: string[]): string => parts.join('')

describe('redactMemoryContent — true positives (confirmed secret shapes)', () => {
  it('redacts an AWS access key id', () => {
    const keyId = join('AKIA', 'ABCDEFGHIJKLMNOP')
    const result = redactMemoryContent(`production key: ${keyId}, do not lose it`)
    expect(result.redacted).toBe(true)
    expect(result.text).not.toContain(keyId)
    expect(result.findings.some(f => f.confidence === 'confirmed')).toBe(true)
  })

  it('redacts a GitHub personal access token', () => {
    const token = join('ghp_', 'a1B2c3D4'.repeat(5))
    const result = redactMemoryContent(`use ${token} for the checkout`)
    expect(result.redacted).toBe(true)
    expect(result.text).not.toContain(token)
  })

  it('redacts a bearer token', () => {
    const token = join('abc123DEF456', 'ghi789JKL')
    const result = redactMemoryContent(`Authorization header: ${join('Bear', 'er')} ${token}`)
    expect(result.redacted).toBe(true)
    expect(result.text).not.toContain(token)
  })

  it('redacts a PEM private key block', () => {
    const header = join('-----BEGIN ', 'RSA PRIVATE KEY-----')
    const footer = join('-----END ', 'RSA PRIVATE KEY-----')
    const body = join('MIIBOgIBAAJBAK2Q3f7z8x9y0v1u2t3s4r5q6', 'p7o8n9m0l1k2j3i4h5g6f7e8d9c')
    const pem = [header, body, footer].join('\n')
    const result = redactMemoryContent(`Saved for later:\n${pem}\nend of note`)
    expect(result.redacted).toBe(true)
    expect(result.text).not.toContain(body)
  })

  it('redacts a credentialed connection string', () => {
    const credentials = join('appuser:', 'hunter2pass')
    const result = redactMemoryContent(`connect via postgres://${credentials}@db.internal:5432/app`)
    expect(result.redacted).toBe(true)
    expect(result.text).not.toContain('hunter2pass')
  })

  it('redacts an explicit key: value assignment whose value also matches a known shape', () => {
    const keyId = join('AKIA', 'ABCDEFGHIJKLMNOP')
    const result = redactMemoryContent(`api_key: ${keyId}`)
    expect(result.redacted).toBe(true)
    const finding = result.findings[0]
    expect(finding?.confidence).toBe('confirmed')
  })
})

describe('redactMemoryContent — true negatives (ordinary prose)', () => {
  it('does not redact a sentence that mentions "key" without an attached value', () => {
    const input = 'the API key is stored in `.env`'
    const result = redactMemoryContent(input)
    expect(result.redacted).toBe(false)
    expect(result.text).toBe(input)
    expect(result.findings).toEqual([])
  })

  it('does not redact words that merely contain "key" as a substring', () => {
    const input = 'the monkey ate a turkey sandwich near the keyboard'
    const result = redactMemoryContent(input)
    expect(result.redacted).toBe(false)
    expect(result.text).toBe(input)
  })

  it('does not redact ordinary project facts mentioning security concepts', () => {
    const input = 'we rotate secrets quarterly and store tokens in the vault, never in git'
    const result = redactMemoryContent(input)
    expect(result.redacted).toBe(false)
    expect(result.text).toBe(input)
  })

  it('does not redact a plain sentence with a colon unrelated to credentials', () => {
    const input = 'summary: the migration finished without incident'
    const result = redactMemoryContent(input)
    expect(result.redacted).toBe(false)
    expect(result.text).toBe(input)
  })
})

describe('redactMemoryContent — fail-closed negative control', () => {
  /**
   * Mandatory fail-closed control: a value that follows a sensitive
   * key-name assignment but matches no known secret shape must still be
   * withheld, not guessed safe. This is the exact failure mode
   * `@deepseek-ai/dsh-settings`'s `redactSecrets` documents as an open gap
   * (`settings-wire-redaction` TODO) that this package exists to avoid
   * repeating. Verified by temporarily weakening `src/classify.ts` to
   * guess safe on an unrecognized shape (observed this test fail) and
   * restoring the real implementation (observed this test pass) — see the
   * task report for both raw command outputs.
   */
  it('withholds an unclassifiable-but-plausibly-sensitive value rather than passing it through', () => {
    const result = redactMemoryContent('internal_token: qx7-plausible-but-unshaped-9f2')
    expect(result.redacted).toBe(true)
    expect(result.text).not.toContain('qx7-plausible-but-unshaped-9f2')
    expect(result.findings[0]?.confidence).toBe('ambiguous')
  })
})
