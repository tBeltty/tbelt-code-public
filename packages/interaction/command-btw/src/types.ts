/**
 * Public vocabulary of the side conversation: its turns, and the `btw`
 * Remote request and result types. Types only; a browser plugin imports this
 * module because its bundle may not carry Host values.
 * @module @deepseek-ai/dsh-command-btw/types
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** One question to the side conversation and the answer it received. */
export interface BtwTurn {
  readonly question: string
  readonly answer: string
}

/** The side conversation of one live Session. */
export interface BtwThread {
  /** Turns in the order they were asked. */
  readonly turns: readonly BtwTurn[]
  /** How many leading turns already reached the main conversation. */
  readonly sentTurns: number
}

/** Failure codes shared by every operation. */
export type BtwErrorCode =
  /** No live Session carries the requested id. */
  | 'session-not-found'
  /** The question is empty after trimming. */
  | 'empty-question'
  /** Another question or delivery of this thread is still running. */
  | 'busy'
  /** The Session has no provider and model to route the question to. */
  | 'no-route'
  /** The model call failed or produced no text. */
  | 'model-failed'
  /** Every turn already reached the main conversation. */
  | 'nothing-to-send'

/** A failed operation with a human-readable reason. */
export interface BtwError {
  readonly code: BtwErrorCode
  readonly message: string
}

/** Result of one Remote operation. */
export type BtwResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: BtwError }

/** Target of an operation that needs only the Session. */
export interface BtwSessionRequest {
  readonly sessionId: SessionId
}

/** One question to ask the side conversation. */
export interface BtwAskRequest extends BtwSessionRequest {
  readonly question: string
}

/** How the delivered context was written. */
export type BtwDeliveryForm = 'verbatim' | 'summary'

/** Postcondition of a delivery to the main conversation. */
export interface BtwDelivery {
  /** Whether the turns were passed word for word or condensed first. */
  readonly form: BtwDeliveryForm
  /** Number of turns this delivery carried. */
  readonly turns: number
}
