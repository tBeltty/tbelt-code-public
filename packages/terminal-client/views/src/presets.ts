/**
 * Rows of the agent preset list of `/agents`.
 * @module @deepseek-ai/dsh-terminal-views/presets
 */
import { t } from './copy.ts'
import type { PickerItem } from './picker.ts'

/** One agent preset. */
export interface PresetRow {
  readonly id: string
  readonly name?: string | undefined
  readonly description?: string | undefined
  /** Whether new sessions start with it. */
  readonly isDefault: boolean
  /** Why it cannot start a session, when it cannot. */
  readonly broken?: string | undefined
}

/**
 * Rows of the preset list.
 * @param presets - the roster the Host reports.
 * @returns one row per preset; the default is marked and a preset that cannot start a session says why.
 */
export function presetItems(presets: readonly PresetRow[]): PickerItem[] {
  return presets.map(preset => ({
    value: preset.id,
    label: preset.name ?? preset.id,
    detail: preset.broken === undefined
      ? [preset.id, preset.description].filter(Boolean).join(' · ')
      : t('agents.broken', { reason: preset.broken }),
    current: preset.isDefault,
  }))
}
