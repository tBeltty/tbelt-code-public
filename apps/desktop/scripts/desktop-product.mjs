/**
 * Shared packaging identity for Desktop release artifacts: the app's display
 * name (`.app`/`.exe` name, electron-builder `productName`) and the slug its
 * installer and update-feed artifact file names derive from.
 */

export const PRODUCT_NAME = 'tBelt Code'
export const PRODUCT_ARTIFACT_SLUG = 'tbelt-code'
/** URL scheme the installed app registers with the OS; `tbelt-code://open` focuses its window. */
export const PRODUCT_URL_SCHEME = 'tbelt-code'
