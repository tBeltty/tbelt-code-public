/**
 * Words for API key input: what is wrong with a typed key.
 * @module @deepseek-ai/dsh-terminal-views/credentials
 */
import { t } from './copy.ts'

/**
 * Explain a rejected key.
 * @param failure - the reason `dsh-presentation-settings` gives: `keyBlank` for an empty key, anything else for illegal characters.
 * @returns one line for the person.
 */
export function keyProblemText(failure: string): string {
  return t(failure === 'keyBlank' ? 'providers.keyBlank' : 'providers.keyIllegal')
}
