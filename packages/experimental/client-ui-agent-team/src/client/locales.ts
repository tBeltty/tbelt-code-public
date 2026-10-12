/** Agent Teams Web dictionaries. */

/** Locale namespace owned by the Agent Teams Web UI. */
export const NS = 'agent-team'

/** Agent Teams locale key union. */
export type TeamKey = keyof typeof en

/** English dictionary and key-set source of truth. */
export const en = {
  trigger: 'Agent Team',
  loading: 'Loading Team…',
  unavailable: 'Team is unavailable',
  failure: 'Invalid persisted Team record: {message}',
  empty: 'No shared tasks yet. Create them through the conversation.',
  roster: 'Members',
  tasks: 'Shared tasks',
  model: 'Model',
  open: 'Open member conversation',
  current: 'Current chat',
  owner: 'Owner',
  unowned: 'Unowned',
  blockedBy: 'Blocked by',
  writeScopes: 'Write scopes',
  ready: 'Ready',
  blocked: 'Blocked by dependencies',
  'task.expand': 'Show more',
  'task.collapse': 'Show less',
  'memberStatus.running': 'Running',
  'memberStatus.inactive': 'Inactive',
  'memberStatus.provisioning': 'Provisioning',
  'memberStatus.failed': 'Failed',
  'status.pending': 'Pending',
  'status.in_progress': 'In progress',
  'status.completed': 'Completed',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  trigger: 'Equipo de agentes',
  loading: 'Cargando el equipo…',
  unavailable: 'El equipo no está disponible',
  failure: 'Registro de equipo guardado no válido: {message}',
  empty: 'Todavía no hay tareas compartidas. Créalas desde la conversación.',
  roster: 'Miembros',
  tasks: 'Tareas compartidas',
  model: 'Modelo',
  open: 'Abrir la conversación del miembro',
  current: 'Chat actual',
  owner: 'Responsable',
  unowned: 'Sin responsable',
  blockedBy: 'Bloqueada por',
  writeScopes: 'Ámbitos de escritura',
  ready: 'Lista',
  blocked: 'Bloqueada por dependencias',
  'task.expand': 'Mostrar más',
  'task.collapse': 'Mostrar menos',
  'memberStatus.running': 'En ejecución',
  'memberStatus.inactive': 'Inactivo',
  'memberStatus.provisioning': 'Preparándose',
  'memberStatus.failed': 'Con error',
  'status.pending': 'Pendiente',
  'status.in_progress': 'En curso',
  'status.completed': 'Completada',
} satisfies Record<keyof typeof en, string>
