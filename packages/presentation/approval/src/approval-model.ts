/**
 * Plain-language approval prompt shared by the GUI and the terminal client. The
 * main sentence says what the agent wants to do in the user's terms; tool names,
 * commands and paths stay in a secondary technical block. A presenter returns
 * locale keys, never translated text.
 * @module @deepseek-ai/dsh-presentation-approval/approval-model
 */
import { classifyTool, type ToolRowVariant } from '@deepseek-ai/dsh-presentation-tool-call'

/** Locale key of the sentence that completes "I need permission to …", one per kind of action. */
export type ApprovalNeedKey =
  | 'need.shell' | 'need.edit' | 'need.read' | 'need.search' | 'need.code' | 'need.generic'

/** Decisions a person can give: allow once, allow for the rest of the session, or reject. */
export type ApprovalChoice = 'allowed-once' | 'allowed-session' | 'rejected'

/** Locale key naming one decision. */
export type ApprovalChoiceKey = 'allowOnce' | 'allowSession' | 'reject'

/** Where a decision sits in the prompt: the default action, the drop-down beside it, or the refusal. */
export type ApprovalChoiceRole = 'primary' | 'menu' | 'reject'

/** One decision a client offers. */
export interface ApprovalChoiceModel {
  id: ApprovalChoice
  labelKey: ApprovalChoiceKey
  role: ApprovalChoiceRole
}

/** The request facts a client has when the Host asks for a decision. */
export interface ApprovalRequestFacts {
  /** Wire name of the tool asking. */
  toolName: string
  /** Tool call the request belongs to, when the asker supplied one. */
  callId?: string | undefined
  /** Requester-written explanation already resolved to the active language. */
  reason?: string | undefined
}

/** Everything a client needs to draw one approval prompt. */
export interface ApprovalModel {
  /** Locale key of the sentence after "I need permission to". */
  needKey: ApprovalNeedKey
  /** The requester's explanation shown after "because", or null when it gave none. */
  because: string | null
  /** Secondary block: raw identifiers for people who want the detail. */
  technical: {
    toolName: string
    callId: string | undefined
    reason: string | undefined
  }
  /** Decisions in display order: primary action, its drop-down entry, then the refusal. */
  choices: readonly ApprovalChoiceModel[]
  /** Identity of the permission for "allow this session"; equal keys are the same permission. */
  scopeKey: string
}

const NEED_KEYS = {
  bash: 'need.shell',
  write: 'need.edit',
  edit: 'need.edit',
  read: 'need.read',
  search: 'need.search',
  code: 'need.code',
  others: 'need.generic',
} as const satisfies Record<ToolRowVariant, ApprovalNeedKey>

/** Decisions every prompt offers. */
const CHOICES: readonly ApprovalChoiceModel[] = [
  { id: 'allowed-once', labelKey: 'allowOnce', role: 'primary' },
  { id: 'allowed-session', labelKey: 'allowSession', role: 'menu' },
  { id: 'rejected', labelKey: 'reject', role: 'reject' },
]

/**
 * Identify a permission for session-scoped grants: the same tool asking for the
 * same stated reason is the same permission.
 * @param request - the request facts.
 * @returns a stable key.
 */
export function approvalScopeKey(request: ApprovalRequestFacts): string {
  return JSON.stringify([request.toolName, request.reason ?? null])
}

/**
 * Derive the approval prompt.
 * @param request - the request facts, with the reason already in the active language.
 * @returns the prompt model.
 */
export function approvalModel(request: ApprovalRequestFacts): ApprovalModel {
  const reason = request.reason === undefined || request.reason.trim() === '' ? undefined : request.reason
  return {
    needKey: NEED_KEYS[classifyTool(request.toolName)],
    because: reason ?? null,
    technical: { toolName: request.toolName, callId: request.callId, reason },
    choices: CHOICES,
    scopeKey: approvalScopeKey({ toolName: request.toolName, reason }),
  }
}

/**
 * Convert a decision into the outcome the Host waterfall accepts. Remembering a
 * grant for the session is client state; the Host sees a one-time allow.
 * @param choice - the decision given.
 * @returns the Host outcome.
 */
export function approvalOutcome(choice: ApprovalChoice): 'allowed-once' | 'rejected' {
  return choice === 'rejected' ? 'rejected' : 'allowed-once'
}
