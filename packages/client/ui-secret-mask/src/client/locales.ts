/** `secretMask` dictionaries for the per-credential reveal control. */

import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Dictionary namespace owned by this plugin. */
export const NS = 'secretMask'

/** English dictionary (the key-set source of truth). */
export const en = {
  'secret.reveal': 'Show secret',
  'secret.hide': 'Hide secret',
} satisfies Record<string, string>

/** The secretMask namespace key union. */
export type SecretMaskKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Accessible names of the control that reveals one masked credential. */
    secretMask: SecretMaskKey
  }
}

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'secret.reveal': 'Mostrar secreto',
  'secret.hide': 'Ocultar secreto',
} satisfies Record<SecretMaskKey, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  'secret.reveal': 'Εμφάνιση μυστικού',
  'secret.hide': 'Απόκρυψη μυστικού',
} satisfies Record<SecretMaskKey, string>

/** French dictionary, checked complete against the English key set. */
export const fr = {
  'secret.reveal': 'Afficher le secret',
  'secret.hide': 'Masquer le secret',
} satisfies Record<SecretMaskKey, string>
