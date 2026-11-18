/** Conversation plugin configuration shared by the Host and Client faces; types only. */
import type { Volatile } from '@deepseek-ai/cordis'
import type { BusyEnterBehavior } from './submission-settings.ts'

/** Live preferences; the browser receives every field through its synced Config. */
export interface ConversationConfig {
  /** Enter key behavior while a turn is running. */
  busyEnter: Volatile<BusyEnterBehavior>
  /** Pasted text longer than this many characters becomes a file attachment; 0 disables the conversion. */
  pasteToFileChars: Volatile<number>
  /** Maximum generic-file uploads allowed to run concurrently in browser Workers. */
  maxConcurrentFileUploads: Volatile<number>
}
