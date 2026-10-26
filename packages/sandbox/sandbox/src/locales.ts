/** Locale-owned sandbox approval text; audit inputs remain verbatim. */

/** English escalation messages. */
export const en = {
  escalation: (mode: string, justification: string): string => `Allow this operation with ${mode} permissions: ${justification}`,
} satisfies Record<string, unknown>

/**
 * Build translations for the existing Client localized-text resolver.
 * @param mode - requested sandbox mode.
 * @param justification - raw model justification, preserved in every translation.
 * @returns localized approval text.
 */
export function escalationDisplayReason(mode: string, justification: string): Record<'en' | 'es' | 'el' | 'fr', string> {
  return {
    en: en.escalation(mode, justification),
    es: es.escalation(mode, justification),
    el: el.escalation(mode, justification),
    fr: fr.escalation(mode, justification),
  }
}

/** Spanish dictionary, checked against the English keys. */
export const es = {
  escalation: (mode: string, justification: string): string => `Permitir esta operación con permisos ${mode}: ${justification}`,
} satisfies typeof en

/** Greek dictionary, checked against the English keys. */
export const el = {
  escalation: (mode: string, justification: string): string => `Να επιτραπεί αυτή η λειτουργία με δικαιώματα ${mode}: ${justification}`,
} satisfies typeof en

/** French dictionary, checked against the English keys. */
export const fr = {
  escalation: (mode: string, justification: string): string => `Autoriser cette opération avec les permissions ${mode} : ${justification}`,
} satisfies typeof en
