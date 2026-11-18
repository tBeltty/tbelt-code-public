/** Locale namespace owned by Session export browser feedback. */
export const NS = 'session-log-download'

/** English Session export strings. */
export const en = {
  'menu.copyMarkdown': 'Copy Session as Markdown',
  'menu.download': 'Download session log',
  'menu.feedback': 'Feedback',
  'toast.copied': 'Session copied as Markdown.',
  'toast.preparationFailed': 'Could not read the Session for copying. Try again.',
  'toast.clipboardFailed': 'Could not write to the clipboard. Check clipboard permission and try again.',
  'dialog.session': 'Session: {sessionId}',
  'dialog.preparingTitle': 'Exporting Session',
  'dialog.preparingDescription': 'Preparing a ZIP containing the selected Session, its sub-Sessions, and attachments.',
  'dialog.successTitle': 'Session download started',
  'dialog.successDescription': 'The browser is downloading the Session ZIP.',
  'dialog.errorTitle': 'Session export failed',
  'dialog.close': 'Close',
  'dialog.commandFailed': 'Could not start the Session export.',
} satisfies Record<string, string>

/** Stable locale keys consumed by the shared modal. */
export type SessionLogDownloadKey = keyof typeof en

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'menu.copyMarkdown': 'Copiar sesión como Markdown',
  'menu.download': 'Descargar registro de la sesión',
  'menu.feedback': 'Comentarios',
  'toast.copied': 'Sesión copiada como Markdown.',
  'toast.preparationFailed': 'No se pudo leer la sesión para copiarla. Intentar otra vez.',
  'toast.clipboardFailed': 'No se pudo escribir en el portapapeles. Verifique los permisos del portapapeles e inténtelo nuevamente.',
  'dialog.session': 'Sesión: {sessionId}',
  'dialog.preparingTitle': 'Exportando la sesión',
  'dialog.preparingDescription': 'Preparando un ZIP con la sesión seleccionada, sus subsesiones y sus adjuntos.',
  'dialog.successTitle': 'Descarga de la sesión iniciada',
  'dialog.successDescription': 'El navegador está descargando el ZIP de la sesión.',
  'dialog.errorTitle': 'Falló la exportación de la sesión',
  'dialog.close': 'Cerrar',
  'dialog.commandFailed': 'No se pudo iniciar la exportación de la sesión.',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  'menu.copyMarkdown': 'Αντιγραφή συνεδρίας ως Markdown',
  'menu.download': 'Λήψη αρχείου καταγραφής συνεδρίας',
  'menu.feedback': 'Σχόλια',
  'toast.copied': 'Η συνεδρία αντιγράφηκε ως Markdown.',
  'toast.preparationFailed': 'Δεν ήταν δυνατή η ανάγνωση της συνεδρίας για αντιγραφή. Δοκιμάστε ξανά.',
  'toast.clipboardFailed': 'Δεν ήταν δυνατή η εγγραφή στο πρόχειρο. Ελέγξτε την άδεια πρόχειρου και δοκιμάστε ξανά.',
  'dialog.session': 'Συνεδρία: {sessionId}',
  'dialog.preparingTitle': 'Εξαγωγή συνεδρίας',
  'dialog.preparingDescription': 'Προετοιμασία αρχείου ZIP με την επιλεγμένη συνεδρία, τις υποσυνεδρίες και τα συνημμένα της.',
  'dialog.successTitle': 'Η λήψη της συνεδρίας ξεκίνησε',
  'dialog.successDescription': 'Το πρόγραμμα περιήγησης κατεβάζει το ZIP της συνεδρίας.',
  'dialog.errorTitle': 'Η εξαγωγή της συνεδρίας απέτυχε',
  'dialog.close': 'Κλείσιμο',
  'dialog.commandFailed': 'Δεν ήταν δυνατή η έναρξη της εξαγωγής της συνεδρίας.',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'menu.copyMarkdown': 'Copier la session sous Markdown',
  'menu.download': 'Télécharger le journal de session',
  'menu.feedback': 'Avis',
  'toast.copied': 'Session copiée sous le nom Markdown.',
  'toast.preparationFailed': 'Impossible de lire la session pour la copier. Essayer à nouveau.',
  'toast.clipboardFailed': "Impossible d'écrire dans le presse-papiers. Vérifiez l'autorisation du presse-papiers et réessayez.",
  'dialog.session': 'Session : {sessionId}',
  'dialog.preparingTitle': 'Exportation de la session',
  'dialog.preparingDescription': 'Préparation d’un fichier ZIP contenant la session sélectionnée, ses sous-sessions et ses pièces jointes.',
  'dialog.successTitle': 'Téléchargement de la session lancé',
  'dialog.successDescription': 'Le navigateur télécharge le ZIP de la session.',
  'dialog.errorTitle': 'Échec de l’exportation de la session',
  'dialog.close': 'Fermer',
  'dialog.commandFailed': 'Impossible de lancer l’exportation de la session.',
} satisfies Record<keyof typeof en, string>
