/** Locale-owned Excel preview controls and parser feedback. */

/** Excel preview dictionary keys. */
export type ExcelPreviewKey = keyof typeof en

/** English Excel preview copy. */
export const en = {
  title: 'Spreadsheet', language: 'en', loading: 'Rendering document...',
  invalid: 'This spreadsheet could not be opened. Check its format, contents, or password protection.',
  tooLarge: 'This workbook exceeds the preview size limit.', timeout: 'Opening this workbook timed out. Try a smaller file.',
  encoding: 'This text encoding could not be read. Save the file as UTF-8 or UTF-16 with a BOM and retry.',
  formulaWarning: 'This workbook contains formulas. Displayed results may be missing or inaccurate.',
  unsupportedNotice: 'This preview does not support {features} in this workbook. Open it in a system application for the full experience.',
  charts: 'charts', images: 'images', shapes: 'shapes', conditionalFormatting: 'conditional formatting', featureSeparator: ', ',
  retry: 'Retry',
} satisfies Record<string, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Excel preview status and third-party locale selection. */
    sidebarExcel: ExcelPreviewKey
  }
}

/** Spanish dictionary, checked against the English keys. */
export const es = {
  title: 'Hoja de cálculo', language: 'en', loading: 'Representando documento...',
  invalid: 'Esta hoja de cálculo no se pudo abrir. Comprueba su formato, contenidos o protección con contraseña.',
  tooLarge: 'Este libro excede el límite de tamaño de vista previa.', timeout: 'Se agotó el tiempo de apertura de este libro. Pruebe con un archivo más pequeño.',
  encoding: 'Esta codificación de texto no se pudo leer. Guarde el archivo como UTF-8 o UTF-16 con una lista de materiales y vuelva a intentarlo.',
  formulaWarning: 'Este libro contiene fórmulas. Los resultados mostrados pueden faltar o ser inexactos.',
  unsupportedNotice: 'Esta vista previa no es compatible con {features} en este libro. Ábralo en una aplicación del sistema para disfrutar de la experiencia completa.',
  charts: 'gráficos', images: 'imágenes', shapes: 'formas', conditionalFormatting: 'formato condicional', featureSeparator: ', ',
  retry: 'Reintentar',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  title: 'Υπολογιστικό φύλλο',
  language: 'en',
  loading: 'Απόδοση εγγράφου...',
  invalid: 'Δεν ήταν δυνατό το άνοιγμα αυτού του υπολογιστικού φύλλου. Ελέγξτε τη μορφή, το περιεχόμενο ή την προστασία με κωδικό.',
  tooLarge: 'Αυτό το βιβλίο εργασίας υπερβαίνει το όριο μεγέθους της προεπισκόπησης.',
  timeout: 'Το άνοιγμα αυτού του βιβλίου εργασίας έληξε. Δοκιμάστε μικρότερο αρχείο.',
  encoding: 'Δεν ήταν δυνατή η ανάγνωση αυτής της κωδικοποίησης κειμένου. Αποθηκεύστε το αρχείο ως UTF-8 ή UTF-16 με BOM και δοκιμάστε ξανά.',
  formulaWarning: 'Αυτό το βιβλίο εργασίας περιέχει τύπους. Τα αποτελέσματα που εμφανίζονται μπορεί να λείπουν ή να είναι ανακριβή.',
  unsupportedNotice: 'Αυτή η προεπισκόπηση δεν υποστηρίζει {features} σε αυτό το βιβλίο εργασίας. Ανοίξτε το σε εφαρμογή του συστήματος για την πλήρη εμπειρία.',
  charts: 'γραφήματα',
  images: 'εικόνες',
  shapes: 'σχήματα',
  conditionalFormatting: 'μορφοποίηση υπό όρους',
  featureSeparator: ', ',
  retry: 'Επανάληψη',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  title: 'Feuille de calcul', language: 'en', loading: 'Rendu du document...',
  invalid: "Cette feuille de calcul n'a pas pu être ouverte. Vérifiez son format, son contenu ou sa protection par mot de passe.",
  tooLarge: "Ce classeur dépasse la limite de taille d'aperçu.", timeout: "L'ouverture de ce classeur a expiré. Essayez un fichier plus petit.",
  encoding: "Cet encodage de texte n'a pas pu être lu. Enregistrez le fichier au format UTF-8 ou UTF-16 avec une nomenclature et réessayez.",
  formulaWarning: 'Ce classeur contient des formules. Les résultats affichés peuvent être manquants ou inexacts.',
  unsupportedNotice: 'Cet aperçu ne prend pas en charge {features} dans ce classeur. Ouvrez-le dans une application système pour une expérience complète.',
  charts: 'graphiques', images: 'photos', shapes: 'formes', conditionalFormatting: 'mise en forme conditionnelle', featureSeparator: ', ',
  retry: 'Réessayer',
} satisfies Record<keyof typeof en, string>
