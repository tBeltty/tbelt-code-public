/** Busy-Enter preference stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the conversation plugin. */
export const CONVERSATION_SETTINGS_NAMESPACE = 'ui-conversation'

/** Field carrying the delivery mode for plain Enter while an agent is busy. */
export const BUSY_ENTER_FIELD = 'busyEnter'

/** Busy-Enter behaviors accepted at settings and input boundaries. */
export const BUSY_ENTER_BEHAVIORS = ['queue', 'steer'] as const

/** Configurable meaning of plain Enter while the addressed agent is busy. */
export type BusyEnterBehavior = typeof BUSY_ENTER_BEHAVIORS[number]

/** Default preserves Enter-as-Queue for running conversations. */
export const DEFAULT_BUSY_ENTER_BEHAVIOR: BusyEnterBehavior = 'queue'

/** Field carrying the pasted-text length, in characters, above which a paste becomes a file attachment. */
export const PASTE_TO_FILE_FIELD = 'pasteToFileChars'

/** Default threshold: pastes longer than this many characters become a file attachment. */
export const DEFAULT_PASTE_TO_FILE_CHARS = 8000

/** Durable conversation section shared by the Host schema and the browser scope. */
export interface ConversationSettings {
  /** Delivery mode for plain Enter while the addressed agent is busy. */
  busyEnter: BusyEnterBehavior
  /** Pasted text longer than this many characters becomes a file attachment; 0 keeps every paste inline. */
  pasteToFileChars: number
}

/** Durable conversation schema; also the wire envelope the browser scope validates against. */
export const ConversationSettingsFields = {
  [BUSY_ENTER_FIELD]: z.union([...BUSY_ENTER_BEHAVIORS]).default(DEFAULT_BUSY_ENTER_BEHAVIOR),
  [PASTE_TO_FILE_FIELD]: z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_PASTE_TO_FILE_CHARS),
}

/** Schema for shared configuration values. */
export const ConversationSettingsSchema = z.object(ConversationSettingsFields)
