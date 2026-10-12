/** Shared zoom copy embedded into renderer-owned dictionaries. */

/** Shared English zoom copy. */
export const zoomEn = {
  zoomControls: 'Zoom controls',
  zoomMenu: 'Choose zoom',
  zoomOut: 'Zoom out',
  zoomIn: 'Zoom in',
  zoomFitWidth: 'Fit width',
  zoomValue: '{percent}%',
} satisfies Record<string, string>

/** Spanish counterpart of {@link zoomEn}. */
export const zoomEs = {
  zoomControls: 'Controles de zoom',
  zoomMenu: 'Elegir zoom',
  zoomOut: 'Alejar',
  zoomIn: 'Acercar',
  zoomFitWidth: 'Ajustar al ancho',
  zoomValue: '{percent}%',
} satisfies Record<keyof typeof zoomEn, string>

/** Shared zoom dictionary keys. */
export type ZoomLocaleKey = keyof typeof zoomEn
