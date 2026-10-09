/**
 * Tool call and result blocks: the recursive record a Session projects for one call from preparation to result.
 * @module @deepseek-ai/dsh-presentation-tool-call/blocks
 */
import type { ContentBlock } from '@deepseek-ai/dsh-llm/types'

/** A tool result paired (when in-window) with its call head. */
export interface ToolResultNode {
  kind: 'tool-result'
  seq: number
  /** Unix epoch ms from the tool/result session event. */
  time: number
  callId: string
  /** Parent Tool call for a PTC dispatch result; absent on a root Session result. */
  parentCallId?: string
  /** Call head backfilled from the in-window tool/call; null when window truncation left the call outside (card head shows callId). */
  call: { name: string; argsRaw: string } | null
  /** Unix epoch ms of the paired tool/call when the call is still in-window; used for call-row duration. */
  callTime: number | null
  content: readonly ContentBlock[]
  isError: boolean
  error?: { name: string; code: string; reason?: string }
  meta?: unknown
  /** Child calls owned by this call, in dispatch order. */
  subCalls: readonly ToolCallBlock[]
}

/** Identity and placement shared by tool preparation and dispatch. */
interface ToolCallHead {
  callId: string
  /** Parent Tool call for a PTC dispatch start; absent on a root Session call. */
  parentCallId?: string
  name: string
  turn: number
  step: number
  /** Unix epoch ms when this stage began. */
  time: number
  /** Child calls owned by this call, in dispatch order. */
  subCalls: readonly ToolCallBlock[]
}

/** A named model call whose arguments are not yet available to tool views. */
export interface PreparingToolCall extends ToolCallHead {
  readonly phase: 'preparing'
}

/** A dispatched tool call with complete arguments and no result yet. */
export interface StartedToolCall extends ToolCallHead {
  readonly phase: 'start'
  readonly argsRaw: string
}

/** A tool still preparing or awaiting its result. */
export type RunningToolCall = PreparingToolCall | StartedToolCall

/** One preparing, dispatched, or settled call, recursively owning its child calls. */
export type ToolCallBlock = RunningToolCall | ToolResultNode
