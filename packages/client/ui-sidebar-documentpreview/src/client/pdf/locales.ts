import { zoomEn, zoomEs, zoomEl, zoomFr } from '../zoom/locales.ts'

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

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  ...zoomEl,
  title: 'PDF',
  pageImage: 'Σελίδα PDF {page}',
  loading: 'Απόδοση εγγράφου...',
  rendering: 'Απόδοση σελίδας…',
  failed: 'Δεν είναι δυνατή η εμφάνιση του PDF: {message}',
  password: 'Αυτό το PDF απαιτεί κωδικό πρόσβασης· οι προεπισκοπήσεις με προστασία κωδικού δεν υποστηρίζονται.',
  workerFailed: 'Η διεργασία απόδοσης PDF δεν μπόρεσε να συνεχίσει. Δοκιμάστε ξανά.',
  unsupported: 'Η προεπισκόπηση PDF απαιτεί το πλήρες περιεχόμενο του αρχείου.',
  retry: 'Επανάληψη',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked complete against the English key set. */
export const fr = {
  ...zoomFr,
  title: 'PDF',
  pageImage: 'Page {page} du PDF',
  loading: 'Rendu du document...',
  rendering: 'Rendu de la page…',
  failed: 'Impossible d’afficher le PDF\u00a0: {message}',
  password: 'Ce PDF nécessite un mot de passe\u00a0; les aperçus protégés par mot de passe ne sont pas pris en charge.',
  workerFailed: 'Le processus de rendu du PDF n’a pas pu continuer. Veuillez réessayer.',
  unsupported: 'L’aperçu du PDF nécessite le contenu complet du fichier.',
  retry: 'Réessayer',
} satisfies Record<keyof typeof en, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** PDF page, loading, and failure messages. */
    sidebarPdf: PdfLocaleKey
  }
}
