/** `approval` namespace dictionaries. */

/** Approval dictionary key union. */
export type ApprovalKey = keyof typeof en

/** English dictionary and key-set source of truth. */
export const en = {
  waiting: 'Waiting for approval',
  'detail.aria': 'Approval details',
  'need.shell': 'I need permission to run a command',
  'need.edit': 'I need permission to change files in your project',
  'need.read': 'I need permission to read your files or a web page',
  'need.search': 'I need permission to search your project or the web',
  'need.code': 'I need permission to run a program',
  'need.generic': 'I need permission to take an action',
  because: 'Because: {reason}',
  technical: 'Technical details',
  'technical.tool': 'Tool: {toolName}',
  reject: 'Reject',
  allowOnce: 'Allow once',
  allowSession: 'Allow for this session',
  allowMenu: 'More ways to allow',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  waiting: 'Esperando aprobación',
  'detail.aria': 'Detalles de la aprobación',
  'need.shell': 'Necesito permiso para ejecutar un comando',
  'need.edit': 'Necesito permiso para modificar archivos de tu proyecto',
  'need.read': 'Necesito permiso para leer tus archivos o una página web',
  'need.search': 'Necesito permiso para buscar en tu proyecto o en la web',
  'need.code': 'Necesito permiso para ejecutar un programa',
  'need.generic': 'Necesito permiso para realizar una acción',
  because: 'Motivo: {reason}',
  technical: 'Detalles técnicos',
  'technical.tool': 'Herramienta: {toolName}',
  reject: 'Rechazar',
  allowOnce: 'Permitir una vez',
  allowSession: 'Permitir durante esta sesión',
  allowMenu: 'Más formas de permitir',
} satisfies Record<keyof typeof en, string>
