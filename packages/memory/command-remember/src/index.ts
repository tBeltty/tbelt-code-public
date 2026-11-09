/**
 * Human-facing `/remember` command: the explicit write path for a durable
 * memory entry, over `@deepseek-ai/dsh-memory-storage`'s `writeEntry`.
 * Registration shape mirrors `packages/git-safety/command-undo`: an
 * in-flight-operation `Set`, drain-before-teardown via `ctx.effect`.
 * @module @deepseek-ai/dsh-command-remember
 */

import type { Context } from '@deepseek-ai/cordis'
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands/brand'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { MEMORY_ENTRY_TYPES } from '@deepseek-ai/dsh-memory-storage'
import type { MemoryEntryType } from '@deepseek-ai/dsh-memory-storage'

export const name = 'command-remember'
export const inject = ['commands', 'memoryStorage']

/**
 * `/remember [--type=user|feedback|project|reference] [--global] <name> <text to remember...>`
 *
 * `--type` defaults to `user`; scope defaults to `project` (resolved from
 * the invoking session's `cwd`) unless `--global` is given. `<name>` is the
 * entry's slug (lowercase, hyphen-separated); every remaining word is the
 * entry's content, stored verbatim (after redaction) as the topic file's
 * body and, truncated, as its index description.
 */
const USAGE = 'Usage: /remember [--type=user|feedback|project|reference] [--global] <name> <text to remember>'

const DESCRIPTION_MAX_LENGTH = 140

/** One successfully parsed `/remember` invocation. */
interface ParsedRemember {
  type: MemoryEntryType
  projectScope: 'project' | 'global'
  name: string
  content: string
}

/** Split `text` into its first whitespace-delimited token and the (trimmed) remainder. */
function splitFirstToken(text: string): { token: string; rest: string } | undefined {
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(text)
  if (match === null) return undefined
  return { token: match[1] ?? '', rest: (match[2] ?? '').trim() }
}

/** Derive a short index/description summary from the full content. */
function summarize(content: string): string {
  if (content.length <= DESCRIPTION_MAX_LENGTH) return content
  return `${content.slice(0, DESCRIPTION_MAX_LENGTH - 1)}…`
}

/**
 * Parse one `/remember` invocation's raw input: leading `--type=`/`--global`
 * flags in any order, then the entry name, then its content.
 * @param rawInput - text following the command name (see {@link CommandInvocation.rawInput}).
 * @returns the parsed fields, or a usage error string.
 */
function parseRemember(rawInput: string): ParsedRemember | { error: string } {
  let remaining = rawInput.trim()
  let type: MemoryEntryType = 'user'
  let projectScope: 'project' | 'global' = 'project'

  for (;;) {
    const split = splitFirstToken(remaining)
    if (split === undefined) break
    if (split.token === '--global') {
      projectScope = 'global'
      remaining = split.rest
      continue
    }
    const typeMatch = /^--type=(.+)$/.exec(split.token)
    if (typeMatch !== null) {
      const candidate = typeMatch[1] ?? ''
      if (!(MEMORY_ENTRY_TYPES as readonly string[]).includes(candidate)) {
        return { error: `Unknown --type value "${candidate}". Valid types: ${MEMORY_ENTRY_TYPES.join(', ')}.` }
      }
      type = candidate as MemoryEntryType
      remaining = split.rest
      continue
    }
    break
  }

  const nameSplit = splitFirstToken(remaining)
  if (nameSplit === undefined || nameSplit.rest.length === 0) {
    return { error: USAGE }
  }
  return { type, projectScope, name: nameSplit.token, content: nameSplit.rest }
}

/** Execute one `/remember` request against `ctx.memoryStorage`. */
async function executeRemember(ctx: Context, invocation: CommandInvocation): Promise<CommandResult> {
  const parsed = parseRemember(invocation.rawInput)
  if ('error' in parsed) {
    return { kind: 'error', text: parsed.error }
  }
  const cwd = invocation.agent.session.header.cwd
  if (parsed.projectScope === 'project' && cwd === undefined) {
    return { kind: 'error', text: '/remember: this session has no known working directory to scope a project-tier entry to; use --global.' }
  }
  try {
    const result = await ctx.memoryStorage.writeEntry({
      name: parsed.name,
      type: parsed.type,
      description: summarize(parsed.content),
      projectScope: parsed.projectScope,
      content: parsed.content,
      ...cwd === undefined ? {} : { cwd },
      signal: invocation.signal,
    })
    const scopeText = parsed.projectScope === 'global' ? 'global' : 'this project'
    const redactedText = result.redacted ? ' (some content was withheld as a possible secret)' : ''
    return { kind: 'success', text: `Remembered "${result.record.name}" (${result.record.type}, ${scopeText})${redactedText}.` }
  } catch (error: unknown) {
    if (invocation.signal.aborted) return { kind: 'error', text: 'Remember cancelled.' }
    if (error instanceof Error && error.name === 'ZodError') {
      return { kind: 'error', text: `/remember: invalid entry: ${error.message}` }
    }
    throw error
  }
}

/**
 * Register `/remember` for every composed human-command adapter.
 * @param ctx - context carrying the command registry and `ctx.memoryStorage`.
 */
export function apply(ctx: Context): void {
  const active = new Set<Promise<CommandResult>>()
  const handler = (invocation: CommandInvocation): Promise<CommandResult> => {
    const operation = executeRemember(ctx, invocation)
    active.add(operation)
    const retire = (): void => { active.delete(operation) }
    void operation.then(retire, retire)
    return operation
  }

  ctx.effect(function* () {
    yield async () => { await Promise.allSettled(active) }
    yield ctx.commands.register({
      definitionId: CommandDefinitionId('@deepseek-ai/dsh-command-remember'),
      name: 'remember',
      description: 'Durably remember a fact, preference, or pointer across sessions',
      handler,
    })
  }, 'command-remember lifecycle')
}
