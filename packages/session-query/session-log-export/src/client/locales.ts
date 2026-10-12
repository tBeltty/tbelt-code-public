/** Locale namespace owned by Session export browser feedback. */
export const NS = 'session-log-download'

/** English Session export strings. */
export const en = {
  'header.more': 'More actions',
  'menu.download': 'Download session log',
  'menu.feedback': 'Feedback',
  'dialog.preparingTitle': 'Exporting Session',
  'dialog.preparingDescription': 'Preparing a ZIP containing this Session, its sub-Sessions, and attachments.',
  'dialog.successTitle': 'Session download started',
  'dialog.successDescription': 'The browser is downloading the Session ZIP.',
  'dialog.errorTitle': 'Session export failed',
  'dialog.close': 'Close',
  'dialog.commandFailed': 'Could not start the Session export.',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'header.more': 'Más acciones',
  'menu.download': 'Descargar registro de la sesión',
  'menu.feedback': 'Comentarios',
  'dialog.preparingTitle': 'Exportando la sesión',
  'dialog.preparingDescription': 'Preparando un ZIP con esta sesión, sus subsesiones y sus adjuntos.',
  'dialog.successTitle': 'Descarga de la sesión iniciada',
  'dialog.successDescription': 'El navegador está descargando el ZIP de la sesión.',
  'dialog.errorTitle': 'Falló la exportación de la sesión',
  'dialog.close': 'Cerrar',
  'dialog.commandFailed': 'No se pudo iniciar la exportación de la sesión.',
} satisfies Record<keyof typeof en, string>

/** Stable locale keys consumed by the shared modal. */
export type SessionLogDownloadKey = keyof typeof en
