/**
 * `sidebarDocumentPreview` namespace dictionaries.
 *
 * The failure lines are the point of this file: a preview that cannot show a
 * page has to say which of several different things went wrong, and each one
 * suggests a different next step for the reader.
 */

/** Text-preview dictionary key union. */
export type SidebarDocumentPreviewKey = keyof typeof en

/** English dictionary and key-set source of truth. */
export const en = {
  loading: 'Rendering document...',
  loadMore: 'Load more',
  changed: 'The file has changed, showing the previous content.',
  reloadNow: 'Reload',
  reload: 'Read the file again',
  autoRefresh: 'Auto refresh',
  'autoRefresh.enable': 'Enable auto refresh',
  'autoRefresh.disable': 'Disable auto refresh',
  'wrap.enable': 'Turn on line wrap',
  'wrap.disable': 'Turn off line wrap',
  'wrap.aria': 'Line wrap',
  openWith: 'Open with',
  'viewer.text': 'Plain text',
  resourceUnavailable: 'The file resource service is unavailable.',
  rendererUnavailable: 'The {name} preview is unavailable.',
  unsupportedFile: 'Preview is not available for this file type yet.',
  'error.notFound': 'File not found. It may have been moved or deleted.',
  'error.tooLarge': 'This page exceeds the {limit} limit and cannot be read.',
  'error.notText': 'Preview is not available for this file type yet.',
  'error.notRegularFile': 'Not a regular file, nothing to display.',
  'error.unavailable': 'Read failed: {message}',
  retry: 'Retry',
} satisfies Record<string, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  loading: 'Renderizando documento...',
  loadMore: 'Cargar más',
  changed: 'El archivo ha cambiado; se muestra el contenido anterior.',
  reloadNow: 'Recargar',
  reload: 'Volver a leer el archivo',
  autoRefresh: 'Actualización automática',
  'autoRefresh.enable': 'Activar actualización automática',
  'autoRefresh.disable': 'Desactivar actualización automática',
  'wrap.enable': 'Activar ajuste de línea',
  'wrap.disable': 'Desactivar ajuste de línea',
  'wrap.aria': 'Ajuste de línea',
  openWith: 'Abrir con',
  'viewer.text': 'Texto sin formato',
  resourceUnavailable: 'El servicio de recursos de archivos no está disponible.',
  rendererUnavailable: 'La vista previa de {name} no está disponible.',
  unsupportedFile: 'Aún no hay vista previa para este tipo de archivo.',
  'error.notFound': 'Archivo no encontrado. Puede que se haya movido o eliminado.',
  'error.tooLarge': 'Esta página supera el límite de {limit} y no se puede leer.',
  'error.notText': 'Aún no hay vista previa para este tipo de archivo.',
  'error.notRegularFile': 'No es un archivo normal; no hay nada que mostrar.',
  'error.unavailable': 'Error de lectura: {message}',
  retry: 'Reintentar',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  loading: 'Απόδοση εγγράφου...',
  loadMore: 'Φόρτωση περισσότερων',
  changed: 'Το αρχείο άλλαξε· εμφανίζεται το προηγούμενο περιεχόμενο.',
  reloadNow: 'Επαναφόρτωση',
  reload: 'Νέα ανάγνωση του αρχείου',
  autoRefresh: 'Αυτόματη ανανέωση',
  'autoRefresh.enable': 'Ενεργοποίηση αυτόματης ανανέωσης',
  'autoRefresh.disable': 'Απενεργοποίηση αυτόματης ανανέωσης',
  'wrap.enable': 'Ενεργοποίηση αναδίπλωσης γραμμών',
  'wrap.disable': 'Απενεργοποίηση αναδίπλωσης γραμμών',
  'wrap.aria': 'Αναδίπλωση γραμμών',
  openWith: 'Άνοιγμα με',
  'viewer.text': 'Απλό κείμενο',
  resourceUnavailable: 'Η υπηρεσία πόρων αρχείων δεν είναι διαθέσιμη.',
  rendererUnavailable: 'Η προεπισκόπηση {name} δεν είναι διαθέσιμη.',
  unsupportedFile: 'Η προεπισκόπηση δεν είναι ακόμη διαθέσιμη για αυτόν τον τύπο αρχείου.',
  'error.notFound': 'Το αρχείο δεν βρέθηκε. Ίσως έχει μετακινηθεί ή διαγραφεί.',
  'error.tooLarge': 'Αυτή η σελίδα υπερβαίνει το όριο {limit} και δεν μπορεί να διαβαστεί.',
  'error.notText': 'Η προεπισκόπηση δεν είναι ακόμη διαθέσιμη για αυτόν τον τύπο αρχείου.',
  'error.notRegularFile': 'Δεν είναι κανονικό αρχείο, δεν υπάρχει τίποτα προς εμφάνιση.',
  'error.unavailable': 'Η ανάγνωση απέτυχε: {message}',
  retry: 'Επανάληψη',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  loading: 'Rendu du document...',
  loadMore: 'Charger plus',
  changed: 'Le fichier a changé\u00a0; le contenu précédent est affiché.',
  reloadNow: 'Recharger',
  reload: 'Relire le fichier',
  autoRefresh: 'Actualisation automatique',
  'autoRefresh.enable': 'Activer l’actualisation automatique',
  'autoRefresh.disable': 'Désactiver l’actualisation automatique',
  'wrap.enable': 'Activer le retour à la ligne',
  'wrap.disable': 'Désactiver le retour à la ligne',
  'wrap.aria': 'Retour à la ligne',
  openWith: 'Ouvrir avec',
  'viewer.text': 'Texte brut',
  resourceUnavailable: 'Le service de ressources de fichiers est indisponible.',
  rendererUnavailable: 'L’aperçu {name} est indisponible.',
  unsupportedFile: 'L’aperçu n’est pas encore disponible pour ce type de fichier.',
  'error.notFound': 'Fichier introuvable. Il a peut-être été déplacé ou supprimé.',
  'error.tooLarge': 'Cette page dépasse la limite de {limit} et ne peut pas être lue.',
  'error.notText': 'L’aperçu n’est pas encore disponible pour ce type de fichier.',
  'error.notRegularFile': 'Ce n’est pas un fichier ordinaire, rien à afficher.',
  'error.unavailable': 'Échec de la lecture\u00a0: {message}',
  retry: 'Réessayer',
} satisfies Record<keyof typeof en, string>
