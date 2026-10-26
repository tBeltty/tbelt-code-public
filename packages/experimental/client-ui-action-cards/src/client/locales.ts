/** English card frame, fallback and tool-row copy. */
export const en = {
  expandBrief: 'Show more', collapseBrief: 'Show less',
  dismiss: 'Not now', dismissed: 'Dismissed', replaced: 'Replaced',
  unavailable: 'This action is unavailable. Check the plugin in Plugins.',
  transport: 'Could not confirm the result. Reconnect and check the card before retrying.',
  'row.title': 'Action card', 'row.preparing': 'Preparing a card', 'row.running': 'Proposing',
  'row.ok': 'Proposed', 'row.error': 'Not shown', 'row.stopped': 'Interrupted', 'row.inspect': 'Inspect call',
} satisfies Record<string, string>

/** Keys shared by every dictionary. */
export type ActionCardKey = keyof typeof en

/** Spanish card frame, fallback and tool-row copy. */
export const es: Record<ActionCardKey, string> = {
  expandBrief: 'Mostrar más', collapseBrief: 'Mostrar menos',
  dismiss: 'Ahora no', dismissed: 'Descartado', replaced: 'Reemplazado',
  unavailable: 'Esta acción no está disponible. Revisa el complemento en Complementos.',
  transport: 'No se pudo confirmar el resultado. Vuelve a conectarte y revisa la tarjeta antes de reintentar.',
  'row.title': 'Tarjeta de acción', 'row.preparing': 'Preparando una tarjeta', 'row.running': 'Proponiendo',
  'row.ok': 'Propuesto', 'row.error': 'No se mostró', 'row.stopped': 'Interrumpido', 'row.inspect': 'Inspeccionar llamada',
}

/** Greek card frame, fallback and tool-row copy. */
export const el: Record<ActionCardKey, string> = {
  expandBrief: 'Εμφάνιση περισσότερων', collapseBrief: 'Εμφάνιση λιγότερων',
  dismiss: 'Όχι τώρα', dismissed: 'Απορρίφθηκε', replaced: 'Αντικαταστάθηκε',
  unavailable: 'Αυτή η ενέργεια δεν είναι διαθέσιμη. Ελέγξτε το πρόσθετο στα Πρόσθετα.',
  transport: 'Δεν ήταν δυνατή η επιβεβαίωση του αποτελέσματος. Επανασυνδεθείτε και ελέγξτε την κάρτα πριν προσπαθήσετε ξανά.',
  'row.title': 'Κάρτα ενέργειας', 'row.preparing': 'Προετοιμασία κάρτας', 'row.running': 'Πρόταση σε εξέλιξη',
  'row.ok': 'Προτάθηκε', 'row.error': 'Δεν εμφανίστηκε', 'row.stopped': 'Διακόπηκε', 'row.inspect': 'Επιθεώρηση κλήσης',
}

/** French card frame, fallback and tool-row copy. */
export const fr: Record<ActionCardKey, string> = {
  expandBrief: 'Afficher plus', collapseBrief: 'Afficher moins',
  dismiss: 'Pas maintenant', dismissed: 'Ignoré', replaced: 'Remplacé',
  unavailable: "Cette action n'est pas disponible. Vérifiez le plugin dans Plugins.",
  transport: 'Impossible de confirmer le résultat. Reconnectez-vous et vérifiez la carte avant de réessayer.',
  'row.title': "Carte d'action", 'row.preparing': "Préparation d'une carte", 'row.running': 'Proposition en cours',
  'row.ok': 'Proposé', 'row.error': 'Non affiché', 'row.stopped': 'Interrompu', 'row.inspect': "Inspecter l'appel",
}
