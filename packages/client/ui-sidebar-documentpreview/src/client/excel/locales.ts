/** Locale-owned Excel preview controls and parser feedback. */

/** Excel preview dictionary keys. */
export type ExcelPreviewKey = keyof typeof en

/** English Excel preview copy. */
export const en = {
  title: 'Spreadsheet', language: 'en', loading: 'Rendering document...',
  invalid: 'This spreadsheet could not be opened. Check its format, contents, or password protection.',
  tooLarge: 'This workbook exceeds the preview size limit.', timeout: 'Opening this workbook timed out. Try a smaller file.',
  encoding: 'This text encoding could not be read. Save the file as UTF-8 or UTF-16 with a BOM and retry.',
  formulaWarning: 'This workbook contains formulas. Displayed results may be missing or inaccurate.',
  unsupportedNotice: 'This preview does not support {features} in this workbook. Open it in a system application for the full experience.',
  charts: 'charts', images: 'images', shapes: 'shapes', conditionalFormatting: 'conditional formatting', featureSeparator: ', ',
  retry: 'Retry',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  title: 'Hoja de cálculo',
  language: 'en',
  loading: 'Renderizando documento...',
  invalid: 'No se pudo abrir esta hoja de cálculo. Comprueba su formato, su contenido o si tiene contraseña.',
  tooLarge: 'Este libro supera el límite de tamaño de la vista previa.',
  timeout: 'Se agotó el tiempo al abrir este libro. Prueba con un archivo más pequeño.',
  encoding: 'No se pudo leer esta codificación de texto. Guarda el archivo como UTF-8 o UTF-16 con BOM e inténtalo de nuevo.',
  formulaWarning: 'Este libro contiene fórmulas. Los resultados mostrados pueden faltar o ser inexactos.',
  unsupportedNotice: 'Esta vista previa no admite {features} de este libro. Ábrelo en una aplicación del sistema para verlo completo.',
  charts: 'gráficos',
  images: 'imágenes',
  shapes: 'formas',
  conditionalFormatting: 'formato condicional',
  featureSeparator: ', ',
  retry: 'Reintentar',
} satisfies Record<keyof typeof en, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Excel preview status and third-party locale selection. */
    sidebarExcel: ExcelPreviewKey
  }
}
