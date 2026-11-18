/** Locale-owned copy the connector account surfaces share; each registrant's own text arrives from the Host. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Dictionary namespace of the shared account copy. */
export const NS = 'connectorAccount'

/** English dictionary and key source. */
export const en = {
  close: 'Close',
  'action.cancel': 'Cancel',
  'activation.later': 'Later',
  'failure.details': 'Diagnostic: {details}',
  'notice.action-failed': 'The action did not finish. Try again.',
}

/** Every key the shared account surfaces translate. */
export type ConnectorAccountKey = keyof typeof en

/** Spanish dictionary. */
export const es: Record<ConnectorAccountKey, string> = {
  close: 'Cerrar',
  'action.cancel': 'Cancelar',
  'activation.later': 'Más tarde',
  'failure.details': 'Diagnóstico: {details}',
  'notice.action-failed': 'La acción no se completó. Inténtelo de nuevo.',
}

/** Greek dictionary. */
export const el: Record<ConnectorAccountKey, string> = {
  close: 'Κλείσιμο',
  'action.cancel': 'Ακύρωση',
  'activation.later': 'Αργότερα',
  'failure.details': 'Διάγνωση: {details}',
  'notice.action-failed': 'Η ενέργεια δεν ολοκληρώθηκε. Δοκιμάστε ξανά.',
}

/** French dictionary. */
export const fr: Record<ConnectorAccountKey, string> = {
  close: 'Fermer',
  'action.cancel': 'Annuler',
  'activation.later': 'Plus tard',
  'failure.details': 'Diagnostic : {details}',
  'notice.action-failed': 'L’action n’a pas abouti. Réessayez.',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    connectorAccount: ConnectorAccountKey
  }
}
