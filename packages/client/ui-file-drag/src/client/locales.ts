/** English file drag failure copy. */
export const en = { failed: 'Drag failed. Try again.' } satisfies Record<string, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** File transfer failure feedback. */
    fileDrag: keyof typeof en
  }
}

/** Spanish dictionary, checked against the English keys. */
export const es = { failed: 'Error al arrastrar. Intentar otra vez.' } satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked against the English keys. */
export const el = { failed: 'Η μεταφορά απέτυχε. Δοκιμάστε ξανά.' } satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = { failed: 'Le glissement a échoué. Essayer à nouveau.' } satisfies Record<keyof typeof en, string>
