/** Locale-owned application-access approval messages. */

/** English application-access messages. */
export const en = {
  question: 'Allow computer use to launch, read, capture and control this application?',
  detail: 'Session access lasts until tBelt Code restarts or computer use is disabled.',
  approve: 'Allow for this session',
} satisfies Record<string, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  question: '¿Permitir que Computer Use inicie, lea, capture y controle esta aplicación?',
  detail: 'El acceso de esta sesión dura hasta que se reinicie tBelt Code o se desactive Computer Use.',
  approve: 'Permitir durante esta sesión',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked against the English keys. */
export const el = {
  question: 'Να επιτραπεί στη χρήση υπολογιστή να εκκινήσει, να διαβάσει, να καταγράψει και να ελέγξει αυτήν την εφαρμογή;',
  detail: 'Η πρόσβαση συνεδρίας διαρκεί έως ότου γίνει επανεκκίνηση του tBelt Code ή απενεργοποιηθεί η χρήση υπολογιστή.',
  approve: 'Να επιτρέπεται για αυτήν τη συνεδρία',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  question: 'Autoriser Computer Use à lancer, lire, capturer et contrôler cette application ?',
  detail: 'L’autorisation de cette session reste valable jusqu’au redémarrage de tBelt Code ou à la désactivation de Computer Use.',
  approve: 'Autoriser pour cette session',
} satisfies Record<keyof typeof en, string>

/** Display translations resolved by the Client; wire choices stay unchanged. */
export const applicationAccessDisplay = {
  question: { en: en.question, es: es.question, el: el.question, fr: fr.question },
  detail: { en: en.detail, es: es.detail, el: el.detail, fr: fr.detail },
  approve: { en: en.approve, es: es.approve, el: el.approve, fr: fr.approve },
}
