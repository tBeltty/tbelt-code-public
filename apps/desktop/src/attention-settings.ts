/** Persisted preferences for native agent notifications and sleep prevention. */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { DesktopAttentionSettings } from './ipc.ts'

/** Notifications only while the window is unfocused, and the computer stays awake during agent turns. */
export const DEFAULT_ATTENTION_SETTINGS: DesktopAttentionSettings = {
  notifications: true,
  notifyWhenFocused: false,
  keepAwake: true,
}

const KEYS = Object.keys(DEFAULT_ATTENTION_SETTINGS) as (keyof DesktopAttentionSettings)[]

/**
 * Validate untrusted settings JSON field by field.
 * @param value - Parsed file content or an IPC patch.
 * @returns The boolean fields present in `value`; anything else is dropped.
 */
export function pickAttentionSettings(value: unknown): Partial<DesktopAttentionSettings> {
  if (typeof value !== 'object' || value === null) return {}
  const record = value as Record<string, unknown>
  const picked: { -readonly [K in keyof DesktopAttentionSettings]?: boolean } = {}
  for (const key of KEYS) if (typeof record[key] === 'boolean') picked[key] = record[key]
  return picked
}

/** JSON file under Electron userData holding {@link DesktopAttentionSettings}. */
export class DesktopAttentionSettingsStore {
  private current: DesktopAttentionSettings

  /** @param path - Settings file; a missing or malformed file yields the defaults. */
  constructor(private readonly path: string) {
    let text: string | undefined
    try { text = readFileSync(path, 'utf8') } catch (_error) { /* A first launch has no settings file yet. */ }
    let parsed: unknown
    try { parsed = text === undefined ? undefined : JSON.parse(text) } catch (error) {
      console.warn('desktop attention: ignoring malformed settings file', error)
    }
    this.current = { ...DEFAULT_ATTENTION_SETTINGS, ...pickAttentionSettings(parsed) }
  }

  /** @returns The current preferences. */
  get(): DesktopAttentionSettings { return this.current }

  /**
   * Apply and persist a partial update.
   * @param patch - Untrusted renderer input; non-boolean fields are ignored.
   * @returns The preferences after the update.
   */
  set(patch: unknown): DesktopAttentionSettings {
    this.current = { ...this.current, ...pickAttentionSettings(patch) }
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      writeFileSync(this.path, `${JSON.stringify(this.current, null, 2)}\n`)
    } catch (error) { console.warn('desktop attention: could not save settings', error) }
    return this.current
  }
}
