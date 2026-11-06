/** Original-file actions and completion feedback. */

/** File-action dictionary keys. */
export type FileActionKey = keyof typeof en

/** en file-action labels. */
export const en = {
  'menu.finder': 'Show in Finder',
  'menu.reveal': 'Show in folder',
  'menu.saveAs': 'Save as…',
  'menu.copied': 'Copied',
  'menu.copyImage': 'Copy image',
  'menu.download': 'Download',
  'menu.saveFailed': 'Could not save. Check the source and destination, then retry.',
  'menu.copyFailed': 'Could not copy. Check that the content is available, then retry.',
  'menu.saved': 'Saved',
  'menu.downloadStarted': 'Download started',
  'menu.downloaded': 'Download complete',
  'path.revealError': 'Could not show the file location. Try again.',
} satisfies Record<string, string>

/** es file-action labels. */
export const es = {
  'menu.finder': 'Mostrar en Finder',
  'menu.reveal': 'Mostrar en la carpeta',
  'menu.saveAs': 'Guardar como…',
  'menu.copied': 'Copiado',
  'menu.copyImage': 'Copiar imagen',
  'menu.download': 'Descargar',
  'menu.saveFailed': 'No se pudo guardar. Compruebe el origen y el destino e inténtelo de nuevo.',
  'menu.copyFailed': 'No se pudo copiar. Compruebe que el contenido esté disponible e inténtelo de nuevo.',
  'menu.saved': 'Guardado',
  'menu.downloadStarted': 'Descarga iniciada',
  'menu.downloaded': 'Descarga completada',
  'path.revealError': 'No se pudo mostrar la ubicación del archivo. Intentar otra vez.',
} satisfies Record<FileActionKey, string>

/** fr file-action labels. */
export const fr = {
  'menu.finder': 'Afficher dans le Finder',
  'menu.reveal': 'Afficher dans le dossier',
  'menu.saveAs': 'Enregistrer sous…',
  'menu.copied': 'Copié',
  'menu.copyImage': 'Copier l’image',
  'menu.download': 'Télécharger',
  'menu.saveFailed': 'Impossible d’enregistrer. Vérifiez la source et la destination, puis réessayez.',
  'menu.copyFailed': 'Impossible de copier. Vérifiez que le contenu est disponible, puis réessayez.',
  'menu.saved': 'Enregistré',
  'menu.downloadStarted': 'Téléchargement démarré',
  'menu.downloaded': 'Téléchargement terminé',
  'path.revealError': "Impossible d'afficher l'emplacement du fichier. Essayer à nouveau.",
} satisfies Record<FileActionKey, string>

/** Greek file-action labels. */
export const el = {
  'menu.finder': 'Εμφάνιση στο Finder',
  'menu.reveal': 'Εμφάνιση στον φάκελο',
  'menu.saveAs': 'Αποθήκευση ως…',
  'menu.copied': 'Αντιγράφηκε',
  'menu.copyImage': 'Αντιγραφή εικόνας',
  'menu.download': 'Λήψη',
  'menu.saveFailed': 'Η αποθήκευση απέτυχε. Ελέγξτε την πηγή και τον προορισμό και δοκιμάστε ξανά.',
  'menu.copyFailed': 'Η αντιγραφή απέτυχε. Ελέγξτε ότι το περιεχόμενο είναι διαθέσιμο και δοκιμάστε ξανά.',
  'menu.saved': 'Αποθηκεύτηκε',
  'menu.downloadStarted': 'Η λήψη ξεκίνησε',
  'menu.downloaded': 'Η λήψη ολοκληρώθηκε',
  'path.revealError': 'Δεν ήταν δυνατή η εμφάνιση της θέσης του αρχείου. Δοκιμάστε ξανά.',
} satisfies Record<FileActionKey, string>
