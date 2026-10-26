/** Locale bundles for the web-search settings page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the page renders. */
export type WebSearchSettingsLocaleKey =
  | 'title' | 'description'
  | 'provider' | 'providerHint' | 'noProviders'
  | 'providerExa' | 'providerPerplexity' | 'providerBrave' | 'providerTavily'
  | 'apiKey' | 'apiKeyHint' | 'apiKeySet' | 'apiKeyUnset' | 'apiKeyPlaceholder' | 'apiKeyReplace' | 'apiKeyKeep'
  | 'checking' | 'keyMissing' | 'keyRejected' | 'keyQuota' | 'keyError'
  | 'readOnly' | 'unavailable' | 'save' | 'saving' | 'saveFailed'

/** English copy. */
export const en = {
  title: 'Web search',
  description: 'Choose the search provider the agent uses for current information.',
  provider: 'Search provider',
  providerHint: 'The agent searches only through the provider chosen here. Your key is sent to that provider and nowhere else.',
  noProviders: 'No search provider is installed.',
  providerExa: 'Exa',
  providerPerplexity: 'Perplexity',
  providerBrave: 'Brave',
  providerTavily: 'Tavily',
  apiKey: 'API key',
  apiKeyHint: 'Stored outside the settings file and checked with the provider before saving. Leave blank to keep the current key.',
  apiKeySet: 'API key configured',
  apiKeyUnset: 'No key is configured.',
  apiKeyPlaceholder: 'Enter your API key',
  apiKeyReplace: 'Replace API',
  apiKeyKeep: 'Keep current key',
  checking: 'Checking the key with the provider…',
  keyMissing: 'Add this provider’s API key before saving.',
  keyRejected: 'The provider rejected this key. Nothing was saved.',
  keyQuota: 'The key works, but the provider reports no quota or credit left. It was saved; searches fail until the quota renews.',
  keyError: 'The key could not be checked. Nothing was saved.',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'Web search is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
} satisfies Record<string, string>

/** Locale key naming each shipped provider; another id renders as itself. */
export const PROVIDER_NAMES: Readonly<Record<string, WebSearchSettingsLocaleKey>> = {
  exa: 'providerExa',
  perplexity: 'providerPerplexity',
  brave: 'providerBrave',
  tavily: 'providerTavily',
}

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: WebSearchSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}

/** Spanish dictionary, checked against the English keys. */
export const es = {
  title: 'Búsqueda web',
  description: 'Elige el proveedor de búsqueda que usa el agente para obtener información actual.',
  provider: 'Proveedor de búsqueda',
  providerHint: 'El agente busca solo a través del proveedor elegido aquí. Tu clave se envía a ese proveedor y a nadie más.',
  noProviders: 'No hay ningún proveedor de búsqueda instalado.',
  providerExa: 'Exa',
  providerPerplexity: 'Perplexity',
  providerBrave: 'Brave',
  providerTavily: 'Tavily',
  apiKey: 'Clave de API',
  apiKeyHint: 'Se guarda fuera del archivo de ajustes y se comprueba con el proveedor antes de guardar. Déjala en blanco para conservar la clave actual.',
  apiKeySet: 'Clave de API configurada',
  apiKeyUnset: 'No hay ninguna clave configurada.',
  apiKeyPlaceholder: 'Introduce tu clave de API',
  apiKeyReplace: 'Reemplazar clave',
  apiKeyKeep: 'Conservar la clave actual',
  checking: 'Comprobando la clave con el proveedor…',
  keyMissing: 'Añade la clave de API de este proveedor antes de guardar.',
  keyRejected: 'El proveedor rechazó esta clave. No se guardó nada.',
  keyQuota: 'La clave funciona, pero el proveedor indica que no queda cuota ni saldo. Se guardó; las búsquedas fallarán hasta que se renueve la cuota.',
  keyError: 'No se pudo comprobar la clave. No se guardó nada.',
  readOnly: 'Esta instalación guarda los ajustes en modo de solo lectura.',
  unavailable: 'La búsqueda web no está cargada, así que ahora no se puede configurar.',
  save: 'Guardar',
  saving: 'Guardando…',
  saveFailed: 'La instalación no aceptó estos valores; se dejaron para que los corrijas.',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  title: 'Αναζήτηση στο διαδίκτυο',
  description: 'Επιλέξτε τον πάροχο αναζήτησης που χρησιμοποιεί ο πράκτορας για επίκαιρες πληροφορίες.',
  provider: 'Πάροχος αναζήτησης',
  providerHint: 'Ο πράκτορας κάνει αναζητήσεις μόνο μέσω του παρόχου που επιλέγετε εδώ. Το κλειδί σας στέλνεται σε αυτόν τον πάροχο και πουθενά αλλού.',
  noProviders: 'Δεν είναι εγκατεστημένος κανένας πάροχος αναζήτησης.',
  providerExa: 'Exa',
  providerPerplexity: 'Perplexity',
  providerBrave: 'Brave',
  providerTavily: 'Tavily',
  apiKey: 'Κλειδί API',
  apiKeyHint: 'Αποθηκεύεται εκτός του αρχείου ρυθμίσεων και ελέγχεται με τον πάροχο πριν από την αποθήκευση. Αφήστε το κενό για να κρατήσετε το τρέχον κλειδί.',
  apiKeySet: 'Το κλειδί API έχει ρυθμιστεί',
  apiKeyUnset: 'Δεν έχει ρυθμιστεί κλειδί.',
  apiKeyPlaceholder: 'Εισαγάγετε το κλειδί API σας',
  apiKeyReplace: 'Αντικατάσταση κλειδιού API',
  apiKeyKeep: 'Διατήρηση τρέχοντος κλειδιού',
  checking: 'Έλεγχος του κλειδιού με τον πάροχο…',
  keyMissing: 'Προσθέστε το κλειδί API αυτού του παρόχου πριν αποθηκεύσετε.',
  keyRejected: 'Ο πάροχος απέρριψε αυτό το κλειδί. Δεν αποθηκεύτηκε τίποτα.',
  keyQuota: 'Το κλειδί λειτουργεί, αλλά ο πάροχος αναφέρει ότι δεν απομένει όριο ή πίστωση. Αποθηκεύτηκε· οι αναζητήσεις αποτυγχάνουν μέχρι να ανανεωθεί το όριο.',
  keyError: 'Δεν ήταν δυνατός ο έλεγχος του κλειδιού. Δεν αποθηκεύτηκε τίποτα.',
  readOnly: 'Αυτή η εγκατάσταση αποθηκεύει τις ρυθμίσεις μόνο για ανάγνωση.',
  unavailable: 'Η αναζήτηση στο διαδίκτυο δεν έχει φορτωθεί, επομένως δεν μπορεί να ρυθμιστεί αυτή τη στιγμή.',
  save: 'Αποθήκευση',
  saving: 'Αποθήκευση…',
  saveFailed: 'Η εγκατάσταση δεν δέχτηκε αυτές τις τιμές· αφέθηκαν για να τις διορθώσετε.',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  title: 'Recherche web',
  description: 'Choisissez le fournisseur de recherche que l’agent utilise pour obtenir des informations récentes.',
  provider: 'Fournisseur de recherche',
  providerHint: 'L’agent ne recherche que via le fournisseur choisi ici. Votre clé n’est envoyée qu’à ce fournisseur et nulle part ailleurs.',
  noProviders: 'Aucun fournisseur de recherche n’est installé.',
  providerExa: 'Exa',
  providerPerplexity: 'Perplexity',
  providerBrave: 'Brave',
  providerTavily: 'Tavily',
  apiKey: 'Clé API',
  apiKeyHint: 'Stockée en dehors du fichier de paramètres et vérifiée auprès du fournisseur avant l’enregistrement. Laissez vide pour conserver la clé actuelle.',
  apiKeySet: 'Clé API configurée',
  apiKeyUnset: 'Aucune clé n’est configurée.',
  apiKeyPlaceholder: 'Saisissez votre clé API',
  apiKeyReplace: 'Remplacer la clé API',
  apiKeyKeep: 'Conserver la clé actuelle',
  checking: 'Vérification de la clé auprès du fournisseur…',
  keyMissing: 'Ajoutez la clé API de ce fournisseur avant d’enregistrer.',
  keyRejected: 'Le fournisseur a rejeté cette clé. Rien n’a été enregistré.',
  keyQuota: 'La clé fonctionne, mais le fournisseur indique qu’il ne reste ni quota ni crédit. Elle a été enregistrée\u00a0; les recherches échouent tant que le quota n’est pas renouvelé.',
  keyError: 'Impossible de vérifier la clé. Rien n’a été enregistré.',
  readOnly: 'Ce déploiement stocke les paramètres en lecture seule.',
  unavailable: 'La recherche web n’est pas chargée\u00a0: elle ne peut pas être configurée pour le moment.',
  save: 'Enregistrer',
  saving: 'Enregistrement…',
  saveFailed: 'Le déploiement n’a pas accepté ces valeurs\u00a0; elles ont été laissées pour que vous les corrigiez.',
} satisfies Record<keyof typeof en, string>
