/** `approval` namespace dictionaries. */

/** Approval dictionary key union. */
export type ApprovalKey = keyof typeof en

/** English dictionary and key-set source of truth. */
export const en = {
  waiting: 'Waiting for approval',
  'detail.aria': 'Approval details',
  'need.shell': 'I need permission to run a command',
  'need.edit': 'I need permission to change files in your project',
  'need.read': 'I need permission to read your files or a web page',
  'need.search': 'I need permission to search your project or the web',
  'need.code': 'I need permission to run a program',
  'need.generic': 'I need permission to take an action',
  because: 'Because: {reason}',
  technical: 'Technical details',
  'technical.tool': 'Tool: {toolName}',
  reject: 'Reject',
  allow: 'Allow',
  allowOnce: 'Allow once',
  allowSession: 'Allow for this session',
  allowMenu: 'More ways to allow',
  allowAlways: 'Always allow',
} satisfies Record<string, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  waiting: 'Esperando aprobación',
  'detail.aria': 'Detalles de la aprobación',
  'need.shell': 'Necesito permiso para ejecutar un comando',
  'need.edit': 'Necesito permiso para modificar archivos de tu proyecto',
  'need.read': 'Necesito permiso para leer tus archivos o una página web',
  'need.search': 'Necesito permiso para buscar en tu proyecto o en la web',
  'need.code': 'Necesito permiso para ejecutar un programa',
  'need.generic': 'Necesito permiso para realizar una acción',
  because: 'Motivo: {reason}',
  technical: 'Detalles técnicos',
  'technical.tool': 'Herramienta: {toolName}',
  reject: 'Rechazar',
  allow: 'Permitir',
  allowOnce: 'Permitir una vez',
  allowSession: 'Permitir durante esta sesión',
  allowMenu: 'Más formas de permitir',
  allowAlways: 'Permitir siempre',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  waiting: 'Αναμονή έγκρισης',
  'detail.aria': 'Λεπτομέρειες έγκρισης',
  'need.shell': 'Χρειάζομαι άδεια για να εκτελέσω μια εντολή',
  'need.edit': 'Χρειάζομαι άδεια για να αλλάξω αρχεία στο έργο σας',
  'need.read': 'Χρειάζομαι άδεια για να διαβάσω τα αρχεία σας ή μια ιστοσελίδα',
  'need.search': 'Χρειάζομαι άδεια για να κάνω αναζήτηση στο έργο σας ή στο διαδίκτυο',
  'need.code': 'Χρειάζομαι άδεια για να εκτελέσω ένα πρόγραμμα',
  'need.generic': 'Χρειάζομαι άδεια για να κάνω μια ενέργεια',
  because: 'Αιτία: {reason}',
  technical: 'Τεχνικές λεπτομέρειες',
  'technical.tool': 'Εργαλείο: {toolName}',
  reject: 'Απόρριψη',
  allow: 'Να επιτρέπεται',
  allowOnce: 'Να επιτραπεί μία φορά',
  allowSession: 'Να επιτραπεί για αυτή τη συνεδρία',
  allowMenu: 'Περισσότεροι τρόποι να επιτραπεί',
  allowAlways: 'Να επιτρέπεται πάντα',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  waiting: 'En attente d’approbation',
  'detail.aria': 'Détails de l’approbation',
  'need.shell': 'J’ai besoin de votre autorisation pour exécuter une commande',
  'need.edit': 'J’ai besoin de votre autorisation pour modifier des fichiers de votre projet',
  'need.read': 'J’ai besoin de votre autorisation pour lire vos fichiers ou une page web',
  'need.search': 'J’ai besoin de votre autorisation pour effectuer une recherche dans votre projet ou sur le web',
  'need.code': 'J’ai besoin de votre autorisation pour exécuter un programme',
  'need.generic': 'J’ai besoin de votre autorisation pour effectuer une action',
  because: 'Raison\u00a0: {reason}',
  technical: 'Détails techniques',
  'technical.tool': 'Outil\u00a0: {toolName}',
  reject: 'Refuser',
  allow: 'Autoriser',
  allowOnce: 'Autoriser une fois',
  allowSession: 'Autoriser pour cette session',
  allowMenu: 'Autres façons d’autoriser',
  allowAlways: 'Toujours autoriser',
} satisfies Record<keyof typeof en, string>
