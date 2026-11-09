/**
 * Rows of the permission preset list of `/permissions`.
 * @module @deepseek-ai/dsh-terminal-views/permission
 */
import type { PickerItem } from './picker.ts'

/** One permission preset a session can run under. */
export interface PermissionRow {
  readonly value: string
  readonly name: string
  readonly description?: string | undefined
}

/**
 * Rows of the preset list.
 * @param options - the presets a session can run under.
 * @param defaultPreset - the preset new sessions start with.
 * @returns one row per preset, with the default marked.
 */
export function permissionItems(options: readonly PermissionRow[], defaultPreset: string): PickerItem[] {
  return options.map(option => ({
    value: option.value,
    label: option.name,
    detail: option.description,
    current: option.value === defaultPreset,
  }))
}
