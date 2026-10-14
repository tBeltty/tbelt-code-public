/**
 * Headless state of one Session's side-conversation dialog. The Host owns the
 * thread; this controller mirrors it, runs the three operations the dialog
 * offers (ask, send to the main chat, clear), and publishes failure codes and
 * the delivery toast for the view.
 * @module @deepseek-ai/dsh-client-ui-btw/client/controller
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  BtwAskRequest, BtwDelivery, BtwResult, BtwSessionRequest, BtwThread, BtwTurn,
} from '@deepseek-ai/dsh-command-btw/types'

/** The Remote envelope around one Host result. */
export type Carried<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

/** The `btw` Host Remote as this controller consumes it. */
export interface BtwPort {
  ask(request: BtwAskRequest): Promise<Carried<BtwResult<BtwTurn>>>
  send(request: BtwSessionRequest): Promise<Carried<BtwResult<BtwDelivery>>>
  reset(request: BtwSessionRequest): Promise<Carried<BtwResult<BtwThread>>>
  get(request: BtwSessionRequest): Promise<Carried<BtwResult<BtwThread>>>
}

/** Dialog state the view renders from. */
export interface BtwDialogState {
  readonly open: boolean
  /** Turns answered so far, oldest first. */
  readonly turns: readonly BtwTurn[]
  /** Leading turns that already reached the main chat. */
  readonly sentTurns: number
  /** Text in the question field. */
  readonly draft: string
  /** Question waiting for its answer; null when none. */
  readonly pending: string | null
  /** Delivery to the main chat is in flight. */
  readonly sending: boolean
  /** Code of the last failed operation; null when none. */
  readonly failure: string | null
  /** Sequence of the delivery toast on screen; 0 while none. */
  readonly toast: number
}

const CLOSED: Omit<BtwDialogState, 'toast'> = {
  open: false, turns: [], sentTurns: 0, draft: '', pending: null, sending: false, failure: null,
}

/** Per-session dialog controller. */
export class BtwDialogController {
  /** Dialog state store the overlay entry subscribes to. */
  readonly state: SnapshotStore<BtwDialogState> = createSnapshotStore<BtwDialogState>({ ...CLOSED, toast: 0 })
  private toastSeq = 0
  private disposed = false

  /**
   * @param port - the `btw` Host Remote for this Session.
   * @param sessionId - Session the thread belongs to.
   */
  constructor(private readonly port: BtwPort, private readonly sessionId: BtwSessionRequest['sessionId']) {}

  /**
   * Open the dialog, mirror the Host's thread, and ask `question` when given.
   * @param question - question to ask right away, from `/btw <question>`.
   * @returns after the mirror is read and the optional question settles.
   */
  async open(question?: string): Promise<void> {
    this.patch({ open: true, failure: null })
    await this.refresh()
    if (question !== undefined && question.trim().length > 0) await this.ask(question)
  }

  /** Close the dialog; the thread and an unsent draft stay. */
  dismiss(): void {
    this.patch({ open: false })
  }

  /**
   * Replace the question field.
   * @param draft - the text as typed.
   */
  edit(draft: string): void {
    this.patch({ draft })
  }

  /**
   * Ask a question; with no argument, the question field is asked and cleared.
   * A failure puts the question back in an empty field.
   * @param question - question text, defaulting to the field.
   * @returns after the answer or failure is published.
   */
  async ask(question?: string): Promise<void> {
    const s = this.state.getSnapshot()
    const text = (question ?? s.draft).trim()
    if (text.length === 0 || s.pending !== null || s.sending) return
    this.patch({ pending: text, draft: question === undefined ? '' : s.draft, failure: null })
    const outcome = await this.call(() => this.port.ask({ sessionId: this.sessionId, question: text }))
    if (this.disposed) return
    const now = this.state.getSnapshot()
    if (outcome.ok) {
      this.patch({ pending: null, turns: [...now.turns, outcome.value] })
      return
    }
    this.patch({ pending: null, failure: outcome.code, draft: now.draft.length === 0 ? text : now.draft })
  }

  /**
   * Queue the unsent turns on the main chat's agent and raise the toast.
   * @returns after the delivery settles.
   */
  async send(): Promise<void> {
    const s = this.state.getSnapshot()
    if (s.pending !== null || s.sending || s.turns.length === s.sentTurns) return
    this.patch({ sending: true, failure: null })
    const outcome = await this.call(() => this.port.send({ sessionId: this.sessionId }))
    if (this.disposed) return
    if (!outcome.ok) {
      this.patch({ sending: false, failure: outcome.code })
      return
    }
    this.toastSeq += 1
    this.patch({ sending: false, sentTurns: this.state.getSnapshot().turns.length, toast: this.toastSeq })
  }

  /**
   * Discard the thread on the Host and here.
   * @returns after the Host confirms.
   */
  async clear(): Promise<void> {
    const s = this.state.getSnapshot()
    if (s.pending !== null || s.sending) return
    const outcome = await this.call(() => this.port.reset({ sessionId: this.sessionId }))
    if (this.disposed) return
    if (!outcome.ok) {
      this.patch({ failure: outcome.code })
      return
    }
    this.patch({ turns: [], sentTurns: 0, failure: null })
  }

  /** Clear the failure notice. */
  dismissFailure(): void {
    this.patch({ failure: null })
  }

  /**
   * Retire one toast after its fade; a newer toast is left alone.
   * @param seq - the toast sequence the view finished showing.
   */
  dismissToast(seq: number): void {
    if (this.state.getSnapshot().toast === seq) this.patch({ toast: 0 })
  }

  /** Scope-teardown disposer: drop the mirror and orphan in-flight work. */
  dispose(): void {
    this.disposed = true
    this.state.set({ ...CLOSED, toast: 0 })
  }

  /** Mirror the Host's thread; a failed read leaves the cached turns. */
  private async refresh(): Promise<void> {
    const outcome = await this.call(() => this.port.get({ sessionId: this.sessionId }))
    if (this.disposed || !outcome.ok) return
    this.patch({ turns: outcome.value.turns, sentTurns: outcome.value.sentTurns })
  }

  /** Flatten the transport envelope and the Host result into one outcome. */
  private async call<T>(run: () => Promise<Carried<BtwResult<T>>>): Promise<{ ok: true; value: T } | { ok: false; code: string }> {
    try {
      const carried = await run()
      if (!carried.ok) return { ok: false, code: carried.error.code }
      if (!carried.value.ok) return { ok: false, code: carried.value.error.code }
      return { ok: true, value: carried.value.value }
    } catch {
      // A transport rejection reads as a generic failure; the dialog shows the same line.
      return { ok: false, code: 'transport' }
    }
  }

  private patch(change: Partial<BtwDialogState>): void {
    this.state.set({ ...this.state.getSnapshot(), ...change })
  }
}
