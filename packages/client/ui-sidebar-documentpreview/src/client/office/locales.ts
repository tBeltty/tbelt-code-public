/** Office preview copy and Host render configuration guidance. */

/** Office preview locale keys. */
export type OfficePreviewKey = keyof typeof en

/** English dictionary and key-set source of truth. */
export const en = {
  title: 'Office document',
  loading: 'Rendering document...',
  retry: 'Retry',
  viewMissingFonts: 'Missing fonts: {count}. Click to view.',
  missingFontsTitle: 'Missing fonts',
  missingFontsDescription: 'These fonts are unavailable for this preview. Text and layout may differ from the original document.',
  missingFontsCount: 'Fonts: {count}',
  closeDetails: 'Close font details',
  unavailable: 'Office previews are unavailable. Enable the document preview service on the computer running tBelt Code.',
  invalid: 'This Office file cannot be previewed. It may be damaged, password protected, or have the wrong extension.',
  tooLarge: 'The Office file or converted PDF exceeds the preview size limit. Reduce the file size or adjust the preview configuration.',
  failed: 'Office conversion did not produce a usable PDF. Check the file and try again.',
  timeout: 'Office conversion timed out. Try again.',
  busy: 'Office preview is busy. Try again shortly.',
  changed: 'The file changed while being read. Reopen the preview.',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  title: 'Documento de Office',
  loading: 'Renderizando documento...',
  retry: 'Reintentar',
  viewMissingFonts: 'Fuentes que faltan: {count}. Haz clic para verlas.',
  missingFontsTitle: 'Fuentes que faltan',
  missingFontsDescription: 'Estas fuentes no están disponibles para esta vista previa. El texto y el diseño pueden diferir del documento original.',
  missingFontsCount: 'Fuentes: {count}',
  closeDetails: 'Cerrar detalles de fuentes',
  unavailable: 'Las vistas previas de Office no están disponibles. Activa el servicio de vista previa de documentos en el equipo donde se ejecuta tBelt Code.',
  invalid: 'No se puede previsualizar este archivo de Office. Puede estar dañado, protegido con contraseña o tener una extensión incorrecta.',
  tooLarge: 'El archivo de Office o el PDF convertido supera el límite de tamaño de la vista previa. Reduce el tamaño del archivo o ajusta la configuración de la vista previa.',
  failed: 'La conversión de Office no produjo un PDF utilizable. Comprueba el archivo e inténtalo de nuevo.',
  timeout: 'Se agotó el tiempo de la conversión de Office. Inténtalo de nuevo.',
  busy: 'La vista previa de Office está ocupada. Inténtalo de nuevo en unos instantes.',
  changed: 'El archivo cambió mientras se leía. Vuelve a abrir la vista previa.',
} satisfies Record<keyof typeof en, string>
