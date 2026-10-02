/**
 * Git safety net: records the pre-edit content of every agent-initiated file edit as a
 * checkpoint commit, before the edit proceeds, so it is durably recoverable independent of
 * whatever the edit itself does to the file. Registers a `fs/edit-intent` listener (the same
 * waterfall `@deepseek-ai/dsh-fs-observation-policy` and `@deepseek-ai/dsh-tool-search-replace`
 * use) that snapshots and always delegates — it never owns the edit-intent decision.
 * @module @deepseek-ai/dsh-git-safety-net
 */

import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-session-projection'
import {
  buildCheckpointTree,
  commitCheckpointTree,
  currentHead,
  findRepoRoot,
  updateCheckpointRef,
  writeBlob,
} from './git-plumbing.ts'

export { CHECKPOINT_REF, GitPlumbingError } from './git-plumbing.ts'
export { undo } from './undo.ts'
export type { UndoOutcome, UndoRevertedFile } from './undo.ts'

/**
 * Minimal actor shape this package reads off `fs/edit-intent`'s opaque `actor` argument: the
 * agent on whose behalf the edit runs, when there is one (a direct tool call with no agent
 * supplies none). Structurally compatible with `@deepseek-ai/dsh-fs-observation-policy`'s own
 * `FsObservationActor` without depending on that package.
 */
interface GitSafetyNetActor {
  agent?: Agent
}

/**
 * The turn to stamp a checkpoint with: `agent.session`'s `turnBoundary` projection `lastTurn`
 * when both an agent and the (optional) `sessionProjections` registry are available, else `0`
 * ("no attributable turn" — matches `@deepseek-ai/dsh-agent`'s `TurnBoundaryProjection` own
 * documented capability-absence contract, and is what an edit with no agent, or a composition
 * with no `@deepseek-ai/dsh-agent-loop` mounted, always reports).
 * @param ctx - context checkpointing may read the optional `sessionProjections` registry from.
 * @param actor - the `fs/edit-intent` waterfall's opaque actor argument.
 */
function resolveTurn(ctx: Context, actor: object | undefined): number {
  // tsgolint treats object as assignable to weak GitSafetyNetActor, while tsc still requires the structural cast for property access.
  // See the analyzer-divergence consequence in .agents/notes/archived/process/2026-07-29-oxlint-linter.md.
  // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- The analyzers disagree on this weak type.
  const agent = (actor as GitSafetyNetActor | undefined)?.agent
  if (agent === undefined) return 0
  return ctx.get('sessionProjections')?.stateOf(agent.session, 'turnBoundary')?.lastTurn ?? 0
}

/** Cordis plugin name used by loader diagnostics. */
export const name = 'git-safety-net'

export const inject = ['fs']

/** Format an unknown thrown value into one line of diagnostic text, without assuming `Error`. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Per-context checkpoint chain state: the latest checkpoint commit recorded this session for
 * each repository, so consecutive checkpoints chain onto each other rather than onto `HEAD`
 * every time (`refs/tbelt-code/checkpoints` stays a real, walkable history). Keyed by
 * repository root path.
 */
class CheckpointChain {
  private latestByRepo = new Map<string, string>()

  /** Drop all recorded chain state (HMR safety / disposal). */
  clear(): void {
    this.latestByRepo.clear()
  }

  /**
   * Snapshot `content` as the pre-edit state of the file at `absolutePath` inside `repoRoot`,
   * chaining the new checkpoint commit onto the previous one this session recorded for the
   * same repository, or onto the repository's current `HEAD` when none has been recorded yet.
   * @param repoRoot - the repository's top-level absolute path.
   * @param absolutePath - the edited file's absolute path (must be inside `repoRoot`).
   * @param content - the file's on-disk content immediately before the edit.
   * @param turn - the recording agent's current turn (0 when unattributable); embedded, with
   *   `relPath`, as `Checkpoint-Turn:`/`Checkpoint-Path:` trailers so `undo()` can later walk
   *   the chain by turn without depending on the tree diff (a checkpoint's tree is often
   *   identical to its parent's — see `CheckpointCommitInfo.path`'s doc for why).
   */
  async snapshot(repoRoot: string, absolutePath: string, content: string, turn: number): Promise<void> {
    const relPath = relative(repoRoot, absolutePath).split(sep).join('/')
    const parent = this.latestByRepo.get(repoRoot) ?? await currentHead(repoRoot)
    const blobSha = await writeBlob(repoRoot, content)
    const scratchIndexPath = join(tmpdir(), `tbelt-code-checkpoint-${randomUUID()}.index`)
    try {
      const treeSha = await buildCheckpointTree(repoRoot, parent, relPath, blobSha, scratchIndexPath)
      const commitSha = await commitCheckpointTree(
        repoRoot,
        treeSha,
        parent,
        `checkpoint: pre-edit snapshot of ${relPath}\n\nCheckpoint-Turn: ${String(turn)}\nCheckpoint-Path: ${relPath}`,
      )
      await updateCheckpointRef(repoRoot, commitSha)
      this.latestByRepo.set(repoRoot, commitSha)
    } finally {
      // Best-effort: a leaked scratch index file is inert (never referenced
      // by anything once this call returns) and does not affect correctness.
      await rm(scratchIndexPath, { force: true })
    }
  }
}

/**
 * Register the `fs/edit-intent` listener. `prepend: true` is required, not cosmetic:
 * `fs-observation-policy`'s own `fs/edit-intent` listener occupies the single decision slot and
 * never calls `next()` (see its own source), so a listener registered after it in an ordinary
 * (push) slot would never run at all. Registering first guarantees this listener always observes
 * the pre-edit content, regardless of what other `fs/edit-intent` listeners the composition mounts
 * or their relative registration order in the bundle.
 * @param ctx - the composition context; requires `ctx.fs` to read pre-edit content and resolve
 *   the edited file's process path.
 */
export function apply(ctx: Context): void {
  const chain = new CheckpointChain()

  ctx.effect(() => () => {
    chain.clear()
  }, 'git-safety-net checkpoint-chain teardown')

  ctx.on('fs/edit-intent', async (target: FsTarget, actor, next) => {
    try {
      const absolutePath = ctx.fs.processPath(target)
      const repoRoot = await findRepoRoot(dirname(absolutePath))
      if (repoRoot === undefined) {
        ctx.logger.debug(`git-safety-net: "${target.displayPath}" is not inside a git repository, skipping checkpoint`)
      } else {
        const content = await ctx.fs.readText(target)
        await chain.snapshot(repoRoot, absolutePath, content, resolveTurn(ctx, actor))
      }
    } catch (error: unknown) {
      // A checkpoint is a safety net, not a precondition for editing: any failure here
      // (missing git binary, unreadable file, plumbing error) is logged, never thrown,
      // so it can never block or fail the edit it was meant to protect against.
      ctx.logger.warn(`git-safety-net: checkpoint failed for "${target.displayPath}": ${describeError(error)}`)
    }
    return next()
  }, { prepend: true })
}
