/**
 * `/clear` command: a manual, full-history reset of the current session's
 * surface. The durable log is never mutated — the current surface span after
 * the system prompt is shadowed via the same `surfaceOp: { op: 'replace' }` mechanism
 * compaction uses, under its own `context/clear` event so a manual reset
 * never enters compaction's own analytics. Nothing is lost: the shadowed
 * span's rendered text is captured into the replacement checkpoint's own
 * message source while it is still on the live surface, which is what
 * `readClearedHistory` below reads back for `/clear --history`.
 *
 * @module @deepseek-ai/dsh-command-clear
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands/brand'
import type { CommandId } from '@deepseek-ai/dsh-commands/brand'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Message } from '@deepseek-ai/dsh-llm'
import type { TokenMeter } from '@deepseek-ai/dsh-token-meter'
// Type-only: the `ctx.goals` Context merge for the optional open-goal notice.
import type {} from '@deepseek-ai/dsh-goal'
// Type-only: the `ctx.tokenMeter` Context merge for the shadow-price estimate.
import type {} from '@deepseek-ai/dsh-token-meter'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import { ClearId } from './brand.ts'
import { clearCheckpointSource, isClearCheckpointSource } from './checkpoint.ts'
import { ManualClearError } from './errors.ts'
import type {} from './types.ts'

export { ClearId } from './brand.ts'
export { clearCheckpointSource, isClearCheckpointSource } from './checkpoint.ts'
export type { ClearCheckpointSource } from './checkpoint.ts'
export { ManualClearError } from './errors.ts'
export type { ManualClearErrorCode } from './errors.ts'

export const name = 'command-clear'
export const inject = ['commands', 'tokenMeter']

/** Landed result of one manual clear transaction. */
export interface ClearResult {
  readonly clearId: ClearId
  readonly shadowedSeqs: readonly SessionSeq[]
  readonly shadowedTokenCount: number
  readonly replacementSeq: SessionSeq
}

/**
 * Reset the agent's session to its system prompt, shadowing the rest of the
 * current history under one `context/clear` transaction. Requires an idle agent,
 * the same guarantee `/compact` and `/undo` rely on for a session mutation.
 * @param agent - agent whose session is reset.
 * @param tokenMeter - meter that estimates the shadowed tokens. Passed in
 * because `agent.ctx` does not inject `tokenMeter`.
 * @param sourceCommandId - initiating `/clear` command, when manual.
 * @returns the landed transaction, or `null` when there was nothing to clear.
 * @throws {@link ManualClearError} `busy` when other work owns the agent,
 * `commit` when the session rejects the transaction, or `persistence` when
 * the committed clear cannot be saved.
 */
export async function clearNow(
  agent: Agent,
  tokenMeter: TokenMeter,
  sourceCommandId?: CommandId,
): Promise<ClearResult | null> {
  let pending: Promise<ClearResult | null>
  try {
    pending = agent.runMaintenance(async () => {
      const { session } = agent
      // The system prompt at node 0 stays; the session only accepts a
      // `system/message` replacement over that node.
      const keepsHead = session.surface.headIsSystemPrompt
      const shadowedSeqs = session.surface.nodes.slice(keepsHead ? 1 : 0)
      const start = shadowedSeqs[0]
      const end = shadowedSeqs[shadowedSeqs.length - 1]
      if (start === undefined || end === undefined) return null

      // The shadowed span runs to the end of the surface, so `deriveMessages()`
      // (the live projection) minus the system prompt is exactly the content
      // this clear removes — read it here, while it is still live, instead of
      // reading the durable log back by seq after the fact. An empty system
      // prompt derives no message.
      const liveMessages = session.deriveMessages()
      const shadowedMessages = keepsHead && liveMessages[0]?.role === 'system' ? liveMessages.slice(1) : liveMessages
      let shadowedTokenCount = 0
      for (const message of shadowedMessages) shadowedTokenCount += tokenMeter.estimateMessage(message)
      const shadowedText = renderMessages(shadowedMessages)

      const clearId = ClearId(randomUUID())
      let replacement
      try {
        session.append('context/clear', {
          clearId,
          ...sourceCommandId === undefined ? {} : { sourceCommandId },
          shadowedRange: { start, end },
          shadowedSeqs,
          shadowedTokenCount,
        })
        replacement = session.append('user/message', createUserMessage({
          content: [{ type: 'text', text: 'Context cleared.' }],
          source: clearCheckpointSource(clearId, shadowedText, sourceCommandId),
        }), {
          surfaceOp: { op: 'replace', startSeq: start, endSeq: end },
          sourceEventSeqs: [...shadowedSeqs],
        })
      } catch (error: unknown) {
        throw new ManualClearError('commit', 'clear could not be committed', { cause: error })
      }
      try {
        await agent.ctx.sessions.flush(session)
      } catch (error: unknown) {
        throw new ManualClearError('persistence', 'clear finished, but the session could not be saved', { cause: error })
      }
      return { clearId, shadowedSeqs, shadowedTokenCount, replacementSeq: replacement.seq }
    })
  } catch (error: unknown) {
    // `runMaintenance` throws synchronously only when other work owns the agent.
    throw new ManualClearError('busy', 'clear requires an idle agent with no waking queued work', { cause: error })
  }
  return await pending
}

/** Render messages as `role: text` blocks, one per line pair, skipping empty content. */
function renderMessages(messages: readonly Message[]): string {
  const lines: string[] = []
  for (const message of messages) {
    const text = message.content
      .map(block => block.type === 'text' ? block.text : `[${block.type}]`)
      .join('')
      .trim()
    if (text !== '') lines.push(`${message.role}: ${text}`)
  }
  return lines.join('\n\n')
}

/**
 * Reconstruct the most recently cleared span as readable text, for
 * `/clear --history`. The replacement checkpoint carries the shadowed span's
 * rendered text in its own message source (captured while that content was
 * still live), so this reads the current surface rather than the durable log
 * by seq.
 * @param agent - agent whose current surface is read.
 * @returns rendered text of the last cleared span, or `null` when this
 * session has never been cleared.
 */
export function readClearedHistory(agent: Agent): string | null {
  const { session } = agent
  const messages = session.deriveMessages()
  for (let i = messages.length - 1; i >= 0; i--) {
    // oxlint-disable-next-line typescript/no-non-null-assertion -- bounded by the loop condition
    const message = messages[i]!
    if (!isClearCheckpointSource(message.source)) continue
    return message.source.shadowedText === '' ? null : message.source.shadowedText
  }
  return null
}

const USAGE = 'Usage: /clear (no arguments)'
const HISTORY_USAGE = 'Usage: /cleared (no arguments)'

/** Fail loudly if a locally closed union gains an unhandled member. */
/* v8 ignore start -- closed-union backstop is unreachable without violating the TypeScript contract */
function assertNever(value: never): never {
  throw new TypeError(`unknown manual clear error code: ${String(value)}`)
}
/* v8 ignore stop */

/**
 * Execute one `/cleared` invocation: a read-only query, never a mutation —
 * named in the past tense so it does not read as another way to clear. A
 * separate, argument-free command rather than a `/clear --history` flag:
 * declaring an `input` descriptor on `/clear` itself would put its common,
 * argument-free invocation through the composer's two-step claim-then-submit
 * flow too — the same reason `/compact` declares no `input` despite also
 * being argument-free in its common case.
 */
function executeCleared(invocation: CommandInvocation): CommandResult {
  if (invocation.rawInput.trim().length > 0) return { kind: 'error', text: HISTORY_USAGE }
  const text = readClearedHistory(invocation.agent)
  return text === null
    ? { kind: 'success', text: 'Nothing has been cleared in this session yet.' }
    : { kind: 'success', text }
}

/** Execute one `/clear` invocation. */
async function executeClear(ctx: Context, invocation: CommandInvocation): Promise<CommandResult> {
  if (invocation.rawInput.trim().length > 0) return { kind: 'error', text: USAGE }

  const goal = ctx.get('goals')?.get(invocation.agent)
  const goalNotice = goal !== undefined && goal.phase !== 'complete'
    ? ' Note: an active Goal exists; clearing removes the context that explains it, not the Goal itself.'
    : ''

  try {
    const result = await clearNow(invocation.agent, ctx.tokenMeter, invocation.commandId)
    if (result === null) return { kind: 'success', text: 'Nothing to clear yet.' }
    return {
      kind: 'success',
      text: `Cleared ${result.shadowedSeqs.length} history items (~${result.shadowedTokenCount} tokens).${goalNotice}`,
      sourceEventSeq: result.replacementSeq,
    }
  } catch (error: unknown) {
    if (invocation.signal.aborted) return { kind: 'error', text: 'Clear cancelled.' }
    if (error instanceof ManualClearError) {
      switch (error.code) {
        case 'busy':
          return { kind: 'error', text: 'Clear is unavailable because this process has an active operation, or the agent is not idle.' }
        case 'cancelled':
          return { kind: 'error', text: 'Clear cancelled.' }
        case 'commit':
          return { kind: 'error', text: 'Clear did not finish cleanly; inspect the current session state before retrying.' }
        case 'persistence':
          return { kind: 'error', text: 'Clear finished, but the session could not be saved.' }
        /* v8 ignore next 2 -- ManualClearErrorCode is closed and every member is handled above */
        default: return assertNever(error.code)
      }
    }
    throw error
  }
}

/**
 * Register `/clear` and `/cleared` for every composed human-command adapter.
 * @param ctx - context carrying the command registry.
 */
export function apply(ctx: Context): void {
  const active = new Set<Promise<CommandResult>>()
  const track = (operation: Promise<CommandResult>): Promise<CommandResult> => {
    active.add(operation)
    const retire = (): void => { active.delete(operation) }
    void operation.then(retire, retire)
    return operation
  }

  ctx.effect(function* () {
    yield async () => { await Promise.allSettled(active) }
    yield ctx.commands.register({
      definitionId: CommandDefinitionId('@deepseek-ai/dsh-command-clear'),
      name: 'clear',
      description: 'Reset the conversation to empty context',
      handler: invocation => track(executeClear(ctx, invocation)),
    })
    yield ctx.commands.register({
      definitionId: CommandDefinitionId('@deepseek-ai/dsh-command-clear'),
      name: 'cleared',
      description: 'View what the last /clear removed (read-only, does not clear)',
      handler: invocation => track(Promise.resolve(executeCleared(invocation))),
    })
  }, 'command-clear lifecycle')
}
