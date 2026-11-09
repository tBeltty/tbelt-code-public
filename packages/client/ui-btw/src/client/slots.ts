/**
 * The injected face of the side-conversation dialog entry. The
 * 'conversation.input.overlay' slot is declared and typed by ui-conversation;
 * this package only contributes an entry, so no SlotMap merge lives here. Live
 * state arrives through the `hooks` compartment (the framework standard kit
 * binds `dialog` into `useDialog`).
 * @module @deepseek-ai/dsh-client-ui-btw/client/slots
 */

import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls this package's LocaleNamespaceMap merge (the 'btw' seat).
import type {} from './locales.ts'
import type { BtwDialogState } from './controller.ts'

/** Injected business face of the Session's side-conversation dialog. */
export interface BtwDialogInjected {
  hooks: {
    /** The Session's dialog state. */
    dialog: HostObservable<BtwDialogState>
  }
  /**
   * Replace the question field.
   * @param draft - the text as typed.
   */
  edit: (draft: string) => void
  /** Ask the question in the field. */
  ask: () => Promise<void>
  /** Queue the unsent turns on the main chat's agent. */
  send: () => Promise<void>
  /** Discard the thread. */
  clear: () => Promise<void>
  /** Close the dialog, keeping the thread. */
  dismiss: () => void
  /** Retire the failure notice. */
  dismissFailure: () => void
  /**
   * Retire the toast the view finished showing.
   * @param seq - the toast sequence.
   */
  dismissToast: (seq: number) => void
}

/** Full props of the side-conversation overlay entry. */
export type BtwDialogProps = InjectFace<BtwDialogInjected> & PropsLocale<'btw'>
