/** Copy owned by the sidebar terminal feature. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    sidebarTerminal: SidebarTerminalKey
  }
}

/** Keys of the sidebar terminal copy. */
export type SidebarTerminalKey = keyof typeof en

/** English terminal copy. */
export const en = {
  'shortcut.noSession': 'Select a session first',
  recoveryFailed: 'Terminal recovery failed: {message}', retryRecovery: 'Retry terminal recovery',
  shell: 'Choose shell', shellLoading: 'Loading shells…', shellEmpty: 'No shells available', description: 'Run commands in the Session workspace',
  title: 'Terminal', new: 'New terminal', loading: 'Reading terminal environment…', creating: 'Starting…',
  connecting: 'Connecting…', disconnected: 'Disconnected.', reconnect: 'Reconnect',
  readonly: 'This view is read-only.', control: 'Take control',
  closed: 'Terminal closed.', exited: 'Process exited ({code})', failed: 'Terminal error: {message}',
  rename: 'Terminal name', unavailable: 'Unavailable', retry: 'Retry',
  cleanupFailed: 'Terminal “{title}” could not be ended: {message}',
  missingTerminal: 'This terminal no longer exists. Open a new terminal.',
  inputFull: 'The input buffer is full. Reconnect and try again.',
  attachmentEnded: 'The terminal connection ended. Reconnect to continue.',
  invalidOutput: 'The terminal screen could not be received. Reconnect to recover it.',
  terminalLimit: 'The terminal limit has been reached. Close unused terminals and try again. Exited terminals also count toward the limit.',
  'run.action': 'Run in terminal', 'run.again': 'Run again', 'run.show': 'Show terminal',
  'run.running': 'Running in the terminal…', 'run.stopped': 'Process stopped', 'run.reported': 'Output sent to the chat',
  'run.failed': 'Could not run: {message}',
  'run.report.intro': 'I ran this command in the terminal:', 'run.report.exit': 'Exit code: {code}',
  'run.report.stopped': 'The command was stopped before it finished.', 'run.report.failed': 'The terminal failed: {message}',
  'run.report.empty': 'No output.', 'run.report.truncated': '(Earlier output omitted)',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'shortcut.noSession': 'Selecciona primero una sesión',
  recoveryFailed: 'Error al recuperar el terminal: {message}',
  retryRecovery: 'Reintentar recuperación del terminal',
  shell: 'Elegir shell',
  shellLoading: 'Cargando shells…',
  shellEmpty: 'No hay shells disponibles',
  description: 'Ejecuta comandos en el espacio de trabajo de la sesión',
  title: 'Terminal',
  new: 'Nuevo terminal',
  loading: 'Leyendo el entorno del terminal…',
  creating: 'Iniciando…',
  connecting: 'Conectando…',
  disconnected: 'Desconectado.',
  reconnect: 'Reconectar',
  readonly: 'Esta vista es de solo lectura.',
  control: 'Tomar el control',
  closed: 'Terminal cerrado.',
  exited: 'El proceso terminó ({code})',
  failed: 'Error del terminal: {message}',
  rename: 'Nombre del terminal',
  unavailable: 'No disponible',
  retry: 'Reintentar',
  cleanupFailed: 'No se pudo terminar el terminal “{title}”: {message}',
  missingTerminal: 'Este terminal ya no existe. Abre uno nuevo.',
  inputFull: 'El búfer de entrada está lleno. Reconecta e inténtalo de nuevo.',
  attachmentEnded: 'Terminó la conexión con el terminal. Reconecta para continuar.',
  invalidOutput: 'No se pudo recibir la pantalla del terminal. Reconecta para recuperarla.',
  terminalLimit: 'Se alcanzó el límite de terminales. Cierra los que no uses e inténtalo de nuevo. Los terminales ya terminados también cuentan para el límite.',
  'run.action': 'Ejecutar en el terminal',
  'run.again': 'Ejecutar de nuevo',
  'run.show': 'Mostrar terminal',
  'run.running': 'Ejecutándose en el terminal…',
  'run.stopped': 'Proceso detenido',
  'run.reported': 'Salida enviada al chat',
  'run.failed': 'No se pudo ejecutar: {message}',
  'run.report.intro': 'Ejecuté este comando en el terminal:',
  'run.report.exit': 'Código de salida: {code}',
  'run.report.stopped': 'El comando se detuvo antes de terminar.',
  'run.report.failed': 'El terminal falló: {message}',
  'run.report.empty': 'Sin salida.',
  'run.report.truncated': '(Salida anterior omitida)',
} satisfies Record<keyof typeof en, string>
