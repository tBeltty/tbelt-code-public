/** `settings.permission` namespace dictionaries (the Permission row's copy). */

/** Locale namespace shared by both current-session permission pickers. */
export const PERMISSION_ACCESS_NS = 'permission.access'

/** The settings.permission namespace key union. */
export type PermissionSettingsKey = keyof typeof en

/** English dictionary and key-set source of truth. */
export const en = {
  'title': 'Permission',
  'description': 'Choose the default permission mode for new sessions',
  'loading': 'Loading',
  'unavailable': 'Unavailable',
  'preset.readOnly': 'Read Only',
  'preset.workspaceWrite': 'Workspace Write',
  'preset.fullAccess': 'Full access',
  'hint.readOnly': 'Reads files but cannot change them.',
  'hint.workspaceWrite': 'Edits files inside the workspace and asks before going outside it.',
  'hint.fullAccess': 'Full file access without confirmation prompts.',
  'confirm.title': 'Enable Full access?',
  'confirm.description': 'Full access lets new sessions reduce confirmation steps and perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust subsequent tasks.',
  'confirm.acknowledge': 'I understand the risks and want to continue',
  'confirm.cancel': 'Cancel',
  'confirm.enable': 'Enable Full access',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'title': 'Permisos',
  'description': 'Elige el modo de permisos predeterminado para las sesiones nuevas',
  'loading': 'Cargando',
  'unavailable': 'No disponible',
  'preset.readOnly': 'Solo lectura',
  'preset.workspaceWrite': 'Escritura en el espacio de trabajo',
  'preset.fullAccess': 'Acceso total',
  'hint.readOnly': 'Lee archivos, pero no puede modificarlos.',
  'hint.workspaceWrite': 'Edita archivos dentro del espacio de trabajo y pregunta antes de salir de él.',
  'hint.fullAccess': 'Acceso total a los archivos sin pedir confirmación.',
  'confirm.title': '¿Activar el acceso total?',
  'confirm.description': 'El acceso total permite que las sesiones nuevas reduzcan los pasos de confirmación y hagan más acciones directamente, incluidas operaciones sensibles, cambios de archivos o comandos externos. Úsalo solo si confías en las tareas posteriores.',
  'confirm.acknowledge': 'Entiendo los riesgos y quiero continuar',
  'confirm.cancel': 'Cancelar',
  'confirm.enable': 'Activar acceso total',
} satisfies Record<keyof typeof en, string>

/** Current-session popup-gate key union. */
export type PermissionAccessKey = keyof typeof accessEn

/** English dictionary for the current-session popup gate. */
export const accessEn = {
  'mode': 'Access mode, current: {name}',
  'close': 'Close',
  'preset.readOnly': 'Read Only',
  'preset.workspaceWrite': 'Workspace Write',
  'preset.fullAccess': 'Full access',
  'hint.readOnly': 'Reads files but cannot change them.',
  'hint.workspaceWrite': 'Edits files inside the workspace and asks before going outside it.',
  'hint.fullAccess': 'Full file access without confirmation prompts.',
  'confirm.title': 'Enable Full access?',
  'confirm.description': 'Full access reduces confirmation steps and lets the agent perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust the current task.',
  'confirm.acknowledge': 'I understand the risks and want to continue',
  'confirm.cancel': 'Cancel',
  'confirm.enable': 'Enable Full access',
  'auto.label': 'Auto review',
  'auto.badge': 'EXP',
  'auto.description': 'Run without a sandbox after an experimental same-model review of every native tool call and PTC inner call.',
  'auto.confirm.title': 'Enable Auto review (experimental)?',
  'auto.confirm.description': 'Auto review runs without a sandbox. Before every native tool call and PTC inner call, the same model as the current agent reviews whether to allow it; you approve or reject each call it denies. This feature is experimental, can falsely allow or deny actions, and uses additional tokens.',
  'auto.confirm.acknowledge': 'I understand these risks and want to continue',
  'auto.confirm.enable': 'Enable Auto review',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const accessEs = {
  'mode': 'Modo de acceso, actual: {name}',
  'close': 'Cerrar',
  'preset.readOnly': 'Solo lectura',
  'preset.workspaceWrite': 'Escritura en el espacio de trabajo',
  'preset.fullAccess': 'Acceso total',
  'hint.readOnly': 'Lee archivos, pero no puede modificarlos.',
  'hint.workspaceWrite': 'Edita archivos dentro del espacio de trabajo y pregunta antes de salir de él.',
  'hint.fullAccess': 'Acceso total a los archivos sin pedir confirmación.',
  'confirm.title': '¿Activar el acceso total?',
  'confirm.description': 'El acceso total reduce los pasos de confirmación y permite que el agente haga más acciones directamente, incluidas operaciones sensibles, cambios de archivos o comandos externos. Úsalo solo si confías en la tarea actual.',
  'confirm.acknowledge': 'Entiendo los riesgos y quiero continuar',
  'confirm.cancel': 'Cancelar',
  'confirm.enable': 'Activar acceso total',
  'auto.label': 'Revisión automática',
  'auto.badge': 'EXP',
  'auto.description': 'Se ejecuta sin sandbox tras una revisión experimental, con el mismo modelo, de cada llamada a herramientas nativas y cada llamada interna de PTC.',
  'auto.confirm.title': '¿Activar la revisión automática (experimental)?',
  'auto.confirm.description': 'La revisión automática se ejecuta sin sandbox. Antes de cada llamada a herramientas nativas y cada llamada interna de PTC, el mismo modelo que usa el agente actual revisa si debe permitirla; tú apruebas o rechazas cada llamada que deniegue. Esta función es experimental, puede permitir o denegar acciones por error y consume tokens adicionales.',
  'auto.confirm.acknowledge': 'Entiendo estos riesgos y quiero continuar',
  'auto.confirm.enable': 'Activar revisión automática',
} satisfies Record<keyof typeof accessEn, string>
