/**
 * ModelSelect's injected face. The target 'conversation.input.model' seat is
 * declared (children table) and typed by ui-conversation's composer-bar
 * entry; this package only contributes the single occupant, so no SlotMap
 * merge lives here.
 */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ModelSelection, SpendSummaryReading } from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from './directory.ts'

/** Injected business face of the composer model seat. */
export interface ModelSelectInjected {
  /** Whether this session supports Agent-bound model inspection and selection. */
  available: boolean
  /** The session's shared directory store (same instance the /model popup reads). */
  directory: SnapshotStore<ModelDirectoryState>
  /** Ensure the shared advisory catalog is loaded (errors land on the store). */
  load: () => void
  /**
   * Select a complete provider/model/reasoning selection.
   * @param selection - model selection and optional adapter-owned effort.
   * @returns the Host outcome, or undefined when this Session cannot select a model.
   */
  select: (selection: ModelSelection) => Promise<RemoteResult<void> | undefined>
  /**
   * Resolve the Settings entry that opens the Models section. The menu calls
   * it each time it opens, so the entry follows the settings shell's presence.
   * @returns the action that opens Settings at the Models section, or
   * undefined while no settings shell provides `settingsNavigation`.
   */
  modelSettings: () => (() => void) | undefined
}

/** Injected face of the composer spend reading. */
export interface SpendPillInjected {
  /**
   * Read the Session's spend once accounting has settled.
   * @returns the figures, or undefined when the read fails.
   */
  read: () => Promise<SpendSummaryReading | undefined>
  /**
   * Call a listener whenever the figures may have changed: the Session starts
   * or stops running, or the connection resets.
   * @param listener - refresh to run.
   * @returns the unsubscribe function.
   */
  subscribe: (listener: () => void) => () => void
  /**
   * Resolve the Settings entry that opens the Spending section.
   * @returns the opener, or undefined while no settings shell provides `settingsNavigation`.
   */
  spendSettings: () => (() => void) | undefined
}
