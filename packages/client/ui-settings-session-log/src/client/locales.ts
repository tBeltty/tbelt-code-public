/** Copy for the API Session-log upload preference. */
export const en = {
  title: 'Upload Session Log when using the official model API',
  description: 'Help improve DeepSeek models and products.',
  saved: 'Preference saved',
  failed: 'Could not save preference',
} satisfies Record<string, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  title: 'Subir el registro de sesión al usar la API oficial del modelo',
  description: 'Ayuda a mejorar los modelos y productos de DeepSeek.',
  saved: 'Preferencia guardada',
  failed: 'No se pudo guardar la preferencia',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  title: 'Μεταφόρτωση του αρχείου καταγραφής συνεδρίας κατά τη χρήση του επίσημου API μοντέλου',
  description: 'Βοηθήστε να βελτιωθούν τα μοντέλα και τα προϊόντα DeepSeek.',
  saved: 'Η προτίμηση αποθηκεύτηκε',
  failed: 'Δεν ήταν δυνατή η αποθήκευση της προτίμησης',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  title: 'Téléverser le journal de session lors de l’utilisation de l’API officielle du modèle',
  description: 'Aidez à améliorer les modèles et les produits DeepSeek.',
  saved: 'Préférence enregistrée',
  failed: 'Impossible d’enregistrer la préférence',
} satisfies Record<keyof typeof en, string>
