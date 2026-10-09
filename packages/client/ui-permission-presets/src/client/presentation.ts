import { en } from './locales.ts'

/** Machine value of the preset that requires an explicit GUI risk gate. */
export const FULL_ACCESS_PRESET = 'danger-full-access'

/** Machine value of the experimental current-session review preset. */
export const AUTO_REVIEW_PRESET = 'auto'

/** Locale dictionary key for a built-in permission preset label. */
export type PermissionPresetLabelKey =
  | 'preset.readOnly'
  | 'preset.workspaceWrite'
  | 'preset.fullAccess'

/** Locale dictionary key for a built-in permission preset's one-line effect. */
export type PermissionPresetHintKey =
  | 'hint.readOnly'
  | 'hint.workspaceWrite'
  | 'hint.fullAccess'

const PRESET_HINT_KEYS = new Map<string, PermissionPresetHintKey>([
  ['read-only', 'hint.readOnly'],
  ['workspace-write', 'hint.workspaceWrite'],
  [FULL_ACCESS_PRESET, 'hint.fullAccess'],
])

/**
 * The locale key describing what a built-in preset lets the agent do.
 * @param value - preset machine value.
 * @param name - host-supplied preset name; a renamed preset may have been
 * redefined by the host, so only the built-in names carry the built-in hint.
 * @returns the hint key, or undefined for a host-defined preset.
 */
export function presetHintKey(value: string, name: string): PermissionPresetHintKey | undefined {
  const labelKey = PRESET_LABEL_KEYS.get(value)
  if (labelKey === undefined || (name !== value && name !== DEFAULT_PRESET_LABELS[labelKey])) return undefined
  return PRESET_HINT_KEYS.get(value)
}

const PRESET_LABEL_KEYS = new Map<string, PermissionPresetLabelKey>([
  ['read-only', 'preset.readOnly'],
  ['workspace-write', 'preset.workspaceWrite'],
  [FULL_ACCESS_PRESET, 'preset.fullAccess'],
])

const DEFAULT_PRESET_LABELS: Record<PermissionPresetLabelKey, string> = {
  'preset.readOnly': en['preset.readOnly'],
  'preset.workspaceWrite': en['preset.workspaceWrite'],
  'preset.fullAccess': en['preset.fullAccess'],
}

/**
 * Convert conventional kebab-case preset names into user-facing title case.
 * @param name - host-supplied preset label or key.
 * @returns the title-cased conventional key, or a non-kebab label unchanged.
 */
export function displayPresetName(name: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name
  return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

/**
 * Render a permission preset under its product label.
 * @param value - preset machine value.
 * @param name - host-supplied preset name.
 * @param t - optional locale dictionary lookup for built-in product labels.
 * @returns the built-in product label or the conventional display name.
 */
export function displayPermissionPreset(
  value: string,
  name: string,
  t?: (key: PermissionPresetLabelKey) => string,
): string {
  const key = PRESET_LABEL_KEYS.get(value)
  if (key !== undefined && (name === value || name === DEFAULT_PRESET_LABELS[key])) {
    return t?.(key) ?? DEFAULT_PRESET_LABELS[key]
  }
  return displayPresetName(name)
}
