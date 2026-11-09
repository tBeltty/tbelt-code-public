/**
 * Plan documents recovered from logged `exit_plan_mode` calls, shared by every
 * client. Input is untrusted Session history; malformed data yields no plan.
 * @module @deepseek-ai/dsh-presentation-plan/plan-document
 */
import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand'

/** Complete Markdown and the heading displayed by a plan preview. */
export interface PlanDocument {
  readonly markdown: string
  readonly title: string
}

/** One submitted plan, identified by its originating tool invocation. */
export interface SubmittedPlan extends PlanDocument {
  readonly callId: ToolCallId
}

/** One version of a plan document. */
export interface PlanVersion {
  readonly callId: ToolCallId
  readonly title: string
}

/** A logged plan together with every version of its plan-mode episode. */
export interface LoggedPlan extends SubmittedPlan {
  /** Plans submitted between the episode's `plan/mode` activation and the next one, oldest first; includes this plan. */
  readonly versions: readonly PlanVersion[]
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read a complete plan from untrusted logged arguments.
 * @param event - Native call or PTC dispatch event from Session history.
 * @returns the submitted plan, or undefined for unrelated or malformed data.
 */
export function submittedPlan(event: { readonly type: string; readonly data: unknown }): SubmittedPlan | undefined {
  if (event.type !== 'tool/call' && event.type !== 'tool/ptc-dispatch-start' && event.type !== 'tool/ptc-dispatch') return undefined
  const data = event.data
  if (!record(data) || data.name !== 'exit_plan_mode') return undefined
  const callId = event.type === 'tool/call' ? data.callId : data.subCallId
  if (typeof callId !== 'string' || callId === '') return undefined
  let args: unknown = data.arguments
  if (event.type === 'tool/call') {
    if (typeof args !== 'string') return undefined
    try { args = JSON.parse(args) as unknown }
    catch (_error) { return undefined /* Malformed model JSON remains in the generic tool row. */ }
  }
  if (!record(args) || typeof args.plan !== 'string') return undefined
  const markdown = args.plan
  const title = /^#\s+(\S[^\r\n]*)/.exec(markdown.trim())?.[1]
  return title === undefined ? undefined : { callId: callId as ToolCallId, markdown, title }
}

/**
 * Group logged plans into versions of one document: every plan submitted
 * after the same `plan/mode` activation is a version of that episode's plan.
 * @param events - Session events in log order.
 * @param callId - Invocation whose document is wanted.
 * @returns the invocation's plan and its episode versions, or undefined when the events hold no such plan.
 */
export function loggedPlan(
  events: readonly { readonly type: string; readonly data: unknown }[], callId: ToolCallId,
): LoggedPlan | undefined {
  let episode: PlanVersion[] = []
  let found: SubmittedPlan | undefined
  let versions: readonly PlanVersion[] = []
  for (const event of events) {
    if (event.type === 'plan/mode' && record(event.data) && event.data.active === true) {
      if (found !== undefined) break
      episode = []
      continue
    }
    const plan = submittedPlan(event)
    if (plan === undefined || episode.some(version => version.callId === plan.callId)) continue
    episode.push({ callId: plan.callId, title: plan.title })
    if (plan.callId === callId) found = plan
    if (found !== undefined) versions = episode
  }
  return found === undefined ? undefined : { ...found, versions }
}
