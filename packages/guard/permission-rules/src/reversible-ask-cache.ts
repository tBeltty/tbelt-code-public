/**
 * Session-scoped memory of a granted `reversible`-tier `ask` decision, so an
 * identical later call in the same session can be auto-approved without
 * asking again. Deliberately narrow: nothing in this module, or any caller
 * of it, ever stores or consults an `irreversible`-tier decision — the only
 * write path is `./index.ts`'s reversible-ask branch, which is itself only
 * reached when `PermissionDecision.riskTier === 'reversible'` (see
 * `./engine.ts`). An `irreversible` decision's call shape is never passed to
 * {@link ReversibleAskCache.remember}, so there is no code path by which it
 * could be silently promoted to a remembered allow.
 *
 * @module @deepseek-ai/dsh-permission-rules/reversible-ask-cache
 */

import type { SessionId } from '@deepseek-ai/dsh-session'

/**
 * Build the cache key for one call shape: same tool, same arguments. Two
 * calls with the same tool name but different arguments (e.g. two different
 * shell commands both classified `reversible`) are deliberately distinct
 * entries — "the identical call" means identical arguments, not merely the
 * same matched rule.
 * @param toolName - the registry tool name of the pending call.
 * @param args - the pending call's raw arguments (losslessly JSON-serializable, per `ToolExecutionInput.arguments`'s own contract).
 * @returns a stable string key for this exact call shape.
 */
export function reversibleAskCacheKey(toolName: string, args: unknown): string {
  return `${toolName} ${JSON.stringify(args)}`
}

/**
 * Per-session set of call shapes already granted a `reversible`-tier `ask`.
 * Holds no data for a session it has not seen; entries live for the
 * process lifetime of the owning plugin instance (see the package README's
 * Known Limitations — this is not cleared on session disposal).
 */
export class ReversibleAskCache {
  private readonly bySession = new Map<SessionId, Set<string>>()

  /**
   * Whether this exact call shape was already granted in this session.
   * @param sessionId - the session the call belongs to.
   * @param key - a key from {@link reversibleAskCacheKey}.
   * @returns `true` when a prior identical call in this session was granted.
   */
  has(sessionId: SessionId, key: string): boolean {
    return this.bySession.get(sessionId)?.has(key) ?? false
  }

  /**
   * Record that this exact call shape was just granted in this session.
   * @param sessionId - the session the call belongs to.
   * @param key - a key from {@link reversibleAskCacheKey}.
   */
  remember(sessionId: SessionId, key: string): void {
    let granted = this.bySession.get(sessionId)
    if (granted === undefined) {
      granted = new Set()
      this.bySession.set(sessionId, granted)
    }
    granted.add(key)
  }
}
