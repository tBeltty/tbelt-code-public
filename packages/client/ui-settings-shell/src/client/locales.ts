/** Locale bundles for the shell executor's settings page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the page renders. */
export type ShellSettingsLocaleKey =
  | 'title' | 'description'
  | 'timeoutMs' | 'timeoutMsHint' | 'maxOutputBytes' | 'maxOutputBytesHint'
  | 'overridden' | 'reset' | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'saveFailed' | 'invalidNumber'

/** English copy. */
export const en = {
  title: 'Shell',
  description: 'Limit how long each command may run and how much it may output.',
  timeoutMs: 'Command timeout (ms)',
  timeoutMsHint: 'How long one command may run before it is terminated.',
  maxOutputBytes: 'Output cap per stream (bytes)',
  maxOutputBytesHint: 'Output beyond this spills to a temporary file rather than being lost.',
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  invalidNumber: 'Enter a number, or leave blank to use the default.',
} satisfies Record<string, string>

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: ShellSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}

/** Spanish dictionary, checked against the English keys. */
export const es = {
  title: 'Shell',
  description: 'Limita cuánto puede durar cada comando y cuánta salida puede producir.',
  timeoutMs: 'Tiempo límite del comando (ms)',
  timeoutMsHint: 'Cuánto puede ejecutarse un comando antes de que se termine.',
  maxOutputBytes: 'Límite de salida por flujo (bytes)',
  maxOutputBytesHint: 'La salida que supere este límite pasa a un archivo temporal en lugar de perderse.',
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
  title: 'Κέλυφος',
  description: 'Περιορίστε πόση ώρα μπορεί να τρέχει κάθε εντολή και πόση έξοδο μπορεί να παράγει.',
  timeoutMs: 'Χρονικό όριο εντολής (ms)',
  timeoutMsHint: 'Πόση ώρα μπορεί να τρέχει μία εντολή πριν τερματιστεί.',
  maxOutputBytes: 'Όριο εξόδου ανά ροή (byte)',
  maxOutputBytesHint: 'Η έξοδος πέρα από αυτό το όριο γράφεται σε προσωρινό αρχείο αντί να χάνεται.',
  overridden: 'Παρακαμφθέν',
  reset: 'Επαναφορά στην προεπιλογή',
  readOnly: 'Αυτή η εγκατάσταση αποθηκεύει τις ρυθμίσεις μόνο για ανάγνωση.',
  unavailable: 'Αυτό το πρόσθετο δεν έχει φορτωθεί, επομένως δεν μπορεί να ρυθμιστεί αυτή τη στιγμή.',
  save: 'Αποθήκευση',
  saving: 'Αποθήκευση…',
  saveFailed: 'Η εγκατάσταση δεν δέχτηκε αυτές τις τιμές· αφέθηκαν για να τις διορθώσετε.',
  invalidNumber: 'Εισαγάγετε αριθμό ή αφήστε το κενό για να χρησιμοποιηθεί η προεπιλογή.',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  title: 'Shell',
  description: 'Limitez la durée d’exécution de chaque commande et le volume de sortie qu’elle peut produire.',
  timeoutMs: 'Délai d’expiration des commandes (ms)',
  timeoutMsHint: 'Durée pendant laquelle une commande peut s’exécuter avant d’être interrompue.',
  maxOutputBytes: 'Plafond de sortie par flux (octets)',
  maxOutputBytesHint: 'Au-delà, la sortie est écrite dans un fichier temporaire au lieu d’être perdue.',
  overridden: 'Remplacé',
  reset: 'Rétablir la valeur par défaut',
  readOnly: 'Ce déploiement stocke les paramètres en lecture seule.',
  unavailable: 'Ce plugin n’est pas chargé\u00a0: il ne peut pas être configuré pour le moment.',
  save: 'Enregistrer',
  saving: 'Enregistrement…',
  saveFailed: 'Le déploiement n’a pas accepté ces valeurs\u00a0; elles ont été laissées pour que vous les corrigiez.',
  invalidNumber: 'Saisissez un nombre, ou laissez vide pour utiliser la valeur par défaut.',
} satisfies Record<keyof typeof en, string>
