/** `workflowRun` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'workflowRun'

/** English dictionary (same key set). */
export const en = {
  'run.title': '{name}',
  'run.members.one': '{count} member',
  'run.members.other': '{count} members',
  'run.empty': 'No members started',
  'phase.unassigned': 'Unphased',
  'phase.empty': 'Empty phase name',
  'statusCount.running': 'Running {count}',
  'statusCount.completed': 'Completed {count}',
  'statusCount.failed': 'Failed {count}',
  'statusCount.cancelled': 'Cancelled {count}',
  'statusCount.interrupted': 'Interrupted {count}',
  'member.empty': 'Empty member name',
  'member.open': 'Open {name}',
  'status.running': 'Running',
  'status.completed': 'Completed',
  'status.failed': 'Failed',
  'status.cancelled': 'Cancelled',
  'status.interrupted': 'Interrupted',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'run.title': '{name}',
  'run.members.one': '{count} miembro',
  'run.members.other': '{count} miembros',
  'run.empty': 'Ningún miembro ha empezado',
  'phase.unassigned': 'Sin fase',
  'phase.empty': 'Nombre de fase vacío',
  'statusCount.running': 'En ejecución {count}',
  'statusCount.completed': 'Completados {count}',
  'statusCount.failed': 'Fallidos {count}',
  'statusCount.cancelled': 'Cancelados {count}',
  'statusCount.interrupted': 'Interrumpidos {count}',
  'member.empty': 'Nombre de miembro vacío',
  'member.open': 'Abrir {name}',
  'status.running': 'En ejecución',
  'status.completed': 'Completado',
  'status.failed': 'Fallido',
  'status.cancelled': 'Cancelado',
  'status.interrupted': 'Interrumpido',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  'run.title': '{name}',
  'run.members.one': '{count} μέλος',
  'run.members.other': '{count} μέλη',
  'run.empty': 'Δεν ξεκίνησε κανένα μέλος',
  'phase.unassigned': 'Χωρίς φάση',
  'phase.empty': 'Κενό όνομα φάσης',
  'statusCount.running': 'Σε εκτέλεση {count}',
  'statusCount.completed': 'Ολοκληρώθηκαν {count}',
  'statusCount.failed': 'Απέτυχαν {count}',
  'statusCount.cancelled': 'Ακυρώθηκαν {count}',
  'statusCount.interrupted': 'Διακόπηκαν {count}',
  'member.empty': 'Κενό όνομα μέλους',
  'member.open': 'Άνοιγμα του {name}',
  'status.running': 'Σε εκτέλεση',
  'status.completed': 'Ολοκληρώθηκε',
  'status.failed': 'Απέτυχε',
  'status.cancelled': 'Ακυρώθηκε',
  'status.interrupted': 'Διακόπηκε',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked complete against the English key set. */
export const fr = {
  'run.title': '{name}',
  'run.members.one': '{count} membre',
  'run.members.other': '{count} membres',
  'run.empty': 'Aucun membre démarré',
  'phase.unassigned': 'Sans phase',
  'phase.empty': 'Nom de phase vide',
  'statusCount.running': 'En cours\u00a0: {count}',
  'statusCount.completed': 'Terminés\u00a0: {count}',
  'statusCount.failed': 'Échecs\u00a0: {count}',
  'statusCount.cancelled': 'Annulés\u00a0: {count}',
  'statusCount.interrupted': 'Interrompus\u00a0: {count}',
  'member.empty': 'Nom de membre vide',
  'member.open': 'Ouvrir {name}',
  'status.running': 'En cours',
  'status.completed': 'Terminé',
  'status.failed': 'Échec',
  'status.cancelled': 'Annulé',
  'status.interrupted': 'Interrompu',
} satisfies Record<keyof typeof en, string>

/** Union of this namespace's dictionary keys. */
export type WorkflowRunKey = keyof typeof en
