/** Locale-owned approval text; reviewer reasons remain verbatim in every language. */

/** English approval messages. */
export const en = {
  denied: 'Auto review denied this call.',
  deniedWithReason: (reason: string): string => `Auto review denied this call: ${reason}`,
} satisfies Record<string, unknown>

/**
 * Build all display translations without translating the reviewer's raw reason.
 * @param reason - optional reviewer explanation.
 * @returns text for the Client's localized-text resolver.
 */
export function deniedDisplayReason(reason?: string): Record<'en' | 'es' | 'el' | 'fr', string> {
  return reason === undefined
    ? { en: en.denied, es: es.denied, el: el.denied, fr: fr.denied }
    : {
      en: en.deniedWithReason(reason),
      es: es.deniedWithReason(reason),
      el: el.deniedWithReason(reason),
      fr: fr.deniedWithReason(reason),
    }
}

/** Spanish dictionary, checked against the English keys. */
export const es = {
  denied: 'Auto review ha denegado esta llamada.',
  deniedWithReason: (reason: string): string => `Auto review ha denegado esta llamada: ${reason}`,
} satisfies typeof en

/** Greek dictionary, checked against the English keys. */
export const el = {
  denied: 'Η αυτόματη αναθεώρηση απέρριψε αυτήν την κλήση.',
  deniedWithReason: (reason: string): string => `Η αυτόματη αναθεώρηση απέρριψε αυτήν την κλήση: ${reason}`,
} satisfies typeof en

/** French dictionary, checked against the English keys. */
export const fr = {
  denied: 'Auto review a refusé cet appel.',
  deniedWithReason: (reason: string): string => `Auto review a refusé cet appel : ${reason}`,
} satisfies typeof en
