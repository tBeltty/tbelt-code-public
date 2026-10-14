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

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  'header.more': 'Περισσότερες ενέργειες',
  'menu.download': 'Λήψη αρχείου καταγραφής συνεδρίας',
  'menu.feedback': 'Σχόλια',
  'dialog.preparingTitle': 'Εξαγωγή συνεδρίας',
  'dialog.preparingDescription': 'Προετοιμασία αρχείου ZIP με αυτή τη συνεδρία, τις υποσυνεδρίες και τα συνημμένα της.',
  'dialog.successTitle': 'Η λήψη της συνεδρίας ξεκίνησε',
  'dialog.successDescription': 'Το πρόγραμμα περιήγησης κατεβάζει το ZIP της συνεδρίας.',
  'dialog.errorTitle': 'Η εξαγωγή της συνεδρίας απέτυχε',
  'dialog.close': 'Κλείσιμο',
  'dialog.commandFailed': 'Δεν ήταν δυνατή η έναρξη της εξαγωγής της συνεδρίας.',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked complete against the English key set. */
export const fr = {
  'header.more': 'Plus d’actions',
  'menu.download': 'Télécharger le journal de session',
  'menu.feedback': 'Avis',
  'dialog.preparingTitle': 'Exportation de la session',
  'dialog.preparingDescription': 'Préparation d’un fichier ZIP contenant cette session, ses sous-sessions et ses pièces jointes.',
  'dialog.successTitle': 'Téléchargement de la session lancé',
  'dialog.successDescription': 'Le navigateur télécharge le ZIP de la session.',
  'dialog.errorTitle': 'Échec de l’exportation de la session',
  'dialog.close': 'Fermer',
  'dialog.commandFailed': 'Impossible de lancer l’exportation de la session.',
} satisfies Record<keyof typeof en, string>

/** Stable locale keys consumed by the shared modal. */
export type SessionLogDownloadKey = keyof typeof en
