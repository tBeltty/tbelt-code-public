/** Markdown implementation labels and primitive chrome. */

/** Markdown namespace keys. */
export type MarkdownPreviewKey = keyof typeof en

/** English dictionary and key-set source of truth. */
export const en = {
  'viewer.label': 'Markdown',
  'code.copy': 'Copy',
  'code.copied': 'Copied',
  'footnotes': 'Footnotes',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'viewer.label': 'Markdown',
  'code.copy': 'Copiar',
  'code.copied': 'Copiado',
  'footnotes': 'Notas al pie',
} satisfies Record<keyof typeof en, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Markdown document renderer and its code/footnote controls. */
    documentMarkdown: MarkdownPreviewKey
  }
}
