/** Locale-owned Browser tab copy. */

/** Browser dictionary key union. */
export type SidebarBrowserKey = keyof typeof en

/** English dictionary with the same keys. */
export const en = {
  'type.label': 'Browser',
  'guide.title': 'Browser',
  'guide.description': 'Browse web pages',
  'shortcut.noSession': 'Open a session first',
  'address.placeholder': 'Enter an HTTP(S) address',
  'address.changed': 'URL changed',
  back: 'Back',
  forward: 'Forward',
  reload: 'Reload',
  go: 'Go',
  external: 'Open in system browser',
  'pick.start': 'Pick a page element to send to the agent',
  'pick.cancel': 'Cancel picking an element',
  'pick.dock': 'Picked page elements',
  'pick.remove': 'Remove this element',
  'sandbox.disable': 'Disable sandbox restrictions',
  'sandbox.enable': 'Restore sandbox restrictions',
  'sandbox.warning': 'Sandbox restrictions are disabled; the page can navigate the top-level app and use downloads, modal dialogs, and input locks.',
  start: 'Enter an HTTP(S) address to start browsing',
  loading: 'Opening…',
  'restore.previous': 'Previously opened',
  'restore.action': 'Restore page',
  'error.empty': 'Enter an address.',
  'error.invalid': 'That address is invalid or too long.',
  'error.protocol': 'Only HTTP and HTTPS addresses are supported; use Document Preview for local files.',
  'error.credentials': 'Addresses cannot contain a username or password.',
  'error.application-origin': 'The embedded browser cannot open the tBelt Code application itself.',
  'load.failed': 'The page could not load; reload or open it in the system browser.',
  'load.failed.detail': 'Page load failed ({code}): {description}',
  'address.unknown': 'The page navigated; this carrier cannot read its new URL.',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'type.label': 'Navegador',
  'guide.title': 'Navegador',
  'guide.description': 'Navega por páginas web',
  'shortcut.noSession': 'Abre primero una sesión',
  'address.placeholder': 'Introduce una dirección HTTP(S)',
  'address.changed': 'La URL ha cambiado',
  back: 'Atrás',
  forward: 'Adelante',
  reload: 'Recargar',
  go: 'Ir',
  external: 'Abrir en el navegador del sistema',
  'pick.start': 'Elige un elemento de la página para enviarlo al agente',
  'pick.cancel': 'Cancelar la selección de elemento',
  'pick.dock': 'Elementos de página elegidos',
  'pick.remove': 'Quitar este elemento',
  'sandbox.disable': 'Desactivar las restricciones del sandbox',
  'sandbox.enable': 'Restaurar las restricciones del sandbox',
  'sandbox.warning': 'Las restricciones del sandbox están desactivadas; la página puede navegar por la aplicación principal y usar descargas, diálogos modales y bloqueos de entrada.',
  start: 'Introduce una dirección HTTP(S) para empezar a navegar',
  loading: 'Abriendo…',
  'restore.previous': 'Abierta anteriormente',
  'restore.action': 'Restaurar página',
  'error.empty': 'Introduce una dirección.',
  'error.invalid': 'La dirección no es válida o es demasiado larga.',
  'error.protocol': 'Solo se admiten direcciones HTTP y HTTPS; usa la vista previa de documentos para archivos locales.',
  'error.credentials': 'Las direcciones no pueden incluir usuario ni contraseña.',
  'error.application-origin': 'El navegador integrado no puede abrir la propia aplicación tBelt Code.',
  'load.failed': 'No se pudo cargar la página; recárgala o ábrela en el navegador del sistema.',
  'load.failed.detail': 'Error al cargar la página ({code}): {description}',
  'address.unknown': 'La página ha navegado; este soporte no puede leer su nueva URL.',
} satisfies Record<keyof typeof en, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Sidebar Browser labels, navigation controls, and failures. */
    sidebarBrowser: SidebarBrowserKey
  }
}
