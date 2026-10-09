/** Plan resource identities; the plan documents come from the shared presenter. */
import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionAddress } from '@deepseek-ai/dsh-api-session-controller/types'

export { loggedPlan, submittedPlan } from '@deepseek-ai/dsh-presentation-plan'
export type { LoggedPlan, PlanDocument, PlanVersion, SubmittedPlan } from '@deepseek-ai/dsh-presentation-plan'

/** A saved sidebar resource names one invocation in one Session. */
export interface PlanAddress {
  readonly session: SessionAddress
  readonly callId: ToolCallId
}

/**
 * Encode the durable identity of a plan without retaining its text in layout storage.
 * @param target - Session and tool-call identity.
 * @returns the plan resource address.
 */
export function planAddress(target: PlanAddress): string {
  const { session, callId } = target
  const parts = session.kind === 'session'
    ? [session.sessionId, callId]
    : ['subagent', session.parentSessionId, session.childSessionId, session.mode, callId]
  return `dsh-resource://plan/${parts.map(encodeURIComponent).join('/')}`
}

/**
 * Decide whether two plan addresses name plans of the same Session.
 * @param a - First decoded address, or undefined for an address that is not a plan.
 * @param b - Second decoded address.
 * @returns whether both name the same top-level Session or the same subagent child.
 */
export function samePlanSession(a: PlanAddress | undefined, b: PlanAddress): boolean {
  if (a === undefined || a.session.kind !== b.session.kind) return false
  if (a.session.kind === 'session' && b.session.kind === 'session') return a.session.sessionId === b.session.sessionId
  return a.session.kind === 'subagent' && b.session.kind === 'subagent'
    && a.session.parentSessionId === b.session.parentSessionId && a.session.childSessionId === b.session.childSessionId
}

/**
 * Validate a saved or caller-supplied plan resource address.
 * @param address - Address submitted to the sidebar or resource provider.
 * @returns the decoded identity, or undefined for an unsupported address.
 */
export function parsePlanAddress(address: string): PlanAddress | undefined {
  const match = /^dsh-resource:\/\/plan\/([^?#]+)$/.exec(address)
  if (match === null) return undefined
  try {
    const parts = (match[1] as string).split('/').map(decodeURIComponent)
    if (parts.some(part => part === '')) return undefined
    if (parts.length === 2) return {
      session: { kind: 'session', sessionId: parts[0] as SessionId }, callId: parts[1] as ToolCallId,
    }
    if (parts.length === 5 && parts[0] === 'subagent' && (parts[3] === 'one-shot' || parts[3] === 'continuable' || parts[3] === 'unknown')) return {
      session: { kind: 'subagent', parentSessionId: parts[1] as SessionId, childSessionId: parts[2] as SessionId, mode: parts[3] },
      callId: parts[4] as ToolCallId,
    }
    return undefined
  } catch (_error) {
    // Invalid saved percent encoding cannot identify a Session or invocation.
    return undefined
  }
}
