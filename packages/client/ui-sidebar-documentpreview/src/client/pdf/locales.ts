import { zoomEn, zoomEs } from '../zoom/locales.ts'

/** PDF translation keys shared by both dictionaries. */
export type PdfLocaleKey = keyof typeof en

/** English PDF-renderer dictionary. */
export const en = {
  ...zoomEn,
  title: 'PDF',
  pageImage: 'PDF page {page}',
  loading: 'Rendering document...',
  rendering: 'Rendering page…',
  failed: 'Cannot display PDF: {message}',
  password: 'This PDF requires a password; password-protected previews are not supported.',
  workerFailed: 'The PDF rendering process could not continue. Please retry.',
  unsupported: 'PDF preview requires the complete file contents.',
  retry: 'Retry',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  ...zoomEs,
  title: 'PDF',
  pageImage: 'Página {page} del PDF',
  loading: 'Renderizando documento...',
  rendering: 'Renderizando página…',
  failed: 'No se puede mostrar el PDF: {message}',
  password: 'Este PDF requiere contraseña; no se admiten vistas previas de PDF protegidos.',
  workerFailed: 'El proceso de renderizado del PDF no pudo continuar. Inténtalo de nuevo.',
  unsupported: 'La vista previa de PDF necesita el contenido completo del archivo.',
  retry: 'Reintentar',
} satisfies Record<keyof typeof en, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** PDF page, loading, and failure messages. */
    sidebarPdf: PdfLocaleKey
  }
}
