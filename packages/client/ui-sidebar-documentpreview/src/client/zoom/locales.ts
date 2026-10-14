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

/** Greek counterpart of {@link zoomEn}. */
export const zoomEl = {
  zoomControls: 'Στοιχεία ελέγχου ζουμ',
  zoomMenu: 'Επιλογή ζουμ',
  zoomOut: 'Σμίκρυνση',
  zoomIn: 'Μεγέθυνση',
  zoomFitWidth: 'Προσαρμογή στο πλάτος',
  zoomValue: '{percent}%',
} satisfies Record<keyof typeof zoomEn, string>

/** French counterpart of {@link zoomEn}. */
export const zoomFr = {
  zoomControls: 'Commandes de zoom',
  zoomMenu: 'Choisir le zoom',
  zoomOut: 'Zoom arrière',
  zoomIn: 'Zoom avant',
  zoomFitWidth: 'Ajuster à la largeur',
  zoomValue: '{percent} %',
} satisfies Record<keyof typeof zoomEn, string>

/** Shared zoom dictionary keys. */
export type ZoomLocaleKey = keyof typeof zoomEn
