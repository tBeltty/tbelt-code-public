/** Copy owned by the sidebar terminal feature. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    sidebarTerminal: SidebarTerminalKey
  }
}

/** Keys of the sidebar terminal copy. */
export type SidebarTerminalKey = keyof typeof en

/** English terminal copy. */
export const en = {
  'shortcut.noSession': 'Select a session first',
  recoveryFailed: 'Terminal recovery failed: {message}', retryRecovery: 'Retry terminal recovery',
  shell: 'Choose shell', shellLoading: 'Loading shells…', shellEmpty: 'No shells available', description: 'Run commands in the Session workspace',
  title: 'Terminal', new: 'New terminal', loading: 'Reading terminal environment…', creating: 'Starting…',
  connecting: 'Connecting…', disconnected: 'Disconnected.', reconnect: 'Reconnect',
  readonly: 'This view is read-only.', control: 'Take control',
  closed: 'Terminal closed.', exited: 'Process exited ({code})', failed: 'Terminal error: {message}',
  rename: 'Terminal name', unavailable: 'Unavailable', retry: 'Retry',
  cleanupFailed: 'Terminal “{title}” could not be ended: {message}',
  missingTerminal: 'This terminal no longer exists. Open a new terminal.',
  inputFull: 'The input buffer is full. Reconnect and try again.',
  attachmentEnded: 'The terminal connection ended. Reconnect to continue.',
  invalidOutput: 'The terminal screen could not be received. Reconnect to recover it.',
  terminalLimit: 'The terminal limit has been reached. Close unused terminals and try again. Exited terminals also count toward the limit.',
  'run.action': 'Run in terminal', 'run.again': 'Run again', 'run.show': 'Show terminal',
  'run.running': 'Running in the terminal…', 'run.stopped': 'Process stopped', 'run.reported': 'Output sent to the chat',
  'run.failed': 'Could not run: {message}',
  'run.report.intro': 'I ran this command in the terminal:', 'run.report.exit': 'Exit code: {code}',
  'run.report.stopped': 'The command was stopped before it finished.', 'run.report.failed': 'The terminal failed: {message}',
  'run.report.empty': 'No output.', 'run.report.truncated': '(Earlier output omitted)',
} satisfies Record<string, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'shortcut.noSession': 'Seleccione una sesión primero',
  recoveryFailed: 'Falló la recuperación del terminal: {message}', retryRecovery: 'Reintentar la recuperación del terminal',
  shell: 'Elige concha', shellLoading: 'Cargando proyectiles…', shellEmpty: 'No hay conchas disponibles', description: 'Ejecutar comandos en el espacio de trabajo de sesión',
  title: 'terminales', new: 'Nueva terminal', loading: 'Entorno de terminal de lectura...', creating: 'Empezando…',
  connecting: 'Conectando…', disconnected: 'Desconectado.', reconnect: 'Reconectar',
  readonly: 'Esta vista es de sólo lectura.', control: 'toma el control',
  closed: 'Terminal cerrada.', exited: 'Proceso cerrado ({code})', failed: 'Error de terminal: {message}',
  rename: 'Nombre del terminal', unavailable: 'No disponible', retry: 'Reintentar',
  cleanupFailed: 'No se pudo finalizar el terminal “{title}”: {message}',
  missingTerminal: 'Esta terminal ya no existe. Abra una nueva terminal.',
  inputFull: 'El búfer de entrada está lleno. Vuelve a conectarte y vuelve a intentarlo.',
  attachmentEnded: 'La conexión del terminal terminó. Vuelva a conectarse para continuar.',
  invalidOutput: 'No se pudo recibir la pantalla del terminal. Vuelva a conectarse para recuperarlo.',
  terminalLimit: 'Se ha alcanzado el límite terminal. Cierre los terminales no utilizados y vuelva a intentarlo. Las terminales salidas también cuentan para el límite.',
  'run.action': 'Ejecutar en el terminal', 'run.again': 'Ejecutar de nuevo', 'run.show': 'Mostrar terminal',
  'run.running': 'Ejecutando en el terminal…', 'run.stopped': 'Proceso detenido', 'run.reported': 'Salida enviada al chat',
  'run.failed': 'No se pudo ejecutar: {message}',
  'run.report.intro': 'Ejecuté este comando en el terminal:', 'run.report.exit': 'Código de salida: {code}',
  'run.report.stopped': 'El comando se detuvo antes de terminar.', 'run.report.failed': 'El terminal falló: {message}',
  'run.report.empty': 'Sin salida.', 'run.report.truncated': '(Salida anterior omitida)',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  'shortcut.noSession': 'Επιλέξτε πρώτα μια συνεδρία',
  recoveryFailed: 'Η ανάκτηση του τερματικού απέτυχε: {message}',
  retryRecovery: 'Επανάληψη ανάκτησης τερματικού',
  shell: 'Επιλογή κελύφους',
  shellLoading: 'Φόρτωση κελυφών…',
  shellEmpty: 'Δεν υπάρχουν διαθέσιμα κελύφη',
  description: 'Εκτελέστε εντολές στον χώρο εργασίας της συνεδρίας',
  title: 'Τερματικό',
  new: 'Νέο τερματικό',
  loading: 'Ανάγνωση του περιβάλλοντος τερματικού…',
  creating: 'Εκκίνηση…',
  connecting: 'Σύνδεση…',
  disconnected: 'Αποσυνδέθηκε.',
  reconnect: 'Επανασύνδεση',
  readonly: 'Αυτή η προβολή είναι μόνο για ανάγνωση.',
  control: 'Ανάληψη ελέγχου',
  closed: 'Το τερματικό έκλεισε.',
  exited: 'Η διεργασία τερματίστηκε ({code})',
  failed: 'Σφάλμα τερματικού: {message}',
  rename: 'Όνομα τερματικού',
  unavailable: 'Μη διαθέσιμο',
  retry: 'Επανάληψη',
  cleanupFailed: 'Δεν ήταν δυνατός ο τερματισμός του τερματικού «{title}»: {message}',
  missingTerminal: 'Αυτό το τερματικό δεν υπάρχει πια. Ανοίξτε νέο τερματικό.',
  inputFull: 'Η ενδιάμεση μνήμη εισόδου είναι γεμάτη. Επανασυνδεθείτε και δοκιμάστε ξανά.',
  attachmentEnded: 'Η σύνδεση του τερματικού τερματίστηκε. Επανασυνδεθείτε για να συνεχίσετε.',
  invalidOutput: 'Δεν ήταν δυνατή η λήψη της οθόνης του τερματικού. Επανασυνδεθείτε για να την ανακτήσετε.',
  terminalLimit: 'Επιτεύχθηκε το όριο τερματικών. Κλείστε τερματικά που δεν χρησιμοποιείτε και δοκιμάστε ξανά. Τα τερματικά που έχουν τερματιστεί μετράνε επίσης στο όριο.',
  'run.action': 'Εκτέλεση στο τερματικό',
  'run.again': 'Εκτέλεση ξανά',
  'run.show': 'Εμφάνιση τερματικού',
  'run.running': 'Εκτελείται στο τερματικό…',
  'run.stopped': 'Η διεργασία σταμάτησε',
  'run.reported': 'Η έξοδος στάλθηκε στη συνομιλία',
  'run.failed': 'Δεν ήταν δυνατή η εκτέλεση: {message}',
  'run.report.intro': 'Εκτέλεσα αυτή την εντολή στο τερματικό:',
  'run.report.exit': 'Κωδικός εξόδου: {code}',
  'run.report.stopped': 'Η εντολή σταμάτησε πριν ολοκληρωθεί.',
  'run.report.failed': 'Το τερματικό απέτυχε: {message}',
  'run.report.empty': 'Καμία έξοδος.',
  'run.report.truncated': '(Παραλείφθηκε προηγούμενη έξοδος)',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'shortcut.noSession': "Sélectionnez d'abord une session",
  recoveryFailed: 'Échec de la récupération du terminal : {message}', retryRecovery: 'Réessayez la récupération du terminal',
  shell: 'Choisissez la coque', shellLoading: 'Chargement des obus…', shellEmpty: 'Aucune coquille disponible', description: 'Exécuter des commandes dans l’espace de travail de la session',
  title: 'Borne', new: 'Nouvelle borne', loading: 'Environnement du terminal de lecture…', creating: 'Commencer…',
  connecting: 'Connexion…', disconnected: 'Déconnecté.', reconnect: 'Reconnecter',
  readonly: 'Cette vue est en lecture seule.', control: 'Prenez le contrôle',
  closed: 'Borne fermée.', exited: 'Processus terminé ({code})', failed: 'Erreur de terminal : {message}',
  rename: 'Nom du terminal', unavailable: 'Indisponible', retry: 'Réessayer',
  cleanupFailed: "Le terminal « {title} » n'a pas pu être terminé : {message}",
  missingTerminal: "Ce terminal n'existe plus. Ouvrez un nouveau terminal.",
  inputFull: "Le tampon d'entrée est plein. Reconnectez-vous et réessayez.",
  attachmentEnded: 'La connexion du terminal est terminée. Reconnectez-vous pour continuer.',
  invalidOutput: "L'écran du terminal n'a pas pu être reçu. Reconnectez-vous pour le récupérer.",
  terminalLimit: 'La limite terminale a été atteinte. Fermez les terminaux inutilisés et réessayez. Les terminaux sortis comptent également dans la limite.',
  'run.action': 'Exécuter dans le terminal', 'run.again': 'Exécuter à nouveau', 'run.show': 'Afficher le terminal',
  'run.running': 'Exécution dans le terminal…', 'run.stopped': 'Processus arrêté', 'run.reported': 'Sortie envoyée dans la conversation',
  'run.failed': "Impossible d'exécuter : {message}",
  'run.report.intro': "J'ai exécuté cette commande dans le terminal :", 'run.report.exit': 'Code de sortie : {code}',
  'run.report.stopped': "La commande a été arrêtée avant la fin.", 'run.report.failed': 'Le terminal a échoué : {message}',
  'run.report.empty': 'Aucune sortie.', 'run.report.truncated': '(Sortie précédente omise)',
} satisfies Record<keyof typeof en, string>
