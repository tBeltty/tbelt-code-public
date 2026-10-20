/** Locale bundles for the agent-preset hero chip, header label, and management section. */

import { guideEn, guideEs, guideEl, guideFr, type PresetGuideKey } from './guide-locales.ts'

/** Locale keys these surfaces render. */
export type AgentPresetSettingsKey =
  | PresetGuideKey
  | 'builtInGroup'
  | 'customGroup'
  | 'seatHint'
  | 'headerHint'
  | 'nav'
  | 'sectionIntro'
  | 'setDefault'
  | 'view'
  | 'presetStandardName'
  | 'presetStandardDescription'
  | 'presetPtcName'
  | 'presetPtcDescription'
  | 'presetMinimalName'
  | 'presetMinimalDescription'
  | 'presetFastName'
  | 'presetFastDescription'
  | 'presetAuditManualName'
  | 'presetAuditManualDescription'
  | 'presetAuditAutoName'
  | 'presetAuditAutoDescription'
  | 'presetCordisName'
  | 'presetCordisDescription'
  | 'inUse'
  | 'noDescription'
  | 'brokenBadge'
  | 'switchRefused'
  | 'standardUnavailable'
  | 'close'
  | 'creatorDraft'
  | 'createPlugin'
  | 'createPluginDescription'
  | 'createPluginChecking'
  | 'createPluginUnavailable'
  | 'createPluginMissing'
  | 'agentFilesTitle'
  | 'agentFilesIntro'
  | 'agentFilesEmpty'
  | 'agentLoaded'
  | 'agentNotLoaded'
  | 'newAgent'
  | 'editAgent'
  | 'agentIdLabel'
  | 'agentIdHint'
  | 'agentIdInvalid'
  | 'agentIdTaken'
  | 'agentTextLabel'
  | 'agentTemplate'
  | 'agentSave'
  | 'agentCancel'
  | 'agentDelete'
  | 'agentDeleteConfirm'
  | 'agentSavedNotLoaded'

/** English copy. */
export const en = {
  ...guideEn,
  builtInGroup: 'Built-in', customGroup: 'Custom',
  sectionIntro: 'Choose the agent’s tools and how it works. Use Standard mode for everyday tasks, or Creator mode to add capabilities to tBelt Code.',

  seatHint: 'Choose the agent preset for your new task',
  headerHint: 'The agent preset chosen when this task started',
  nav: 'Agent presets',

  setDefault: 'Set as new task default',
  view: 'View configuration',

  presetStandardName: 'Standard mode',
  presetStandardDescription:
    'Work with code, files, and information. Suitable for most tasks, with search, editing, terminal commands, and other tools available as needed.',
  presetPtcName: 'PTC mode',
  presetPtcDescription:
    'Includes all Standard mode capabilities. Better suited to tasks that call tools in batches and then filter, organize, deduplicate, count, or summarize the results.',
  presetMinimalName: 'Minimal mode',
  presetMinimalDescription:
    'The agent uses a terminal and image reading, with context compaction. Useful for testing and comparing its basic performance.',
  presetFastName: 'Fast mode',
  presetFastDescription:
    'A short prompt and a few core tools keep each step small and quick. The agent turns on search, web, subagents and other tools when a task needs them.',
  presetAuditManualName: 'Manual audit mode',
  presetAuditManualDescription: 'The agent plans work as numbered tasks with checks, hands each task to an implementer, and approves it only after re-running the checks. You launch each implementer and see every verdict.',
  presetAuditAutoName: 'Autonomous audit mode',
  presetAuditAutoDescription: 'Same audit method, but the agent launches the implementers itself and re-runs every check. You get one short report per finished phase.',
  presetCordisName: 'Creator mode',
  presetCordisDescription:
    'Customize tBelt Code through conversation. Let the agent write plugins that add features or UI, or combine tools and prompts to create your own mode.',

  inUse: 'Default',
  agentFilesTitle: 'Your agents',
  agentFilesIntro: 'Agents you write yourself. Each one appears in the list above once it loads.',
  agentFilesEmpty: 'No agents yet.',
  agentLoaded: 'Loaded',
  agentNotLoaded: 'Not loaded',
  newAgent: 'New agent',
  editAgent: 'Edit agent',
  agentIdLabel: 'Identifier',
  agentIdHint: 'Lowercase letters, digits and hyphens. It names the agent in the list.',
  agentIdInvalid: 'Use lowercase letters, digits and hyphens.',
  agentIdTaken: 'An agent with this identifier already exists.',
  agentTextLabel: 'Definition',
  agentTemplate: '---\ndescription: What this agent is for\n---\n\nWrite the instructions the agent follows.',
  agentSave: 'Save',
  agentCancel: 'Cancel',
  agentDelete: 'Delete',
  agentDeleteConfirm: 'Confirm delete',
  agentSavedNotLoaded: 'Saved, but this agent does not load.',

  noDescription: 'No description.',
  brokenBadge: 'Failed to load',

  switchRefused: 'Could not switch to {name}: {reason}',
  standardUnavailable: 'Standard mode is unavailable. Restore it or choose another available mode.',

  close: 'Close',

  creatorDraft: 'Let the agent help me create a preset',
  createPlugin: 'Let the agent create a plugin',
  createPluginDescription: 'Enter Creator mode and make your own tBelt Code plugin',
  createPluginChecking: 'Checking whether Creator mode is available',
  createPluginUnavailable: 'Temporarily unavailable. Reopen this menu to retry',
  createPluginMissing: 'Creator mode is not included in this configuration',

} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  ...guideEs,
  builtInGroup: 'Integrados',
  customGroup: 'Propios',
  sectionIntro: 'Elige las herramientas del agente y cómo trabaja. Usa el modo Estándar para el día a día, o el modo Creador para añadir capacidades a tBelt Code.',
  seatHint: 'Elige el preajuste de agente para tu tarea nueva',
  headerHint: 'El preajuste de agente elegido al empezar esta tarea',
  nav: 'Preajustes de agente',
  setDefault: 'Usar en tareas nuevas',
  view: 'Ver configuración',
  presetStandardName: 'Modo estándar',
  presetStandardDescription: 'Trabaja con código, archivos e información. Sirve para la mayoría de las tareas, con búsqueda, edición, comandos de terminal y otras herramientas disponibles cuando hacen falta.',
  presetPtcName: 'Modo PTC',
  presetPtcDescription: 'Incluye todas las capacidades del modo estándar. Se adapta mejor a las tareas que llaman a herramientas por lotes y luego filtran, organizan, deduplican, cuentan o resumen los resultados.',
  presetMinimalName: 'Modo mínimo',
  presetMinimalDescription: 'El agente usa una terminal y la lectura de imágenes, con compactación de contexto. Útil para probar y comparar su rendimiento básico.',
  presetFastName: 'Modo rápido',
  presetFastDescription:
    'Un prompt corto y pocas herramientas básicas mantienen cada paso pequeño y veloz. El agente activa la búsqueda, la web, los subagentes y otras herramientas cuando una tarea las necesita.',
  presetAuditManualName: 'Modo auditoría manual',
  presetAuditManualDescription: 'El agente planifica el trabajo en tareas numeradas con comprobaciones, entrega cada tarea a un implementador y la aprueba solo después de volver a ejecutar las comprobaciones. Tú lanzas cada implementador y ves cada veredicto.',
  presetAuditAutoName: 'Modo auditoría autónomo',
  presetAuditAutoDescription: 'El mismo método de auditoría, pero el agente lanza los implementadores por su cuenta y vuelve a ejecutar cada comprobación. Recibes un informe corto por cada fase terminada.',
  presetCordisName: 'Modo creador',
  presetCordisDescription: 'Personaliza tBelt Code conversando. Deja que el agente escriba plugins que añadan funciones o interfaz, o combine herramientas y prompts para crear tu propio modo.',
  inUse: 'Predeterminado',
  agentFilesTitle: 'Tus agentes',
  agentFilesIntro: 'Agentes que escribes tú. Cada uno aparece en la lista de arriba cuando se carga.',
  agentFilesEmpty: 'Todavía no hay agentes.',
  agentLoaded: 'Cargado',
  agentNotLoaded: 'No cargado',
  newAgent: 'Nuevo agente',
  editAgent: 'Editar agente',
  agentIdLabel: 'Identificador',
  agentIdHint: 'Letras minúsculas, números y guiones. Da nombre al agente en la lista.',
  agentIdInvalid: 'Usa letras minúsculas, números y guiones.',
  agentIdTaken: 'Ya existe un agente con este identificador.',
  agentTextLabel: 'Definición',
  agentTemplate: '---\ndescription: Para qué sirve este agente\n---\n\nEscribe las instrucciones que sigue el agente.',
  agentSave: 'Guardar',
  agentCancel: 'Cancelar',
  agentDelete: 'Eliminar',
  agentDeleteConfirm: 'Confirmar eliminación',
  agentSavedNotLoaded: 'Guardado, pero este agente no se carga.',
  noDescription: 'Sin descripción.',
  brokenBadge: 'No se pudo cargar',
  switchRefused: 'No se pudo cambiar a {name}: {reason}',
  close: 'Cerrar',
  creatorDraft: 'Quiero que el agente me ayude a crear un preajuste',
  standardUnavailable: 'El modo estándar no está disponible. Restáuralo o elige otro modo disponible.',
  createPlugin: 'Que el agente cree un plugin',
  createPluginDescription: 'Entra en el modo creador y crea tu propio plugin de tBelt Code',
  createPluginChecking: 'Comprobando si el modo creador está disponible',
  createPluginUnavailable: 'No disponible por ahora. Vuelve a abrir este menú para reintentar',
  createPluginMissing: 'El modo creador no está incluido en esta configuración',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  ...guideEl,
  builtInGroup: 'Ενσωματωμένες',
  customGroup: 'Προσαρμοσμένες',
  sectionIntro: 'Επιλέξτε τα εργαλεία του πράκτορα και πώς λειτουργεί. Χρησιμοποιήστε την Τυπική λειτουργία για καθημερινές εργασίες ή τη λειτουργία Δημιουργού για να προσθέσετε δυνατότητες στο tBelt Code.',
  seatHint: 'Επιλέξτε την προεπιλογή πράκτορα για τη νέα εργασία σας',
  headerHint: 'Η προεπιλογή πράκτορα που επιλέχθηκε όταν ξεκίνησε αυτή η εργασία',
  nav: 'Προεπιλογές πράκτορα',
  setDefault: 'Ορισμός ως προεπιλογή για νέες εργασίες',
  view: 'Προβολή ρυθμίσεων',
  presetStandardName: 'Τυπική λειτουργία',
  presetStandardDescription: 'Εργαστείτε με κώδικα, αρχεία και πληροφορίες. Ταιριάζει στις περισσότερες εργασίες, με αναζήτηση, επεξεργασία, εντολές τερματικού και άλλα εργαλεία όταν χρειάζονται.',
  presetPtcName: 'Λειτουργία PTC',
  presetPtcDescription: 'Περιλαμβάνει όλες τις δυνατότητες της Τυπικής λειτουργίας. Ταιριάζει καλύτερα σε εργασίες που καλούν εργαλεία κατά παρτίδες και μετά φιλτράρουν, οργανώνουν, αφαιρούν διπλότυπα, μετρούν ή συνοψίζουν τα αποτελέσματα.',
  presetMinimalName: 'Ελάχιστη λειτουργία',
  presetMinimalDescription: 'Ο πράκτορας εργάζεται χρησιμοποιώντας μόνο ένα εργαλείο τερματικού. Χρήσιμη για δοκιμές και συγκρίσεις της βασικής του απόδοσης.',
  presetFastName: 'Γρήγορη λειτουργία',
  presetFastDescription: 'Ένα σύντομο prompt και λίγα βασικά εργαλεία κρατούν κάθε βήμα μικρό και γρήγορο. Ο πράκτορας ενεργοποιεί την αναζήτηση, το διαδίκτυο, τους υποπράκτορες και άλλα εργαλεία όταν τα χρειάζεται η εργασία.',
  presetAuditManualName: 'Χειροκίνητη λειτουργία ελέγχου',
  presetAuditManualDescription: 'Ο πράκτορας οργανώνει τη δουλειά σε αριθμημένες εργασίες με ελέγχους, δίνει κάθε εργασία σε έναν υλοποιητή και την εγκρίνει μόνο αφού ξανατρέξει τους ελέγχους. Εσείς ξεκινάτε κάθε υλοποιητή και βλέπετε κάθε απόφαση.',
  presetAuditAutoName: 'Αυτόνομη λειτουργία ελέγχου',
  presetAuditAutoDescription: 'Η ίδια μέθοδος ελέγχου, αλλά ο πράκτορας ξεκινά μόνος του τους υλοποιητές και ξανατρέχει κάθε έλεγχο. Λαμβάνετε μια σύντομη αναφορά για κάθε ολοκληρωμένη φάση.',
  presetCordisName: 'Λειτουργία Δημιουργού',
  presetCordisDescription: 'Προσαρμόστε το tBelt Code μέσα από συζήτηση. Αφήστε τον πράκτορα να γράψει πρόσθετα που προσθέτουν λειτουργίες ή διεπαφή, ή να συνδυάσει εργαλεία και prompts για να φτιάξει τη δική σας λειτουργία.',
  inUse: 'Προεπιλογή',
  agentFilesTitle: 'Οι πράκτορές σου',
  agentFilesIntro: 'Πράκτορες που γράφεις εσύ. Ο καθένας εμφανίζεται στη λίστα παραπάνω όταν φορτωθεί.',
  agentFilesEmpty: 'Δεν υπάρχουν ακόμη πράκτορες.',
  agentLoaded: 'Φορτώθηκε',
  agentNotLoaded: 'Δεν φορτώθηκε',
  newAgent: 'Νέος πράκτορας',
  editAgent: 'Επεξεργασία πράκτορα',
  agentIdLabel: 'Αναγνωριστικό',
  agentIdHint: 'Πεζά γράμματα, αριθμοί και παύλες. Δίνει όνομα στον πράκτορα στη λίστα.',
  agentIdInvalid: 'Χρησιμοποίησε πεζά γράμματα, αριθμούς και παύλες.',
  agentIdTaken: 'Υπάρχει ήδη πράκτορας με αυτό το αναγνωριστικό.',
  agentTextLabel: 'Ορισμός',
  agentTemplate: '---\ndescription: Σε τι χρησιμεύει αυτός ο πράκτορας\n---\n\nΓράψε τις οδηγίες που ακολουθεί ο πράκτορας.',
  agentSave: 'Αποθήκευση',
  agentCancel: 'Ακύρωση',
  agentDelete: 'Διαγραφή',
  agentDeleteConfirm: 'Επιβεβαίωση διαγραφής',
  agentSavedNotLoaded: 'Αποθηκεύτηκε, αλλά ο πράκτορας δεν φορτώνεται.',
  noDescription: 'Χωρίς περιγραφή.',
  brokenBadge: 'Η φόρτωση απέτυχε',
  switchRefused: 'Δεν ήταν δυνατή η εναλλαγή σε {name}: {reason}',
  close: 'Κλείσιμο',
  creatorDraft: 'Δημιουργία προεπιλογής με τη βοήθεια του πράκτορα',
  standardUnavailable: 'Η Τυπική λειτουργία δεν είναι διαθέσιμη. Επαναφέρετέ την ή επιλέξτε άλλη διαθέσιμη λειτουργία.',
  createPlugin: 'Δημιουργία πρόσθετου από τον πράκτορα',
  createPluginDescription: 'Μεταβείτε στη λειτουργία Δημιουργού και φτιάξτε το δικό σας πρόσθετο για το tBelt Code',
  createPluginChecking: 'Έλεγχος αν η λειτουργία Δημιουργού είναι διαθέσιμη',
  createPluginUnavailable: 'Προσωρινά μη διαθέσιμο. Ανοίξτε ξανά αυτό το μενού για να δοκιμάσετε ξανά',
  createPluginMissing: 'Η λειτουργία Δημιουργού δεν περιλαμβάνεται σε αυτή τη διαμόρφωση',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked complete against the English key set. */
export const fr = {
  ...guideFr,
  builtInGroup: 'Intégrés',
  customGroup: 'Personnalisés',
  sectionIntro: 'Choisissez les outils de l’agent et son mode de fonctionnement. Utilisez le mode Standard pour les tâches courantes, ou le mode Créateur pour ajouter des fonctionnalités à tBelt Code.',
  seatHint: 'Choisissez le préréglage d’agent pour votre nouvelle tâche',
  headerHint: 'Le préréglage d’agent choisi au démarrage de cette tâche',
  nav: 'Préréglages d’agent',
  setDefault: 'Définir comme valeur par défaut des nouvelles tâches',
  view: 'Voir la configuration',
  presetStandardName: 'Mode Standard',
  presetStandardDescription: 'Travaillez avec du code, des fichiers et des informations. Convient à la plupart des tâches, avec la recherche, la modification, les commandes de terminal et d’autres outils disponibles selon les besoins.',
  presetPtcName: 'Mode PTC',
  presetPtcDescription: 'Inclut toutes les fonctionnalités du mode Standard. Convient mieux aux tâches qui appellent des outils par lots, puis filtrent, organisent, dédoublonnent, comptent ou résument les résultats.',
  presetMinimalName: 'Mode Minimal',
  presetMinimalDescription: 'L’agent utilise un terminal et la lecture d’images, avec compactage du contexte. Utile pour tester et comparer ses performances de base.',
  presetFastName: 'Mode Rapide',
  presetFastDescription: 'Un prompt court et quelques outils essentiels gardent chaque étape petite et rapide. L’agent active la recherche, le web, les sous-agents et d’autres outils quand une tâche le demande.',
  presetAuditManualName: 'Mode Audit manuel',
  presetAuditManualDescription: 'L’agent découpe le travail en tâches numérotées avec des vérifications, confie chaque tâche à un exécutant et ne l’approuve qu’après avoir relancé les vérifications. Vous lancez chaque exécutant et voyez chaque verdict.',
  presetAuditAutoName: 'Mode Audit autonome',
  presetAuditAutoDescription: 'La même méthode d’audit, mais l’agent lance lui-même les exécutants et relance chaque vérification. Vous recevez un court rapport par phase terminée.',
  presetCordisName: 'Mode Créateur',
  presetCordisDescription: 'Personnalisez tBelt Code en conversant. Laissez l’agent écrire des plugins qui ajoutent des fonctionnalités ou une interface, ou combiner outils et prompts pour créer votre propre mode.',
  inUse: 'Par défaut',
  agentFilesTitle: 'Vos agents',
  agentFilesIntro: 'Les agents que vous écrivez vous-même. Chacun apparaît dans la liste ci-dessus une fois chargé.',
  agentFilesEmpty: 'Aucun agent pour l’instant.',
  agentLoaded: 'Chargé',
  agentNotLoaded: 'Non chargé',
  newAgent: 'Nouvel agent',
  editAgent: 'Modifier l’agent',
  agentIdLabel: 'Identifiant',
  agentIdHint: 'Lettres minuscules, chiffres et tirets. Il nomme l’agent dans la liste.',
  agentIdInvalid: 'Utilisez des lettres minuscules, des chiffres et des tirets.',
  agentIdTaken: 'Un agent porte déjà cet identifiant.',
  agentTextLabel: 'Définition',
  agentTemplate: '---\ndescription: À quoi sert cet agent\n---\n\nÉcrivez les instructions que suit l’agent.',
  agentSave: 'Enregistrer',
  agentCancel: 'Annuler',
  agentDelete: 'Supprimer',
  agentDeleteConfirm: 'Confirmer la suppression',
  agentSavedNotLoaded: 'Enregistré, mais cet agent ne se charge pas.',
  noDescription: 'Aucune description.',
  brokenBadge: 'Échec du chargement',
  switchRefused: 'Impossible de passer à {name}\u00a0: {reason}',
  close: 'Fermer',
  creatorDraft: 'Laisser l’agent m’aider à créer un préréglage',
  standardUnavailable: 'Le mode Standard est indisponible. Restaurez-le ou choisissez un autre mode disponible.',
  createPlugin: 'Laisser l’agent créer un plugin',
  createPluginDescription: 'Passez en mode Créateur et créez votre propre plugin tBelt Code',
  createPluginChecking: 'Vérification de la disponibilité du mode Créateur',
  createPluginUnavailable: 'Temporairement indisponible. Rouvrez ce menu pour réessayer',
  createPluginMissing: 'Le mode Créateur n’est pas inclus dans cette configuration',
} satisfies Record<keyof typeof en, string>

// The resolution itself is the shared fold in `dsh-agent-preset-registry/display`,
// re-exported here so every surface in this plugin reads one path; the
// Settings plugin list inlines the same fold over this plugin's dictionaries.
export { isBuiltInPreset, presetDisplayText } from '@deepseek-ai/dsh-agent-preset-registry/display'
export type { PresetDisplaySource, PresetDisplayText } from '@deepseek-ai/dsh-agent-preset-registry/display'
