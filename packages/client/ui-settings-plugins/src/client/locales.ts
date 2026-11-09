/** Locale bundles for the built-in plugins settings section. */

/** Locale keys the section renders. */
export type PluginsSettingsLocaleKey = 'nav' | 'title' | 'intro' | 'tabs' | 'empty'

/** English copy. */
export const en = {
  nav: 'System inspector',
  title: 'System inspector',
  intro: 'Inspect the plugins this deployment ships.',
  tabs: 'Plugin views',
  empty: 'This deployment exposes no plugin views.',
} satisfies Record<string, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  nav: 'Inspector del sistema',
  title: 'Inspector del sistema',
  intro: 'Revisa los plugins que incluye esta instalación.',
  tabs: 'Vistas de plugins',
  empty: 'Esta instalación no expone vistas de plugins.',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  nav: 'Επιθεωρητής συστήματος',
  title: 'Επιθεωρητής συστήματος',
  intro: 'Επιθεωρήστε τα πρόσθετα που συνοδεύουν αυτή την εγκατάσταση.',
  tabs: 'Προβολές πρόσθετων',
  empty: 'Αυτή η εγκατάσταση δεν εκθέτει προβολές πρόσθετων.',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  nav: 'Inspecteur du système',
  title: 'Inspecteur du système',
  intro: 'Inspectez les plugins fournis avec ce déploiement.',
  tabs: 'Vues des plugins',
  empty: 'Ce déploiement n’expose aucune vue de plugin.',
} satisfies Record<keyof typeof en, string>
