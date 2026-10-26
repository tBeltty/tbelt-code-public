/** Locale bundles for the Subagent settings page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the page renders. */
export type SubagentSettingsLocaleKey =
  | 'overridden' | 'reset' | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'saveFailed'
  | 'subagentTitle' | 'subagentDescription' | 'subagentLimitsTitle'
  | 'subagentMaxDepth'
  | 'subagentDepthHelpLabel' | 'subagentDepthHelp'
  | 'subagentDepthZero' | 'subagentDepthOne' | 'subagentDepthOverride'
  | 'subagentMaxActive'
  | 'subagentCapacityHelpLabel' | 'subagentCapacityHelp'
  | 'subagentDepthInvalid'
  | 'subagentCapacityInvalid'
  | 'subagentModelSelectionTitle'
  | 'subagentModelSelectionToggle' | 'subagentModelSelectionChoose' | 'subagentModelSelectionAllowed'
  | 'subagentModelSelectionLoading' | 'subagentModelSelectionLoadFailed' | 'subagentModelSelectionRetry'
  | 'subagentModelSelectionPartial' | 'subagentModelSelectionUnavailable'
  | 'subagentModelSelectionUnavailableGroup' | 'subagentModelSelectionEmpty'
  | 'subagentModelSelectionRequired' | 'subagentModelSelectionConflict' | 'subagentModelSelectionOff'

/** English copy. */
export const en = {
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  subagentTitle: 'Subagent',
  subagentDescription: 'Set Subagent recursion depth, count, and models.',
  subagentLimitsTitle: 'Limits',
  subagentMaxDepth: 'Maximum recursion depth',
  subagentDepthHelpLabel: 'About maximum recursion depth',
  subagentDepthHelp: 'Limits how many levels of Subagents an Agent can create.',
  subagentDepthZero: 'Disable Subagents',
  subagentDepthOne: 'Only the main Agent can create Subagents',
  subagentDepthOverride: 'If a tool defines its own maximum recursion depth, that setting takes precedence.',
  subagentMaxActive: 'Subagent parallelism limit',
  subagentCapacityHelpLabel: 'About the Subagent parallelism limit',
  subagentCapacityHelp: 'Total live Subagents under the same main Agent, across all recursion levels. The main Agent is excluded. New start requests are rejected when the limit is reached.',
  subagentDepthInvalid: 'Enter a whole number of 0 or more.',
  subagentCapacityInvalid: 'Enter a whole number of 1 or more.',
  subagentModelSelectionTitle: 'Model selection',
  subagentModelSelectionToggle: 'Allow agents to choose models for Subagents',
  subagentModelSelectionChoose: 'When enabled, agents can choose a provider, model, and reasoning effort for each Subagent from the authorized models below. Applies only to new sessions.',
  subagentModelSelectionAllowed: 'Models agents may choose',
  subagentModelSelectionLoading: 'Loading models…',
  subagentModelSelectionLoadFailed: 'Models could not be loaded.',
  subagentModelSelectionRetry: 'Retry',
  subagentModelSelectionPartial: 'Some model providers could not be loaded; saved choices remain removable.',
  subagentModelSelectionUnavailable: 'Currently unavailable',
  subagentModelSelectionUnavailableGroup: 'Saved but currently unavailable',
  subagentModelSelectionEmpty: 'No model provider currently advertises a model.',
  subagentModelSelectionRequired: 'Select at least one model before saving.',
  subagentModelSelectionConflict: 'Settings changed elsewhere. Discard your draft and try again.',
  subagentModelSelectionOff: 'Subagents use configured defaults or inherit the parent agent\'s model. Saved model choices are retained.',
} satisfies Record<string, string>

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: SubagentSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}

/** Spanish dictionary, checked against the English keys. */
export const es = {
  overridden: 'Modificado',
  reset: 'Restablecer el valor predeterminado',
  readOnly: 'Esta instalación guarda los ajustes en modo de solo lectura.',
  unavailable: 'Este plugin no está cargado, así que ahora no se puede configurar.',
  save: 'Guardar',
  saving: 'Guardando…',
  saveFailed: 'La instalación no aceptó estos valores; se dejaron para que los corrijas.',
  subagentTitle: 'Subagentes',
  subagentDescription: 'Define la profundidad de recursión, el número y los modelos de los subagentes.',
  subagentLimitsTitle: 'Límites',
  subagentMaxDepth: 'Profundidad máxima de recursión',
  subagentDepthHelpLabel: 'Acerca de la profundidad máxima de recursión',
  subagentDepthHelp: 'Limita cuántos niveles de subagentes puede crear un agente.',
  subagentDepthZero: 'Desactivar subagentes',
  subagentDepthOne: 'Solo el agente principal puede crear subagentes',
  subagentDepthOverride: 'Si una herramienta define su propia profundidad máxima de recursión, esa configuración tiene prioridad.',
  subagentMaxActive: 'Límite de paralelismo de subagentes',
  subagentCapacityHelpLabel: 'Acerca del límite de paralelismo de subagentes',
  subagentCapacityHelp: 'Total de subagentes activos bajo un mismo agente principal, en todos los niveles de recursión. El agente principal no cuenta. Las solicitudes de inicio nuevas se rechazan cuando se alcanza el límite.',
  subagentDepthInvalid: 'Introduce un número entero igual o mayor que 0.',
  subagentCapacityInvalid: 'Introduce un número entero igual o mayor que 1.',
  subagentModelSelectionTitle: 'Selección de modelo',
  subagentModelSelectionToggle: 'Permitir que los agentes elijan modelos para los subagentes',
  subagentModelSelectionChoose: 'Al activarlo, los agentes pueden elegir proveedor, modelo y esfuerzo de razonamiento para cada subagente entre los modelos autorizados de abajo. Solo se aplica a las sesiones nuevas.',
  subagentModelSelectionAllowed: 'Modelos que los agentes pueden elegir',
  subagentModelSelectionLoading: 'Cargando modelos…',
  subagentModelSelectionLoadFailed: 'No se pudieron cargar los modelos.',
  subagentModelSelectionRetry: 'Reintentar',
  subagentModelSelectionPartial: 'Algunos proveedores de modelos no se pudieron cargar; las opciones guardadas se pueden quitar igualmente.',
  subagentModelSelectionUnavailable: 'No disponible por ahora',
  subagentModelSelectionUnavailableGroup: 'Guardados pero no disponibles por ahora',
  subagentModelSelectionEmpty: 'Ningún proveedor de modelos ofrece un modelo por ahora.',
  subagentModelSelectionRequired: 'Selecciona al menos un modelo antes de guardar.',
  subagentModelSelectionConflict: 'Los ajustes cambiaron en otro lugar. Descarta tu borrador e inténtalo de nuevo.',
  subagentModelSelectionOff: 'Los subagentes usan los valores predeterminados configurados o heredan el modelo del agente principal. Las opciones de modelo guardadas se conservan.',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  overridden: 'Παρακαμφθέν',
  reset: 'Επαναφορά στην προεπιλογή',
  readOnly: 'Αυτή η εγκατάσταση αποθηκεύει τις ρυθμίσεις μόνο για ανάγνωση.',
  unavailable: 'Αυτό το πρόσθετο δεν έχει φορτωθεί, επομένως δεν μπορεί να ρυθμιστεί αυτή τη στιγμή.',
  save: 'Αποθήκευση',
  saving: 'Αποθήκευση…',
  saveFailed: 'Η εγκατάσταση δεν δέχτηκε αυτές τις τιμές· αφέθηκαν για να τις διορθώσετε.',
  subagentTitle: 'Υποπράκτορας',
  subagentDescription: 'Ορίστε το βάθος αναδρομής, τον αριθμό και τα μοντέλα των υποπρακτόρων.',
  subagentLimitsTitle: 'Όρια',
  subagentMaxDepth: 'Μέγιστο βάθος αναδρομής',
  subagentDepthHelpLabel: 'Σχετικά με το μέγιστο βάθος αναδρομής',
  subagentDepthHelp: 'Περιορίζει πόσα επίπεδα υποπρακτόρων μπορεί να δημιουργήσει ένας πράκτορας.',
  subagentDepthZero: 'Απενεργοποίηση υποπρακτόρων',
  subagentDepthOne: 'Μόνο ο κύριος πράκτορας μπορεί να δημιουργεί υποπράκτορες',
  subagentDepthOverride: 'Αν ένα εργαλείο ορίζει δικό του μέγιστο βάθος αναδρομής, αυτή η ρύθμιση υπερισχύει.',
  subagentMaxActive: 'Όριο παραλληλίας υποπρακτόρων',
  subagentCapacityHelpLabel: 'Σχετικά με το όριο παραλληλίας υποπρακτόρων',
  subagentCapacityHelp: 'Συνολικός αριθμός ενεργών υποπρακτόρων κάτω από τον ίδιο κύριο πράκτορα, σε όλα τα επίπεδα αναδρομής. Ο κύριος πράκτορας δεν υπολογίζεται. Όταν επιτευχθεί το όριο, τα νέα αιτήματα εκκίνησης απορρίπτονται.',
  subagentDepthInvalid: 'Εισαγάγετε ακέραιο αριθμό 0 ή μεγαλύτερο.',
  subagentCapacityInvalid: 'Εισαγάγετε ακέραιο αριθμό 1 ή μεγαλύτερο.',
  subagentModelSelectionTitle: 'Επιλογή μοντέλου',
  subagentModelSelectionToggle: 'Να επιτρέπεται στους πράκτορες να επιλέγουν μοντέλα για τους υποπράκτορες',
  subagentModelSelectionChoose: 'Όταν ενεργοποιηθεί, οι πράκτορες μπορούν να επιλέγουν πάροχο, μοντέλο και προσπάθεια συλλογισμού για κάθε υποπράκτορα από τα εξουσιοδοτημένα μοντέλα παρακάτω. Ισχύει μόνο για νέες συνεδρίες.',
  subagentModelSelectionAllowed: 'Μοντέλα που μπορούν να επιλέξουν οι πράκτορες',
  subagentModelSelectionLoading: 'Φόρτωση μοντέλων…',
  subagentModelSelectionLoadFailed: 'Δεν ήταν δυνατή η φόρτωση των μοντέλων.',
  subagentModelSelectionRetry: 'Επανάληψη',
  subagentModelSelectionPartial: 'Ορισμένοι πάροχοι μοντέλων δεν φορτώθηκαν· οι αποθηκευμένες επιλογές μπορούν να αφαιρεθούν.',
  subagentModelSelectionUnavailable: 'Προς το παρόν μη διαθέσιμο',
  subagentModelSelectionUnavailableGroup: 'Αποθηκευμένα αλλά προς το παρόν μη διαθέσιμα',
  subagentModelSelectionEmpty: 'Προς το παρόν κανένας πάροχος μοντέλων δεν παρέχει μοντέλα.',
  subagentModelSelectionRequired: 'Επιλέξτε τουλάχιστον ένα μοντέλο πριν αποθηκεύσετε.',
  subagentModelSelectionConflict: 'Οι ρυθμίσεις άλλαξαν αλλού. Απορρίψτε το πρόχειρό σας και δοκιμάστε ξανά.',
  subagentModelSelectionOff: 'Οι υποπράκτορες χρησιμοποιούν τις ρυθμισμένες προεπιλογές ή κληρονομούν το μοντέλο του γονικού πράκτορα. Οι αποθηκευμένες επιλογές μοντέλων διατηρούνται.',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  overridden: 'Remplacé',
  reset: 'Rétablir la valeur par défaut',
  readOnly: 'Ce déploiement stocke les paramètres en lecture seule.',
  unavailable: 'Ce plugin n’est pas chargé\u00a0: il ne peut pas être configuré pour le moment.',
  save: 'Enregistrer',
  saving: 'Enregistrement…',
  saveFailed: 'Le déploiement n’a pas accepté ces valeurs\u00a0; elles ont été laissées pour que vous les corrigiez.',
  subagentTitle: 'Sous-agent',
  subagentDescription: 'Définissez la profondeur de récursion, le nombre et les modèles des sous-agents.',
  subagentLimitsTitle: 'Limites',
  subagentMaxDepth: 'Profondeur de récursion maximale',
  subagentDepthHelpLabel: 'À propos de la profondeur de récursion maximale',
  subagentDepthHelp: 'Limite le nombre de niveaux de sous-agents qu’un agent peut créer.',
  subagentDepthZero: 'Désactiver les sous-agents',
  subagentDepthOne: 'Seul l’agent principal peut créer des sous-agents',
  subagentDepthOverride: 'Si un outil définit sa propre profondeur de récursion maximale, ce paramètre est prioritaire.',
  subagentMaxActive: 'Limite de parallélisme des sous-agents',
  subagentCapacityHelpLabel: 'À propos de la limite de parallélisme des sous-agents',
  subagentCapacityHelp: 'Nombre total de sous-agents actifs sous le même agent principal, tous niveaux de récursion confondus. L’agent principal n’est pas compté. Les nouvelles demandes de démarrage sont rejetées quand la limite est atteinte.',
  subagentDepthInvalid: 'Saisissez un nombre entier supérieur ou égal à 0.',
  subagentCapacityInvalid: 'Saisissez un nombre entier supérieur ou égal à 1.',
  subagentModelSelectionTitle: 'Choix du modèle',
  subagentModelSelectionToggle: 'Autoriser les agents à choisir les modèles des sous-agents',
  subagentModelSelectionChoose: 'Si cette option est activée, les agents peuvent choisir un fournisseur, un modèle et un effort de raisonnement pour chaque sous-agent parmi les modèles autorisés ci-dessous. S’applique uniquement aux nouvelles sessions.',
  subagentModelSelectionAllowed: 'Modèles que les agents peuvent choisir',
  subagentModelSelectionLoading: 'Chargement des modèles…',
  subagentModelSelectionLoadFailed: 'Impossible de charger les modèles.',
  subagentModelSelectionRetry: 'Réessayer',
  subagentModelSelectionPartial: 'Certains fournisseurs de modèles n’ont pas pu être chargés\u00a0; les choix enregistrés restent supprimables.',
  subagentModelSelectionUnavailable: 'Actuellement indisponible',
  subagentModelSelectionUnavailableGroup: 'Enregistrés mais actuellement indisponibles',
  subagentModelSelectionEmpty: 'Aucun fournisseur de modèles ne propose de modèle pour le moment.',
  subagentModelSelectionRequired: 'Sélectionnez au moins un modèle avant d’enregistrer.',
  subagentModelSelectionConflict: 'Les paramètres ont changé ailleurs. Abandonnez votre brouillon et réessayez.',
  subagentModelSelectionOff: 'Les sous-agents utilisent les valeurs par défaut configurées ou héritent du modèle de l’agent parent. Les choix de modèles enregistrés sont conservés.',
} satisfies Record<keyof typeof en, string>
