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

/** Union of this namespace's dictionary keys. */
export type WorkflowRunKey = keyof typeof en
