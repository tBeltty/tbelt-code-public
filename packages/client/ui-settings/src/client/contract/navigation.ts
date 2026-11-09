/**
 * Settings navigation service type. The settings shell (ui-settings-general)
 * provides `ctx.settingsNavigation` while its `sidebar.settings` occupant is
 * registered; features outside Settings read it with `ctx.get` and offer
 * their entry only while it is provided.
 */

import type {} from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Cross-plugin navigation into the Settings panel; absent while no settings shell is mounted. */
    settingsNavigation: SettingsNavigation
  }
}

/** Opens the Settings panel from surfaces outside it. */
export interface SettingsNavigation {
  /**
   * Open the Settings panel on one registered section. An id no
   * `settings.section` entry registers opens the first section.
   * @param id - `settings.section` entry id, such as `models`.
   */
  openSection(id: string): void
}
