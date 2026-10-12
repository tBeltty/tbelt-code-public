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

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  title: 'HTML',
  frame: 'Vista previa del documento HTML',
  loading: 'Renderizando el documento…',
  failed: 'No se pudo previsualizar este documento HTML.',
} satisfies Record<keyof typeof en, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** HTML preview selection and status text. */
    documentHtml: HtmlPreviewKey
  }
}
