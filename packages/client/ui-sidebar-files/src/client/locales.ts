/**
 * `sidebarFiles` namespace dictionaries, and the namespace's declaration.
 *
 * The failure lines name what the tree could not list, one code each, because a
 * directory that is gone, one outside the workspace, and a path that is not a
 * directory each suggest a different next step.
 *
 * The namespace merge lives with its key set so that any module naming
 * `TranslateNS<'sidebarFiles'>` or `PropsLocale<'sidebarFiles'>` needs only this
 * file, whichever entry a program loads first.
 */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** File-tree type name, guide entry, row states, and failure lines. */
    sidebarFiles: SidebarFilesKey
  }
}

/** Files dictionary key union. */
export type SidebarFilesKey = keyof typeof en

/** English dictionary and key-set source of truth. */
export const en = {
  'shortcut.noSession': 'Select a session first',
  'type.label': 'Files',
  'guide.title': 'Workspace files',
  'guide.description': 'Browse files in this session\'s workspace',
  loading: 'Reading…',
  empty: 'Empty directory',
  truncated: 'Too many entries, showing only some of them.',
  noWorkspace: 'This session has no workspace directory.',
  reload: 'Reload',
  autoRefresh: 'Auto refresh',
  'autoRefresh.enable': 'Enable auto refresh',
  'autoRefresh.disable': 'Disable auto refresh',
  'entry.other': 'Not a file or a directory, so it cannot be opened.',
  'error.notFound': 'That directory is gone. It may have been moved or deleted.',
  'error.outsideWorkspace': 'That directory is outside the workspace, so the sidebar will not read it.',
  'error.notDirectory': 'That is not a directory.',
  'error.unavailable': 'Read failed: {message}',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'shortcut.noSession': 'Selecciona primero una sesión',
  'type.label': 'Archivos',
  'guide.title': 'Archivos del espacio de trabajo',
  'guide.description': 'Explora los archivos del espacio de trabajo de esta sesión',
  loading: 'Leyendo…',
  empty: 'Directorio vacío',
  truncated: 'Hay demasiadas entradas; solo se muestran algunas.',
  noWorkspace: 'Esta sesión no tiene directorio de trabajo.',
  reload: 'Recargar',
  autoRefresh: 'Actualización automática',
  'autoRefresh.enable': 'Activar actualización automática',
  'autoRefresh.disable': 'Desactivar actualización automática',
  'entry.other': 'No es un archivo ni un directorio, así que no se puede abrir.',
  'error.notFound': 'Ese directorio ya no existe. Puede que se haya movido o eliminado.',
  'error.outsideWorkspace': 'Ese directorio está fuera del espacio de trabajo, así que la barra lateral no lo leerá.',
  'error.notDirectory': 'Eso no es un directorio.',
  'error.unavailable': 'Error de lectura: {message}',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  'shortcut.noSession': 'Επιλέξτε πρώτα μια συνεδρία',
  'type.label': 'Αρχεία',
  'guide.title': 'Αρχεία του χώρου εργασίας',
  'guide.description': 'Περιήγηση στα αρχεία του χώρου εργασίας αυτής της συνεδρίας',
  loading: 'Ανάγνωση…',
  empty: 'Κενός φάκελος',
  truncated: 'Υπάρχουν πάρα πολλές καταχωρίσεις· εμφανίζονται μόνο μερικές.',
  noWorkspace: 'Αυτή η συνεδρία δεν έχει φάκελο χώρου εργασίας.',
  reload: 'Επαναφόρτωση',
  autoRefresh: 'Αυτόματη ανανέωση',
  'autoRefresh.enable': 'Ενεργοποίηση αυτόματης ανανέωσης',
  'autoRefresh.disable': 'Απενεργοποίηση αυτόματης ανανέωσης',
  'entry.other': 'Δεν είναι αρχείο ή φάκελος, επομένως δεν μπορεί να ανοιχτεί.',
  'error.notFound': 'Αυτός ο φάκελος δεν υπάρχει πια. Ίσως έχει μετακινηθεί ή διαγραφεί.',
  'error.outsideWorkspace': "Αυτός ο φάκελος βρίσκεται εκτός του χώρου εργασίας, γι' αυτό η πλευρική γραμμή δεν θα τον διαβάσει.",
  'error.notDirectory': 'Αυτό δεν είναι φάκελος.',
  'error.unavailable': 'Η ανάγνωση απέτυχε: {message}',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked complete against the English key set. */
export const fr = {
  'shortcut.noSession': 'Sélectionnez d’abord une session',
  'type.label': 'Fichiers',
  'guide.title': 'Fichiers de l’espace de travail',
  'guide.description': 'Parcourir les fichiers de l’espace de travail de cette session',
  loading: 'Lecture…',
  empty: 'Dossier vide',
  truncated: 'Trop d’entrées, seule une partie est affichée.',
  noWorkspace: 'Cette session n’a pas de dossier d’espace de travail.',
  reload: 'Recharger',
  autoRefresh: 'Actualisation automatique',
  'autoRefresh.enable': 'Activer l’actualisation automatique',
  'autoRefresh.disable': 'Désactiver l’actualisation automatique',
  'entry.other': 'Ni fichier ni dossier\u00a0: il ne peut pas être ouvert.',
  'error.notFound': 'Ce dossier n’existe plus. Il a peut-être été déplacé ou supprimé.',
  'error.outsideWorkspace': 'Ce dossier est en dehors de l’espace de travail\u00a0: la barre latérale ne le lira pas.',
  'error.notDirectory': 'Ce n’est pas un dossier.',
  'error.unavailable': 'Échec de la lecture\u00a0: {message}',
} satisfies Record<keyof typeof en, string>
