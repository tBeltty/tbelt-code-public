/** Locale bundles for the agent loop's settings page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the page renders. */
export type AgentLoopSettingsLocaleKey =
  | 'title' | 'description' | 'maxParallel' | 'maxParallelHint'
  | 'overridden' | 'reset' | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'saveFailed' | 'invalidNumber'

/** English copy. */
export const en = {
  title: 'Agent loop',
  description: 'Control how the Agent dispatches tool calls.',
  maxParallel: 'Parallel tool calls',
  maxParallelHint: 'Upper bound on parallel-safe calls running at once within one step.',
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  invalidNumber: 'Enter a number, or leave blank to use the default.',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  title: 'Bucle del agente',
  description: 'Controla cómo el agente despacha las llamadas a herramientas.',
  maxParallel: 'Llamadas a herramientas en paralelo',
  maxParallelHint: 'Límite superior de llamadas seguras en paralelo que se ejecutan a la vez en un mismo paso.',
  overridden: 'Modificado',
  reset: 'Restablecer el valor predeterminado',
  readOnly: 'Esta instalación guarda los ajustes en modo de solo lectura.',
  unavailable: 'Este plugin no está cargado, así que ahora no se puede configurar.',
  save: 'Guardar',
  saving: 'Guardando…',
  saveFailed: 'La instalación no aceptó estos valores; se dejaron para que los corrijas.',
  invalidNumber: 'Introduce un número, o déjalo en blanco para usar el valor predeterminado.',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  title: 'Βρόχος πράκτορα',
  description: 'Ελέγξτε πώς διανέμει ο πράκτορας τις κλήσεις εργαλείων.',
  maxParallel: 'Παράλληλες κλήσεις εργαλείων',
  maxParallelHint: 'Ανώτατο όριο παράλληλα ασφαλών κλήσεων που εκτελούνται ταυτόχρονα σε ένα βήμα.',
  overridden: 'Παρακαμφθέν',
  reset: 'Επαναφορά στην προεπιλογή',
  readOnly: 'Αυτή η εγκατάσταση αποθηκεύει τις ρυθμίσεις μόνο για ανάγνωση.',
  unavailable: 'Αυτό το πρόσθετο δεν έχει φορτωθεί, επομένως δεν μπορεί να ρυθμιστεί αυτή τη στιγμή.',
  save: 'Αποθήκευση',
  saving: 'Αποθήκευση…',
  saveFailed: 'Η εγκατάσταση δεν δέχτηκε αυτές τις τιμές· αφέθηκαν για να τις διορθώσετε.',
  invalidNumber: 'Εισαγάγετε αριθμό ή αφήστε το κενό για να χρησιμοποιηθεί η προεπιλογή.',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked complete against the English key set. */
export const fr = {
  title: 'Boucle de l’agent',
  description: 'Contrôle la façon dont l’agent distribue les appels d’outils.',
  maxParallel: 'Appels d’outils parallèles',
  maxParallelHint: 'Limite supérieure d’appels sans risque en parallèle exécutés simultanément au sein d’une étape.',
  overridden: 'Remplacé',
  reset: 'Rétablir la valeur par défaut',
  readOnly: 'Ce déploiement stocke les paramètres en lecture seule.',
  unavailable: 'Ce plugin n’est pas chargé\u00a0: il ne peut pas être configuré pour le moment.',
  save: 'Enregistrer',
  saving: 'Enregistrement…',
  saveFailed: 'Le déploiement n’a pas accepté ces valeurs\u00a0; elles ont été laissées pour que vous les corrigiez.',
  invalidNumber: 'Saisissez un nombre, ou laissez vide pour utiliser la valeur par défaut.',
} satisfies Record<keyof typeof en, string>

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: AgentLoopSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}
