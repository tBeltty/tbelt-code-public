/** Context-menu operation feedback, separate from plugin display metadata. */
export const dictionaries = {
  en: { failed: 'Could not complete the action. Try again.' },
  es: { failed: 'No se pudo completar la acción. Inténtelo de nuevo.' },
  el: { failed: 'Δεν ήταν δυνατή η ολοκλήρωση της ενέργειας. Δοκιμάστε ξανά.' },
  fr: { failed: 'Impossible de terminer l’action. Réessayez.' },
} satisfies Record<string, { failed: string }>
