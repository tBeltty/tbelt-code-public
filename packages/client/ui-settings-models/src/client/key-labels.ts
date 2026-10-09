/**
 * Copy for the shared API-key control on every Models card.
 * @module @deepseek-ai/dsh-client-ui-settings-models/key-labels
 */
import type { SecretKeyInputLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { en } from './locales.ts'

/**
 * Build the key control's copy from the section's dictionary.
 * @param t - the section's locale reader.
 * @param placeholder - which dictionary entry hints at an empty key field.
 * @returns the labels `SecretKeyInput` renders.
 */
export function keyLabels(
  t: (key: keyof typeof en) => string,
  placeholder: 'keyPlaceholder' | 'keyPlaceholderNative',
): SecretKeyInputLabels {
  return {
    input: t('keyInput'),
    placeholder: t(placeholder),
    configured: t('keyConfigured'),
    replace: t('keyReplace'),
    cancel: t('keyKeep'),
  }
}
