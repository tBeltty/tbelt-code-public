/** `open-in-app` namespace dictionaries: the workspace split button and the document-preview path controls. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'open-in-app'

/** Application labels shared verbatim by both dictionaries (product names). */
const PRODUCT_NAMES = {
  'app.cursor': 'Cursor',
  'app.vscode': 'VS Code',
  'app.vscodeinsiders': 'VS Code Insiders',
  'app.windsurf': 'Windsurf',
  'app.zed': 'Zed',
  'app.sublimetext': 'Sublime Text',
  'app.xcode': 'Xcode',
  'app.androidstudio': 'Android Studio',
  'app.intellij': 'IntelliJ IDEA',
  'app.pycharm': 'PyCharm',
  'app.webstorm': 'WebStorm',
  'app.phpstorm': 'PhpStorm',
  'app.goland': 'GoLand',
  'app.rider': 'Rider',
  'app.rustrover': 'RustRover',
  'app.fork': 'Fork',
  'app.sourcetree': 'Sourcetree',
  'app.github': 'GitHub Desktop',
  'app.tower': 'Tower',
  'app.gitkraken': 'GitKraken',
  'app.smartgit': 'SmartGit',
  'app.sublimemerge': 'Sublime Merge',
  'app.ghostty': 'Ghostty',
  'app.warp': 'Warp',
  'app.iterm': 'iTerm2',
  'app.kitty': 'kitty',
  'app.windowsterminal': 'Windows Terminal',
  'app.gitbash': 'Git Bash',
  'app.gnometerminal': 'GNOME Terminal',
  'app.konsole': 'Konsole',
} as const

/** English dictionary and key-set source of truth. */
export const en = {
  'open.title': 'Open in {app}',
  'path.appDefault': '{app} (default)',
  'path.appsError': 'Could not load applications',
  'shortcut.busy': 'Opening workspace',
  'shortcut.unavailable': 'Current workspace or local application unavailable',
  'open.tooltip': 'Open locally',
  'path.open': 'Open',
  'path.more': 'More ways to open',
  'path.reveal': 'Show file location',
  'path.openError': 'Could not open. Try again.',
  'path.revealError': 'Could not show the file location. Try again.',
  ...PRODUCT_NAMES,
  'app.finder': 'Finder',
  'app.explorer': 'File Explorer',
  'app.filemanager': 'Files',
  'app.terminal': 'Terminal',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'open.title': 'Abrir en {app}',
  'path.appDefault': '{app} (predeterminada)',
  'path.appsError': 'No se pudieron cargar las aplicaciones',
  'shortcut.busy': 'Abriendo el espacio de trabajo',
  'shortcut.unavailable': 'El espacio de trabajo actual o la aplicación local no están disponibles',
  'open.tooltip': 'Abrir en local',
  'path.open': 'Abrir',
  'path.more': 'Más formas de abrir',
  'path.reveal': 'Mostrar ubicación del archivo',
  'path.openError': 'No se pudo abrir. Inténtalo de nuevo.',
  'path.revealError': 'No se pudo mostrar la ubicación del archivo. Inténtalo de nuevo.',
  ...PRODUCT_NAMES,
  'app.finder': 'Finder',
  'app.explorer': 'Explorador de archivos',
  'app.filemanager': 'Archivos',
  'app.terminal': 'Terminal',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  'open.title': 'Άνοιγμα στο {app}',
  'path.appDefault': '{app} (προεπιλογή)',
  'path.appsError': 'Δεν ήταν δυνατή η φόρτωση των εφαρμογών',
  'shortcut.busy': 'Άνοιγμα του χώρου εργασίας',
  'shortcut.unavailable': 'Ο τρέχων χώρος εργασίας ή η τοπική εφαρμογή δεν είναι διαθέσιμα',
  'open.tooltip': 'Άνοιγμα τοπικά',
  'path.open': 'Άνοιγμα',
  'path.more': 'Περισσότεροι τρόποι ανοίγματος',
  'path.reveal': 'Εμφάνιση θέσης του αρχείου',
  'path.openError': 'Δεν ήταν δυνατό το άνοιγμα. Δοκιμάστε ξανά.',
  'path.revealError': 'Δεν ήταν δυνατή η εμφάνιση της θέσης του αρχείου. Δοκιμάστε ξανά.',
  ...PRODUCT_NAMES,
  'app.finder': 'Finder',
  'app.explorer': 'Εξερεύνηση αρχείων',
  'app.filemanager': 'Αρχεία',
  'app.terminal': 'Τερματικό',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked complete against the English key set. */
export const fr = {
  'open.title': 'Ouvrir dans {app}',
  'path.appDefault': '{app} (par défaut)',
  'path.appsError': 'Impossible de charger les applications',
  'shortcut.busy': 'Ouverture de l’espace de travail',
  'shortcut.unavailable': 'L’espace de travail actuel ou l’application locale est indisponible',
  'open.tooltip': 'Ouvrir en local',
  'path.open': 'Ouvrir',
  'path.more': 'Autres façons d’ouvrir',
  'path.reveal': 'Afficher l’emplacement du fichier',
  'path.openError': 'Impossible d’ouvrir. Réessayez.',
  'path.revealError': 'Impossible d’afficher l’emplacement du fichier. Réessayez.',
  ...PRODUCT_NAMES,
  'app.finder': 'Finder',
  'app.explorer': 'Explorateur de fichiers',
  'app.filemanager': 'Fichiers',
  'app.terminal': 'Terminal',
} satisfies Record<keyof typeof en, string>

/** Key domain of the `open-in-app` namespace (English is the source of truth). */
export type OpenInAppKey = keyof typeof en
