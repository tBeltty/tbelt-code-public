/**
 * Judgement of a typed API key before it is checked with the provider.
 * @module @deepseek-ai/dsh-presentation-settings/api-key
 */

/**
 * Printable ASCII without space: the character set `normalizeApiKey` in `@deepseek-ai/dsh-llm` accepts. Presenters
 * depend on no Host package, so the rule is repeated here; keep the two in step.
 */
const LEGAL_API_KEY = /^[\x21-\x7E]+$/

/**
 * A pasted `NAME=value` environment line. The name must be upper-case so `sk-` keys break at the hyphen, and the `=`
 * must be followed by something other than another `=` so base64 padding on an all-upper-case key is not read as an
 * assignment.
 */
const ENV_LINE = /^[A-Z][A-Z0-9_]*=[^=]/

/** Why a typed key cannot be saved: it is blank, or it has a character a key cannot hold. */
export type ApiKeyFailureKey = 'keyBlank' | 'keyIllegalCharacters'

/** Whether a value is wrapped in one matching pair of quotes. */
function isQuoted(value: string): boolean {
  const first = value[0]
  if (first !== '"' && first !== '\'' && first !== '`') return false
  return value.length > 1 && value.endsWith(first)
}

/**
 * Judge a typed key.
 * @param draft - the input as typed, untrimmed.
 * @returns the failure, or undefined when the key may be submitted. An empty input is not a failure, because a card
 * with a stored key opens empty and empty means keep it; an input of only whitespace is one.
 */
export function apiKeyFailure(draft: string): ApiKeyFailureKey | undefined {
  if (draft.length === 0) return undefined
  const value = draft.trim()
  if (value.length === 0) return 'keyBlank'
  if (ENV_LINE.test(value) || isQuoted(value)) return 'keyIllegalCharacters'
  if (!LEGAL_API_KEY.test(value)) return 'keyIllegalCharacters'
  return undefined
}
