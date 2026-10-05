/**
 * `/undo` restore path: reverts every file the current turn checkpointed back to its content
 * immediately before that turn's first edit to it, going through the ordinary `ctx.fs` write
 * path rather than a raw filesystem write.
 * @module @deepseek-ai/dsh-git-safety-net/undo
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-session-projection'
import {
  findRepoRoot,
  readCheckpointCommit,
  readCheckpointedContent,
  resolveCheckpointRef,
} from './git-plumbing.ts'

/** One file {@link undo} restored, and the checkpoint whose recorded content supplied it. */
export interface UndoRevertedFile {
  /** Path relative to the repository root, `/`-separated. */
  readonly relPath: string
  /** The oldest checkpoint of `relPath` within the reverted turn — content from before that turn's first edit to it. */
  readonly fromCheckpointSha: string
}

/** Outcome of one {@link undo} call. */
export type UndoOutcome =
  | { readonly kind: 'reverted'; readonly turn: number; readonly files: readonly UndoRevertedFile[] }
  /** No turn has started yet, or no checkpoint in the repository belongs to the current turn. */
  | { readonly kind: 'nothing-to-undo' }

/**
 * Revert every file `agent`'s current turn checkpointed, restoring each to its content
 * immediately before that turn's first edit to it.
 *
 * "Current turn" is `agent.session`'s `turnBoundary` projection `lastTurn` — the turn number of
 * the latest `turn/start` recorded by `@deepseek-ai/dsh-agent-loop`, whether or not it has
 * closed yet (0, and therefore `nothing-to-undo`, before any turn starts). Absent that
 * projection — no agent-loop mounted — this is always `nothing-to-undo`, matching the
 * projection's own documented capability-absence contract rather than treating it as an error.
 *
 * Checkpoints record one file's pre-edit content per commit, chained newest-first under
 * `CHECKPOINT_REF`, each tagged with the turn that produced it. A file edited more than once in
 * the reverted turn has more than one checkpoint; this restores it to the OLDEST one recorded
 * this turn (immediately before the turn's first edit to it), not the most recent, so one
 * `/undo` reverts the turn's complete effect on that file rather than just its last edit.
 *
 * Each restore is a full-file replacement, so it goes through the same `fs/write-intent` →
 * `writeText` → `fs/observed` sequence a whole-file tool write uses (not `fs/edit-intent`,
 * whose `{ version }` guard shape is for `editText`'s literal search/replace, not a full-content
 * write): a file independently modified since its checkpoint reports `FS_STALE_VERSION` through
 * the same guard an ordinary write would hit instead of silently overwriting it. A rejected or
 * failed restore stops the loop; files already restored in this call stay reverted.
 *
 * @param ctx - context carrying `ctx.fs` and, when composed, the optional `sessionProjections` registry.
 * @param agent - the agent whose current turn is reverted; its session's `cwd` locates the repository.
 * @param signal - aborts the restore between files.
 * @returns the reverted turn and files, or `nothing-to-undo` when there is no turn, no
 *   repository, or no checkpoint belonging to the current turn.
 */
export async function undo(ctx: Context, agent: Agent, signal: AbortSignal): Promise<UndoOutcome> {
  const turn = ctx.get('sessionProjections')?.stateOf(agent.session, 'turnBoundary')?.lastTurn ?? 0
  if (turn === 0) return { kind: 'nothing-to-undo' }
  const cwd = agent.session.header.cwd
  if (cwd === undefined) return { kind: 'nothing-to-undo' }
  const repoRoot = await findRepoRoot(cwd)
  if (repoRoot === undefined) return { kind: 'nothing-to-undo' }

  // Walk the chain newest -> oldest; each older match for the same path overwrites the newer
  // one recorded here, so the surviving sha per path, once the walk stops, is the OLDEST
  // checkpoint of that path within the turn.
  const oldestShaByPath = new Map<string, string>()
  let sha = await resolveCheckpointRef(repoRoot)
  while (sha !== undefined) {
    const commit = await readCheckpointCommit(repoRoot, sha)
    if (commit.turn === undefined || commit.path === undefined || commit.turn !== turn) break
    oldestShaByPath.set(commit.path, sha)
    sha = commit.parent
  }
  if (oldestShaByPath.size === 0) return { kind: 'nothing-to-undo' }

  const actor = { agent }
  const files: UndoRevertedFile[] = []
  for (const [relPath, fromCheckpointSha] of oldestShaByPath) {
    signal.throwIfAborted()
    const content = await readCheckpointedContent(repoRoot, fromCheckpointSha, relPath)
    const target = await ctx.fs.resolve(relPath, { cwd: repoRoot, signal })
    const intent = await ctx.waterfall('fs/write-intent', target, actor, () => undefined)
    const outcome = await ctx.fs.writeText(target, content, intent, signal)
    ctx.emit('fs/observed', target, { kind: 'present', version: outcome.version }, actor)
    files.push({ relPath, fromCheckpointSha })
  }
  return { kind: 'reverted', turn, files }
}
