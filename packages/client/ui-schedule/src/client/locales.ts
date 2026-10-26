/**
 * `schedule.catalog` namespace dictionaries: the Session header catalog and the
 * Sidebar row mark with its hover-card task section.
 */
import { frequencyEn, frequencyEs, frequencyEl, frequencyFr } from './frequency-locales.ts'

/** Dictionary namespace owned by this plugin. */
export const NS = 'schedule.catalog'

/** English dictionary and key-set source of truth. */
export const en = {
  'trigger.label': 'Reminders',
  'list.loading': 'Loading reminders…',
  'list.error': 'Could not load reminders.',
  'list.retry': 'Retry',
  'delete.action': 'Delete',
  'delete.pending': 'Deleting…',
  'delete.label': 'Delete reminder: {title}',
  'list.open': 'Open reminder details: {title}',
  'trigger.one': '{count} reminder',
  'trigger.other': '{count} reminders',
  'list.aria': 'Active reminders',
  'list.nextRun': 'Next run',
  'frequency.once': 'Once',
  'frequency.every': 'Every {value} {unit}',
  ...frequencyEn,
  'mark.aria': '{count} scheduled tasks',
  'hover.more': '{count} more',
} satisfies Record<string, string>

/** Key domain of the Schedule catalog namespace. */
export type ScheduleCatalogKey = keyof typeof en

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'trigger.label': 'Recordatorios',
  'list.loading': 'Cargando recordatorios…',
  'list.error': 'No se pudieron cargar los recordatorios.',
  'list.retry': 'Reintentar',
  'delete.action': 'Eliminar',
  'delete.pending': 'Eliminando…',
  'delete.label': 'Eliminar recordatorio: {title}',
  'list.open': 'Abrir detalles del recordatorio: {title}',
  'trigger.one': '{count} recordatorio',
  'trigger.other': '{count} recordatorios',
  'list.aria': 'Recordatorios activos',
  'list.nextRun': 'Próxima ejecución',
  'frequency.once': 'Una vez',
  'frequency.every': 'Cada {value} {unit}',
  ...frequencyEs,
  'mark.aria': '{count} tareas programadas',
  'hover.more': '{count} más',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  'trigger.label': 'Υπενθυμίσεις',
  'list.loading': 'Φόρτωση υπενθυμίσεων…',
  'list.error': 'Δεν ήταν δυνατή η φόρτωση των υπενθυμίσεων.',
  'list.retry': 'Επανάληψη',
  'delete.action': 'Διαγραφή',
  'delete.pending': 'Διαγραφή…',
  'delete.label': 'Διαγραφή υπενθύμισης: {title}',
  'list.open': 'Άνοιγμα λεπτομερειών υπενθύμισης: {title}',
  'trigger.one': '{count} υπενθύμιση',
  'trigger.other': '{count} υπενθυμίσεις',
  'list.aria': 'Ενεργές υπενθυμίσεις',
  'list.nextRun': 'Επόμενη εκτέλεση',
  'frequency.once': 'Μία φορά',
  'frequency.every': 'Κάθε {value} {unit}',
  ...frequencyEl,
  'mark.aria': '{count} προγραμματισμένες εργασίες',
  'hover.more': '{count} ακόμη',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'trigger.label': 'Rappels',
  'list.loading': 'Chargement des rappels…',
  'list.error': 'Impossible de charger les rappels.',
  'list.retry': 'Réessayer',
  'delete.action': 'Supprimer',
  'delete.pending': 'Suppression…',
  'delete.label': 'Supprimer le rappel\u00a0: {title}',
  'list.open': 'Ouvrir les détails du rappel\u00a0: {title}',
  'trigger.one': '{count} rappel',
  'trigger.other': '{count} rappels',
  'list.aria': 'Rappels actifs',
  'list.nextRun': 'Prochaine exécution',
  'frequency.once': 'Une fois',
  'frequency.every': 'Intervalle de {value} {unit}',
  ...frequencyFr,
  'mark.aria': '{count} tâches planifiées',
  'hover.more': '{count} de plus',
} satisfies Record<keyof typeof en, string>
