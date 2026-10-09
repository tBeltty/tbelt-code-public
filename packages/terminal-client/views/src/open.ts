/**
 * Open in an application: the rows of the `/open` list.
 * @module @deepseek-ai/dsh-terminal-views/open
 */
import { t } from './copy.ts'
import type { PickerItem } from './picker.ts'

/** An application that can open a path. */
export interface ApplicationRow {
  readonly id: string
  readonly name: string
  readonly default: boolean
}

/** Marker value of the row that shows the path in the file manager. */
export const OPEN_REVEAL = 'reveal'

/**
 * Rows of the application list.
 * @param apps - the applications the Host found.
 * @returns the default application first, each marked when it is the default, then a row that shows the path in the file manager.
 */
export function applicationItems(apps: readonly ApplicationRow[]): PickerItem[] {
  return [
    ...[...apps.filter(app => app.default), ...apps.filter(app => !app.default)].map(app => ({
      value: `app:${app.id}`,
      label: app.name,
      detail: app.default ? t('open.default') : undefined,
    })),
    { value: OPEN_REVEAL, label: t('open.reveal') },
  ]
}
