/** Context-menu operation feedback, separate from plugin display metadata. */
export const dictionaries = {
  en: { back: 'Back', failed: 'Could not complete the action. Try again.' },
  es: { back: 'Atrás', failed: 'No se pudo completar la acción. Inténtelo de nuevo.' },
  el: { back: 'Πίσω', failed: 'Δεν ήταν δυνατή η ολοκλήρωση της ενέργειας. Δοκιμάστε ξανά.' },
  fr: { back: 'Retour', failed: 'Impossible de terminer l’action. Réessayez.' },
} satisfies Record<string, { back: string; failed: string }>
