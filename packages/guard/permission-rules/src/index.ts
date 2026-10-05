/**
 * Registers the permission-rule table as a hot-reloadable settings
 * namespace, exposes the resolved, precedence-ordered table on
 * `ctx.permissionRules`, and enforces it on every tool call through two
 * independent mechanisms: a `ctx.tools.guard()` registration for `deny`
 * matches (the unloosenable tier — see `./engine.ts` and the deny/ask
 * architecture note below) and a `tools/pre-execute` listener for `ask`
 * matches and the always-on `destructive-command-policy` classifier. Also
 * closes P3-T2's original deferred scope: `destructive-command-policy` is
 * wired to real enforcement here, not left as an unwired pure function.
 *
 * **Deny/ask architecture** (`packages/core/tools/src/index.ts`,
 * `prepareExecution()`): `ctx.tools.guard()` runs only when the
 * `tools/pre-execute` waterfall already resolved `allow`, and its own doc
 * states no guard can force-allow a call another guard denied — the
 * repo's one genuinely unloosenable enforcement point. A `deny` decided
 * inside `tools/pre-execute` instead would be bypassable by any adversarial
 * or buggy listener registered with `{ prepend: true }` that returns
 * `{ kind: 'allow' }` without calling `next()`: the waterfall short-circuits
 * before our own listener ever runs. `guard()` has no such gap — it is
 * consulted unconditionally on every `allow` resolution regardless of which
 * listener produced it. `deny` rules therefore live in `guard()`, never in
 * `tools/pre-execute`. `ask` rules must live in `tools/pre-execute`:
 * `guard()` is synchronous and deny-only, so it cannot run the approval
 * round-trip `{ kind: 'ask' }` gets for free from the tool registry's own
 * `serviceAsk()`.
 *
 * **Risk-tiered `ask` (P8-T4).** An `ask` decision's `riskTier` (see
 * `./engine.ts`) governs whether `serviceAsk()`'s default round-trip is used
 * at all. An `irreversible` decision always returns `{ kind: 'ask' }` and
 * lets `serviceAsk()` handle it exactly as before — no caching, no
 * exception, every single call. A `reversible` decision instead calls
 * `ctx.approval` itself (the same structural pattern as
 * `packages/sandbox/sandbox/src/escalation.ts`'s `approveEscalation()`),
 * because `serviceAsk()` never reports its outcome back to the listener that
 * requested `ask` — without seeing the outcome, there is nothing to
 * remember for the next identical call. A granted `reversible` call is
 * recorded in `./reversible-ask-cache.ts`, scoped to the session and the
 * exact call shape; a later identical call in that session skips the
 * round-trip and resolves `{ kind: 'allow' }` directly. Nothing in this
 * module ever writes an `irreversible` decision's call shape to that cache —
 * the write path is reached only from the `riskTier === 'reversible'`
 * branch, so an irreversible action cannot be silently promoted to a
 * remembered allow by anything short of a rule-table edit changing its
 * `risk` field (an explicit, out-of-band config change, not an in-session
 * side effect of answering yes once).
 *
 * @module @deepseek-ai/dsh-permission-rules
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-user-approval'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import { evaluateCall, reasonFor } from './engine.ts'
import type { PermissionDecision } from './engine.ts'
import { reversibleAskCacheKey, ReversibleAskCache } from './reversible-ask-cache.ts'
import type { PermissionRule } from './schema.ts'
import { Config, resolveRuleOrder, validateRuleTable } from './schema.ts'
import type { PermissionDecisionMatch } from './types.ts'

export * from './schema.ts'
export * from './engine.ts'
export type { PermissionDecisionMatch } from './types.ts'

export const name = 'permission-rules'
export const inject = ['tools']

/** Settings namespace carrying the permission rule table. */
export const PERMISSION_RULES_SETTINGS_NAMESPACE = 'permission-rules'

declare module '@deepseek-ai/cordis' {
  interface Context {
    permissionRules: PermissionRulesReader
  }
}

/**
 * Read-only access to the resolved rule table, for a consumer that wants to
 * inspect the table itself rather than enforce it — enforcement runs inside
 * this same plugin's `ctx.tools.guard()` and `tools/pre-execute`
 * registrations, which close over the live table directly.
 */
export interface PermissionRulesReader {
  /**
   * The current rule table, sorted ascending by `priority` (a future
   * evaluator's intended iteration order: first match wins).
   * @returns the resolved table as of the last committed settings change, or
   * the composition entry while no settings provider is mounted.
   */
  get(): readonly PermissionRule[]
}

/** Append the `permission/decision` audit event when a call was actually matched (never for an unmatched default allow). */
function auditDecision(exec: ToolExecution, outcome: PermissionRule['outcome'], matched: PermissionDecisionMatch | { kind: 'none' }): void {
  if (matched.kind === 'none') return
  const session = exec.agent?.session
  if (session === undefined) return
  session.append('permission/decision', {
    tool: exec.name,
    outcome,
    matched,
    callId: exec.callId,
  })
}

/**
 * Install the settings namespace, `ctx.permissionRules`, and enforcement.
 * @param ctx - plugin context; every registration's disposer is scoped to it.
 * @param config - validated {@link Config}. `rules` is re-checked here
 * (unique `priority`, well-formed patterns) regardless of settings, per the
 * repo's fail-loud-at-load convention — a composition entry with no settings
 * provider mounted must fail the same way a bad settings write does.
 */
export function apply(ctx: Context, config: Config): void {
  // The composed table must be valid at load; a later live edit that breaks
  // the table keeps the last valid one rather than failing every tool call.
  let source: readonly PermissionRule[] = config.rules.get()
  validateRuleTable(source)
  let current: readonly PermissionRule[] = resolveRuleOrder(source)
  const rules = (): readonly PermissionRule[] => {
    const next = config.rules.get()
    if (next === source) return current
    source = next
    try {
      validateRuleTable(next)
      current = resolveRuleOrder(next)
    } catch (error: unknown) {
      ctx.logger.warn('permission-rules: ignoring an invalid live rule table: %s', error instanceof Error ? error.message : String(error))
    }
    return current
  }
  ctx.provide('permissionRules', { get: rules })
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })

  // The unloosenable `deny` tier. Independently re-evaluates the live table
  // on every call rather than trusting any upstream `tools/pre-execute`
  // decision — see this module's doc comment for why `deny` cannot live in
  // `tools/pre-execute` instead. Synchronous per `ToolGuard`'s signature;
  // `session.append` is itself synchronous, so the audit event is appended
  // directly from the callback rather than deferred to a surrounding
  // listener.
  ctx.tools.guard((exec) => {
    const decision = evaluateCall(rules(), exec.name, exec.arguments)
    if (decision.outcome !== 'deny') return undefined
    auditDecision(exec, decision.outcome, decision.matched)
    return reasonFor(decision, exec.name)
  })

  // Session-scoped memory of a granted `reversible`-tier `ask`. See this
  // module's doc comment for why `irreversible` decisions never touch this
  // cache: the only write path is `resolveReversibleAsk` below, reached only
  // when `decision.riskTier === 'reversible'`.
  const reversibleGrants = new ReversibleAskCache()

  // The `ask` tier, plus the always-on destructive-command classifier and
  // the explicit-`allow` override. A `deny` match falls through to `next()`
  // unhandled here: `ctx.tools.guard()` above independently re-evaluates the
  // same table and denies it regardless of what this listener decided,
  // making this listener's own resolution irrelevant for `deny` — evaluating
  // it twice here would be dead logic, not defense in depth.
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    const decision = evaluateCall(rules(), exec.name, exec.arguments)
    if (decision.outcome === 'deny') return next()
    if (decision.outcome === 'allow') {
      auditDecision(exec, decision.outcome, decision.matched)
      return next()
    }
    if (decision.riskTier === 'reversible') return resolveReversibleAsk(ctx, reversibleGrants, exec, decision)
    auditDecision(exec, decision.outcome, decision.matched)
    return { kind: 'ask', reason: reasonFor(decision, exec.name) }
  })
}

/**
 * Resolve a `reversible`-tier `ask` decision: reuse a prior same-session
 * grant for the identical call shape when one exists, otherwise run the
 * approval round-trip directly (mirroring the tool registry's own
 * `serviceAsk()` mapping) so the outcome can be recorded for next time.
 * Never called for an `irreversible` decision — see this module's doc
 * comment.
 * @param ctx - plugin context, used to read the optional `approval` service.
 * @param cache - the session-scoped reversible-grant memory to check and update.
 * @param exec - the pending call.
 * @param decision - the resolved `ask` decision (`riskTier === 'reversible'`).
 * @returns the decision to hand back to the `tools/pre-execute` waterfall.
 */
async function resolveReversibleAsk(
  ctx: Context,
  cache: ReversibleAskCache,
  exec: ToolExecution,
  decision: PermissionDecision,
): Promise<PreToolDecision> {
  const session = exec.agent?.session
  const key = reversibleAskCacheKey(exec.name, exec.arguments)
  if (session !== undefined && cache.has(session.id, key)) {
    auditDecision(exec, 'allow', decision.matched)
    return { kind: 'allow' }
  }
  auditDecision(exec, decision.outcome, decision.matched)
  const reason = reasonFor(decision, exec.name)
  const approval = ctx.get('approval')
  if (approval === undefined) return { kind: 'deny', reason }
  if (exec.agent === undefined) return { kind: 'deny', reason }
  const outcome = await approval.request({
    agent: exec.agent,
    toolName: exec.name,
    callId: exec.callId,
    reason,
    signal: exec.signal,
  })
  switch (outcome) {
    case 'allowed-once':
      if (session !== undefined) cache.remember(session.id, key)
      return { kind: 'allow' }
    case 'rejected': return { kind: 'deny', reason: `the user rejected tool "${exec.name}"` }
    case 'cancelled': return { kind: 'deny', reason: `approval for tool "${exec.name}" was cancelled` }
    case 'unavailable': return { kind: 'deny', reason: `tool "${exec.name}" requires approval, but no approval channel is available` }
    default: return assertNever(outcome, 'ApprovalOutcome')
  }
}
