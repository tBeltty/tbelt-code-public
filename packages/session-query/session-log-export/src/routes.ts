/**
 * The absolute pathname the Host registers the export under and the
 * document-relative form the browser addresses.
 */

/** Absolute registration path for the ZIP download route. */
export const SESSION_LOG_EXPORT_PATH = '/api/session.export'

/** Browser-relative form of {@link SESSION_LOG_EXPORT_PATH}. */
export const SESSION_LOG_EXPORT_ROUTE = SESSION_LOG_EXPORT_PATH.slice(1)
