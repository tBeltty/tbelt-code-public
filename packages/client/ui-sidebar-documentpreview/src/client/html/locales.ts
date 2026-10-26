/** Locale-owned HTML implementation name and iframe status text. */

/** HTML renderer dictionary keys. */
export type HtmlPreviewKey = keyof typeof en

/** English dictionary and key-set source of truth. */
export const en = {
  title: 'HTML',
  frame: 'HTML document preview',
  loading: 'Rendering document...',
  failed: 'This HTML document could not be previewed.',
} satisfies Record<string, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** HTML preview selection and status text. */
    documentHtml: HtmlPreviewKey
  }
}

/** Spanish dictionary, checked against the English keys. */
export const es = {
  title: 'HTML',
  frame: 'Vista previa del documento HTML',
  loading: 'Renderizando el documento…',
  failed: 'No se pudo previsualizar este documento HTML.',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  title: 'HTML',
  frame: 'Προεπισκόπηση εγγράφου HTML',
  loading: 'Απόδοση εγγράφου...',
  failed: 'Δεν ήταν δυνατή η προεπισκόπηση αυτού του εγγράφου HTML.',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  title: 'HTML',
  frame: 'Aperçu du document HTML',
  loading: 'Rendu du document...',
  failed: 'Impossible d’afficher l’aperçu de ce document HTML.',
} satisfies Record<keyof typeof en, string>
