/**
 * Plans: the newest plan the agent submitted, as printed by `/plan show`.
 * @module @deepseek-ai/dsh-terminal-views/plan
 */
import { submittedPlan } from '@deepseek-ai/dsh-presentation-plan'
import type { SubmittedPlan } from '@deepseek-ai/dsh-presentation-plan'
import type { Style } from './ansi.ts'
import { sanitizeOutput } from './tool-lines.ts'
import type { TranscriptEvent } from './transcript.ts'

/**
 * The newest submitted plan.
 * @param events - session events in order.
 * @returns the plan, or undefined when the loaded history holds none.
 */
export function latestPlan(events: readonly TranscriptEvent[]): SubmittedPlan | undefined {
  for (const event of [...events].reverse()) {
    const plan = submittedPlan({ type: event.type, data: (event as { readonly data?: unknown }).data })
    if (plan !== undefined) return plan
  }
  return undefined
}

/**
 * A plan as printed.
 * @param style - text styles.
 * @param plan - the submitted plan.
 * @returns the title, then the Markdown as written.
 */
export function planLines(style: Style, plan: SubmittedPlan): string[] {
  return [style.bold(plan.title), ...sanitizeOutput(plan.markdown).trimEnd().split('\n')]
}
