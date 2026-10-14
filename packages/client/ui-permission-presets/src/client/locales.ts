/** `settings.permission` namespace dictionaries (the Permission row's copy). */

/** Locale namespace shared by both current-session permission pickers. */
export const PERMISSION_ACCESS_NS = 'permission.access'

/** The settings.permission namespace key union. */
export type PermissionSettingsKey = keyof typeof en

/** English dictionary and key-set source of truth. */
export const en = {
  'title': 'Permission',
  'description': 'Choose the default permission mode for new sessions',
  'loading': 'Loading',
  'unavailable': 'Unavailable',
  'preset.readOnly': 'Read Only',
  'preset.workspaceWrite': 'Workspace Write',
  'preset.fullAccess': 'Full access',
  'hint.readOnly': 'Reads files but cannot change them.',
  'hint.workspaceWrite': 'Edits files inside the workspace and asks before going outside it.',
  'hint.fullAccess': 'Full file access without confirmation prompts.',
  'confirm.title': 'Enable Full access?',
  'confirm.description': 'Full access lets new sessions reduce confirmation steps and perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust subsequent tasks.',
  'confirm.acknowledge': 'I understand the risks and want to continue',
  'confirm.cancel': 'Cancel',
  'confirm.enable': 'Enable Full access',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'title': 'Permisos',
  'description': 'Elige el modo de permisos predeterminado para las sesiones nuevas',
  'loading': 'Cargando',
  'unavailable': 'No disponible',
  'preset.readOnly': 'Solo lectura',
  'preset.workspaceWrite': 'Escritura en el espacio de trabajo',
  'preset.fullAccess': 'Acceso total',
  'hint.readOnly': 'Lee archivos, pero no puede modificarlos.',
  'hint.workspaceWrite': 'Edita archivos dentro del espacio de trabajo y pregunta antes de salir de él.',
  'hint.fullAccess': 'Acceso total a los archivos sin pedir confirmación.',
  'confirm.title': '¿Activar el acceso total?',
  'confirm.description': 'El acceso total permite que las sesiones nuevas reduzcan los pasos de confirmación y hagan más acciones directamente, incluidas operaciones sensibles, cambios de archivos o comandos externos. Úsalo solo si confías en las tareas posteriores.',
  'confirm.acknowledge': 'Entiendo los riesgos y quiero continuar',
  'confirm.cancel': 'Cancelar',
  'confirm.enable': 'Activar acceso total',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  'title': 'Άδεια',
  'description': 'Επιλέξτε την προεπιλεγμένη λειτουργία αδειών για νέες συνεδρίες',
  'loading': 'Φόρτωση',
  'unavailable': 'Μη διαθέσιμο',
  'preset.readOnly': 'Μόνο ανάγνωση',
  'preset.workspaceWrite': 'Εγγραφή στον χώρο εργασίας',
  'preset.fullAccess': 'Πλήρης πρόσβαση',
  'hint.readOnly': 'Διαβάζει αρχεία αλλά δεν μπορεί να τα αλλάξει.',
  'hint.workspaceWrite': 'Επεξεργάζεται αρχεία μέσα στον χώρο εργασίας και ρωτά πριν βγει εκτός αυτού.',
  'hint.fullAccess': 'Πλήρης πρόσβαση σε αρχεία χωρίς μηνύματα επιβεβαίωσης.',
  'confirm.title': 'Ενεργοποίηση της Πλήρους πρόσβασης;',
  'confirm.description': 'Η Πλήρης πρόσβαση επιτρέπει στις νέες συνεδρίες να μειώνουν τα βήματα επιβεβαίωσης και να εκτελούν περισσότερες ενέργειες απευθείας, μεταξύ άλλων ευαίσθητες λειτουργίες, αλλαγές αρχείων ή εξωτερικές εντολές. Χρησιμοποιήστε τη μόνο όταν εμπιστεύεστε τις επόμενες εργασίες.',
  'confirm.acknowledge': 'Κατανοώ τους κινδύνους και θέλω να συνεχίσω',
  'confirm.cancel': 'Ακύρωση',
  'confirm.enable': 'Ενεργοποίηση Πλήρους πρόσβασης',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked complete against the English key set. */
export const fr = {
  'title': 'Autorisation',
  'description': 'Choisissez le mode d’autorisation par défaut des nouvelles sessions',
  'loading': 'Chargement',
  'unavailable': 'Indisponible',
  'preset.readOnly': 'Lecture seule',
  'preset.workspaceWrite': 'Écriture dans l’espace de travail',
  'preset.fullAccess': 'Accès complet',
  'hint.readOnly': 'Lit les fichiers mais ne peut pas les modifier.',
  'hint.workspaceWrite': 'Modifie les fichiers de l’espace de travail et demande avant d’en sortir.',
  'hint.fullAccess': 'Accès complet aux fichiers, sans demande de confirmation.',
  'confirm.title': 'Activer l’accès complet\u00a0?',
  'confirm.description': 'L’accès complet permet aux nouvelles sessions de réduire les étapes de confirmation et d’effectuer davantage d’actions directement, y compris des opérations sensibles, des modifications de fichiers ou des commandes externes. Ne l’utilisez que si vous faites confiance aux tâches à venir.',
  'confirm.acknowledge': 'Je comprends les risques et je souhaite continuer',
  'confirm.cancel': 'Annuler',
  'confirm.enable': 'Activer l’accès complet',
} satisfies Record<keyof typeof en, string>

/** Current-session popup-gate key union. */
export type PermissionAccessKey = keyof typeof accessEn

/** English dictionary for the current-session popup gate. */
export const accessEn = {
  'mode': 'Access mode, current: {name}',
  'close': 'Close',
  'preset.readOnly': 'Read Only',
  'preset.workspaceWrite': 'Workspace Write',
  'preset.fullAccess': 'Full access',
  'hint.readOnly': 'Reads files but cannot change them.',
  'hint.workspaceWrite': 'Edits files inside the workspace and asks before going outside it.',
  'hint.fullAccess': 'Full file access without confirmation prompts.',
  'confirm.title': 'Enable Full access?',
  'confirm.description': 'Full access reduces confirmation steps and lets the agent perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust the current task.',
  'confirm.acknowledge': 'I understand the risks and want to continue',
  'confirm.cancel': 'Cancel',
  'confirm.enable': 'Enable Full access',
  'auto.label': 'Auto review',
  'auto.badge': 'EXP',
  'auto.description': 'Run without a sandbox after an experimental same-model review of every native tool call and PTC inner call.',
  'auto.confirm.title': 'Enable Auto review (experimental)?',
  'auto.confirm.description': 'Auto review runs without a sandbox. Before every native tool call and PTC inner call, the same model as the current agent reviews whether to allow it; you approve or reject each call it denies. This feature is experimental, can falsely allow or deny actions, and uses additional tokens.',
  'auto.confirm.acknowledge': 'I understand these risks and want to continue',
  'auto.confirm.enable': 'Enable Auto review',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const accessEs = {
  'mode': 'Modo de acceso, actual: {name}',
  'close': 'Cerrar',
  'preset.readOnly': 'Solo lectura',
  'preset.workspaceWrite': 'Escritura en el espacio de trabajo',
  'preset.fullAccess': 'Acceso total',
  'hint.readOnly': 'Lee archivos, pero no puede modificarlos.',
  'hint.workspaceWrite': 'Edita archivos dentro del espacio de trabajo y pregunta antes de salir de él.',
  'hint.fullAccess': 'Acceso total a los archivos sin pedir confirmación.',
  'confirm.title': '¿Activar el acceso total?',
  'confirm.description': 'El acceso total reduce los pasos de confirmación y permite que el agente haga más acciones directamente, incluidas operaciones sensibles, cambios de archivos o comandos externos. Úsalo solo si confías en la tarea actual.',
  'confirm.acknowledge': 'Entiendo los riesgos y quiero continuar',
  'confirm.cancel': 'Cancelar',
  'confirm.enable': 'Activar acceso total',
  'auto.label': 'Revisión automática',
  'auto.badge': 'EXP',
  'auto.description': 'Se ejecuta sin sandbox tras una revisión experimental, con el mismo modelo, de cada llamada a herramientas nativas y cada llamada interna de PTC.',
  'auto.confirm.title': '¿Activar la revisión automática (experimental)?',
  'auto.confirm.description': 'La revisión automática se ejecuta sin sandbox. Antes de cada llamada a herramientas nativas y cada llamada interna de PTC, el mismo modelo que usa el agente actual revisa si debe permitirla; tú apruebas o rechazas cada llamada que deniegue. Esta función es experimental, puede permitir o denegar acciones por error y consume tokens adicionales.',
  'auto.confirm.acknowledge': 'Entiendo estos riesgos y quiero continuar',
  'auto.confirm.enable': 'Activar revisión automática',
} satisfies Record<keyof typeof accessEn, string>

/** Greek dictionary, checked complete against the English key set. */
export const accessEl = {
  'mode': 'Λειτουργία πρόσβασης, τρέχουσα: {name}',
  'close': 'Κλείσιμο',
  'preset.readOnly': 'Μόνο ανάγνωση',
  'preset.workspaceWrite': 'Εγγραφή στον χώρο εργασίας',
  'preset.fullAccess': 'Πλήρης πρόσβαση',
  'hint.readOnly': 'Διαβάζει αρχεία αλλά δεν μπορεί να τα αλλάξει.',
  'hint.workspaceWrite': 'Επεξεργάζεται αρχεία μέσα στον χώρο εργασίας και ρωτά πριν βγει εκτός αυτού.',
  'hint.fullAccess': 'Πλήρης πρόσβαση σε αρχεία χωρίς μηνύματα επιβεβαίωσης.',
  'confirm.title': 'Ενεργοποίηση της Πλήρους πρόσβασης;',
  'confirm.description': 'Η Πλήρης πρόσβαση μειώνει τα βήματα επιβεβαίωσης και επιτρέπει στον πράκτορα να εκτελεί περισσότερες ενέργειες απευθείας, μεταξύ άλλων ευαίσθητες λειτουργίες, αλλαγές αρχείων ή εξωτερικές εντολές. Χρησιμοποιήστε τη μόνο όταν εμπιστεύεστε την τρέχουσα εργασία.',
  'confirm.acknowledge': 'Κατανοώ τους κινδύνους και θέλω να συνεχίσω',
  'confirm.cancel': 'Ακύρωση',
  'confirm.enable': 'Ενεργοποίηση Πλήρους πρόσβασης',
  'auto.label': 'Αυτόματη επισκόπηση',
  'auto.badge': 'ΠΕΙΡ',
  'auto.description': 'Εκτέλεση χωρίς sandbox, μετά από πειραματική επισκόπηση κάθε εγγενούς κλήσης εργαλείου και κάθε εσωτερικής κλήσης PTC από το ίδιο μοντέλο.',
  'auto.confirm.title': 'Ενεργοποίηση της Αυτόματης επισκόπησης (πειραματική);',
  'auto.confirm.description': 'Η Αυτόματη επισκόπηση εκτελείται χωρίς sandbox. Πριν από κάθε εγγενή κλήση εργαλείου και κάθε εσωτερική κλήση PTC, το ίδιο μοντέλο με τον τρέχοντα πράκτορα κρίνει αν θα την επιτρέψει· εσείς εγκρίνετε ή απορρίπτετε κάθε κλήση που αρνείται. Αυτή η λειτουργία είναι πειραματική, μπορεί να επιτρέψει ή να αρνηθεί ενέργειες κατά λάθος και καταναλώνει επιπλέον tokens.',
  'auto.confirm.acknowledge': 'Κατανοώ αυτούς τους κινδύνους και θέλω να συνεχίσω',
  'auto.confirm.enable': 'Ενεργοποίηση Αυτόματης επισκόπησης',
} satisfies Record<keyof typeof accessEn, string>

/** French dictionary, checked complete against the English key set. */
export const accessFr = {
  'mode': 'Mode d’accès, actuel\u00a0: {name}',
  'close': 'Fermer',
  'preset.readOnly': 'Lecture seule',
  'preset.workspaceWrite': 'Écriture dans l’espace de travail',
  'preset.fullAccess': 'Accès complet',
  'hint.readOnly': 'Lit les fichiers mais ne peut pas les modifier.',
  'hint.workspaceWrite': 'Modifie les fichiers de l’espace de travail et demande avant d’en sortir.',
  'hint.fullAccess': 'Accès complet aux fichiers, sans demande de confirmation.',
  'confirm.title': 'Activer l’accès complet\u00a0?',
  'confirm.description': 'L’accès complet réduit les étapes de confirmation et permet à l’agent d’effectuer davantage d’actions directement, y compris des opérations sensibles, des modifications de fichiers ou des commandes externes. Ne l’utilisez que si vous faites confiance à la tâche en cours.',
  'confirm.acknowledge': 'Je comprends les risques et je souhaite continuer',
  'confirm.cancel': 'Annuler',
  'confirm.enable': 'Activer l’accès complet',
  'auto.label': 'Revue automatique',
  'auto.badge': 'EXP',
  'auto.description': 'S’exécute sans bac à sable, après une revue expérimentale de chaque appel d’outil natif et de chaque appel interne PTC par le même modèle.',
  'auto.confirm.title': 'Activer la revue automatique (expérimental)\u00a0?',
  'auto.confirm.description': 'La revue automatique s’exécute sans bac à sable. Avant chaque appel d’outil natif et chaque appel interne PTC, le même modèle que l’agent actuel détermine s’il faut l’autoriser\u00a0; vous approuvez ou rejetez chaque appel qu’il refuse. Cette fonctionnalité est expérimentale, peut autoriser ou refuser des actions à tort et consomme des tokens supplémentaires.',
  'auto.confirm.acknowledge': 'Je comprends ces risques et je souhaite continuer',
  'auto.confirm.enable': 'Activer la revue automatique',
} satisfies Record<keyof typeof accessEn, string>
