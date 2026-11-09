/**
 * Model-facing `search_replace` tool over the Harness filesystem seam.
 * Parses and applies SEARCH/REPLACE blocks against content read from
 * `ctx.fs`, falling back to a whitespace-tolerant match when a block's
 * SEARCH text has zero exact matches (see `apply.ts`), then writes the
 * result back through the same `fs/edit-intent` waterfall, sandbox policy,
 * and `fs/observed` emission every other fs-mutating tool in this family
 * uses (mirrors `tool-str-replace-editor`'s `replaceInFile`).
 * @module @deepseek-ai/dsh-tool-search-replace
 */

import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { FsError } from '@deepseek-ai/dsh-fs'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import { sandboxDenialMarker } from '@deepseek-ai/dsh-sandbox'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import type { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { applySearchReplaceBlocks } from './apply.ts'
import { parseSearchReplaceBlocks } from './parser.ts'

/**
 * Resolves the per-call sandbox policy and maps a caught `FS_SANDBOX_DENIED`
 * error onto the shared `[sandbox: ...]` marker the model recognizes from
 * other fs-mutating tools. Copied from `tool-str-replace-editor`'s
 * `MutationPolicy` — same shape, same failure mode, same fix.
 */
class MutationPolicy {
  private readonly policy: SandboxPolicyService | undefined

  constructor(ctx: Context) {
    this.policy = ctx.fs.sandboxMode === undefined ? undefined : ctx.get('sandboxPolicy')
    if (ctx.fs.sandboxMode !== undefined && this.policy === undefined) {
      throw new Error('tool-search-replace: the mounted filesystem confines but ctx.sandboxPolicy is missing')
    }
  }

  resolve(exec: ToolRunContext): SandboxExecutionPolicy | undefined {
    return this.policy?.resolve({
      ...exec.agent === undefined ? {} : { session: exec.agent.session },
    })
  }

  mapError(error: unknown, policy: SandboxExecutionPolicy | undefined): unknown {
    if (!(error instanceof FsError) || error.code !== 'FS_SANDBOX_DENIED') return error
    const mode = (policy as SandboxExecutionPolicy).mode
    return new FsError(sandboxDenialMarker(mode), 'FS_SANDBOX_DENIED', { cause: error })
  }
}

async function resolveTarget(ctx: Context, path: string, signal: AbortSignal): Promise<FsTarget> {
  if (path.trim().length === 0) throw new Error('path must be a non-empty string')
  if (!isAbsolute(path)) {
    throw new Error(`The path ${path} is not an absolute path, it should start with \`/\`. Maybe you meant /${path}?`)
  }
  return ctx.fs.resolve(path, { signal })
}

function formatResult(content: string, fuzzyBlockIndexes: readonly number[]): string {
  if (fuzzyBlockIndexes.length === 0) return content
  // Surface fuzzy matches explicitly so the model/user isn't silently misled
  // into thinking the file already had the SEARCH text's exact formatting.
  const blockList = fuzzyBlockIndexes.join(', ')
  const plural = fuzzyBlockIndexes.length > 1 ? 's' : ''
  const note = `Note: block${plural} ${blockList} matched only after whitespace/indentation normalization (fuzzy match) — the file's actual formatting differs from the SEARCH text provided.`
  return `${note}\n\n${content}`
}

async function executeSearchReplace(
  ctx: Context,
  policy: MutationPolicy,
  path: string,
  diff: string,
  exec: ToolRunContext,
): Promise<string> {
  const sandboxPolicy = policy.resolve(exec)
  const target = await resolveTarget(ctx, path, exec.signal)
  const intent = await ctx.waterfall('fs/edit-intent', target, exec, () => undefined)
  const info = await ctx.fs.stat(target, exec.signal)
  if (info === undefined) {
    throw new FsError(`The path ${target.displayPath} does not exist. Please provide a valid path.`, 'FS_NOT_FOUND')
  }
  if (info.type !== 'file') {
    throw new FsError(`cannot edit "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
  }
  const before = await ctx.fs.readText(target, exec.signal)
  const blocks = parseSearchReplaceBlocks(diff)
  const outcome = applySearchReplaceBlocks(before, blocks)
  let writeOutcome
  try {
    writeOutcome = await ctx.fs.writeText(
      target,
      outcome.content,
      intent === undefined
        ? { kind: 'replaceIfVersion', version: info.version }
        : { kind: 'replaceIfVersion', version: intent.version },
      exec.signal,
      sandboxPolicy,
    )
  } catch (error: unknown) {
    throw policy.mapError(error, sandboxPolicy)
  }
  ctx.emit('fs/observed', target, { kind: 'present', version: writeOutcome.version }, exec)
  return formatResult(outcome.content, outcome.fuzzyBlockIndexes)
}

const DESCRIPTION = [
  'Edit a file by applying one or more SEARCH/REPLACE blocks.',
  '',
  'Each block has the form:',
  '',
  '<<<<<<< SEARCH',
  'exact text to find',
  '=======',
  'replacement text',
  '>>>>>>> REPLACE',
  '',
  'Multiple blocks may be concatenated in one `diff` string; they are applied in order, each against the result of the previous one. Each block\'s SEARCH text must match exactly one place in the file, verbatim, including whitespace.',
].join('\n')

/** Register the model-facing `search_replace` tool. */
function registerSearchReplace(ctx: Context): void {
  const policy = new MutationPolicy(ctx)
  ctx.tools.register(defineTool({
    name: 'search_replace',
    description: DESCRIPTION,
    parameters: {
      path: {
        type: 'string',
        required: true,
        description: 'Absolute path to the file to edit, e.g. `/repo/file.py`.',
      },
      diff: {
        type: 'string',
        required: true,
        description: 'One or more concatenated SEARCH/REPLACE blocks to apply, in order.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      return executeSearchReplace(ctx, policy, args.path, args.diff, exec)
    },
  }))
}

export const name = 'tool-search-replace'
export const inject = ['tools', 'fs']

/** Register one `search_replace` tool. */
export function apply(ctx: Context): void {
  registerSearchReplace(ctx)
}
