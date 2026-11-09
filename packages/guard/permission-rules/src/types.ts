/**
 * The `permission/decision` audit event: declaration-merged into
 * `SessionEventMap` by this package's own source, no central registry.
 * Log-only, following `sandbox/mode`'s single-event template — durable and
 * replayable, never in the model transcript.
 *
 * @module @deepseek-ai/dsh-permission-rules/types
 */

import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import type { RuleOutcome } from './schema.ts'

/** What produced one `permission/decision` event: an explicit rule, or the always-on destructive-command classifier. */
export type PermissionDecisionMatch =
  | { readonly kind: 'rule'; readonly priority: number; readonly description?: string }
  | { readonly kind: 'destructive-command'; readonly reason: string }

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * The permission engine (`ctx.tools.guard()` for `deny`, the
     * `tools/pre-execute` listener for `ask`/an explicit `allow`) reached a
     * non-default decision for one pending tool call — log-only audit (like
     * `sandbox/mode`; NOT a surface event, carries no `surfaceOp`).
     *
     * Appended only when the call was actually matched — by an explicit
     * `PermissionRule` or by the destructive-command classifier — not on
     * every unmatched call that falls through to the default allow, which
     * would duplicate the `tool/call` event already logged for every call.
     * `matched` carries the deciding fact (the rule's `priority`/`description`,
     * or the classifier's reason) without repeating the call's raw arguments,
     * which the session log already carries via `tool/call`. An `ask`
     * decision's resolved outcome is not repeated here: it is already the
     * paired `approval/asked`/`approval/decided` audit trail, correlated by
     * `callId`.
     */
    'permission/decision': {
      /** Registry tool name of the pending call. */
      tool: string
      /** The exact call being decided, when the asker has one. */
      callId?: ToolCallId
      /** This engine's resolved outcome for the call. */
      outcome: RuleOutcome
      /** The rule or classifier match that produced `outcome`. */
      matched: PermissionDecisionMatch
    }
  }
}
