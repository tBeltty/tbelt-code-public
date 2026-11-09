/**
 * Human-facing `/undo` command over `@deepseek-ai/dsh-git-safety-net`'s restore path.
 * @module @deepseek-ai/dsh-command-undo
 */

import type { Context } from '@deepseek-ai/cordis'
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands/brand'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { FsError } from '@deepseek-ai/dsh-fs'
import { undo } from '@deepseek-ai/dsh-git-safety-net'

export const name = 'command-undo'
export const inject = ['commands', 'fs']

const USAGE = 'Usage: /undo (no arguments)'

/**
 * Recognize an `FsError` from `undo()`'s restore path. Checks `instanceof` first (correct and
 * sufficient wherever this package and the error's origin share one module graph, e.g. the
 * built application); a workspace test composition that mixes a source-resolved and a
 * built-lib-resolved copy of `@deepseek-ai/dsh-fs` can otherwise produce two distinct `FsError`
 * classes for the same real failure, so `HarnessError` setting `this.name = new.target.name`
 * (stable across either copy) is the fallback.
 */
function isFsError(error: unknown): error is FsError {
  return error instanceof FsError || (error instanceof Error && error.name === 'FsError')
}

/** Describe what one call reverted, for the command's human-facing result text. */
function describeReverted(turn: number, files: readonly { relPath: string }[]): string {
  const list = files.map(file => file.relPath).join(', ')
  const plural = files.length === 1 ? 'file' : 'files'
  return `Reverted turn ${String(turn)}: restored ${String(files.length)} ${plural} (${list}).`
}

/** Execute one argument-free `/undo` request. */
async function executeUndo(ctx: Context, invocation: CommandInvocation): Promise<CommandResult> {
  if (invocation.rawInput.trim().length > 0) {
    return { kind: 'error', text: USAGE }
  }
  try {
    const outcome = await undo(ctx, invocation.agent, invocation.signal)
    if (outcome.kind === 'nothing-to-undo') {
      return { kind: 'success', text: 'Nothing to undo.' }
    }
    return { kind: 'success', text: describeReverted(outcome.turn, outcome.files) }
  } catch (error: unknown) {
    if (invocation.signal.aborted) return { kind: 'error', text: 'Undo cancelled.' }
    // A guarded restore conflict (the file changed since its checkpoint, e.g. `FS_STALE_VERSION`)
    // or any other filesystem failure (`FS_NOT_FOUND`, a missing `git` binary surfacing through
    // `undo()`) is expected, human-facing input to explain, not an implementation bug to rethrow.
    if (isFsError(error)) {
      return { kind: 'error', text: `Undo could not restore the file: ${error.message}` }
    }
    throw error
  }
}

/**
 * Register `/undo` for every composed human-command adapter.
 * @param ctx - context carrying the command registry and `ctx.fs`.
 */
export function apply(ctx: Context): void {
  const active = new Set<Promise<CommandResult>>()
  const handler = (invocation: CommandInvocation): Promise<CommandResult> => {
    const operation = executeUndo(ctx, invocation)
    active.add(operation)
    const retire = (): void => { active.delete(operation) }
    // Both branches retire without rethrowing, so the derived observer promise
    // cannot become an unhandled mirror of an expected handler rejection.
    void operation.then(retire, retire)
    return operation
  }

  ctx.effect(function* () {
    // Yield drain before registration: composite teardown is LIFO, so no new
    // invocation can enter while already-started handler promises quiesce.
    yield async () => { await Promise.allSettled(active) }
    yield ctx.commands.register({
      definitionId: CommandDefinitionId('@deepseek-ai/dsh-command-undo'),
      name: 'undo',
      description: 'Revert the current turn\'s file edits, restoring their pre-edit content',
      handler,
    })
  }, 'command-undo lifecycle')
}
