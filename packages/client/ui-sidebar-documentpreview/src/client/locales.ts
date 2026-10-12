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

/** Spanish dictionary, checked complete against the English key set. */
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
