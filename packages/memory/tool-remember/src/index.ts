/**
 * Model-facing `remember_fact` tool: the automatic write path for a durable
 * memory entry — the agent calls this mid-session when it judges something
 * durably useful, instead of waiting for the user to type `/remember`.
 * Both this tool and `@deepseek-ai/dsh-command-remember` call the same
 * `ctx.memoryStorage.writeEntry`, so redaction applies identically to
 * either trigger; this package adds no redaction logic of its own.
 * @module @deepseek-ai/dsh-tool-remember
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { MEMORY_ENTRY_TYPES } from '@deepseek-ai/dsh-memory-storage'

export const name = 'tool-remember'
export const inject = ['tools', 'memoryStorage']

const SCOPES = ['project', 'global'] as const

const DESCRIPTION =
  'Durably remember something worth recalling in a later, unrelated session: a fact or '
  + 'preference about the user, a correction about how to work, ongoing project state, or a '
  + 'pointer to an external system. Use this when the user states something durably useful — '
  + 'not for information only relevant to the current task. Content is screened for secrets '
  + 'before it is stored; a value that looks like a credential is withheld.'

/**
 * Register the `remember_fact` tool on `ctx.tools`.
 * @param ctx - registrant context carrying the tool registry and `ctx.memoryStorage`.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'remember_fact',
    description: DESCRIPTION,
    parameters: {
      name: {
        type: 'string',
        required: true,
        description: 'A short, stable, lowercase, hyphen-separated slug identifying this entry (e.g. "ci-commit-policy").',
      },
      type: {
        type: 'string',
        required: true,
        enum: [...MEMORY_ENTRY_TYPES],
        description: 'user (about the person) | feedback (how to work) | project (ongoing work) | reference (external pointers).',
      },
      description: {
        type: 'string',
        required: true,
        description: 'One-sentence summary shown in the always-visible memory index.',
      },
      content: {
        type: 'string',
        required: true,
        description: 'The full text to remember. Screened for secrets before it is stored.',
      },
      projectScope: {
        type: 'string',
        required: true,
        enum: [...SCOPES],
        description: 'project (scoped to the current project only) | global (available in every project).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', required: true },
          type: { type: 'string', required: true, enum: [...MEMORY_ENTRY_TYPES] },
          projectScope: { type: 'string', required: true, enum: [...SCOPES] },
          redacted: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.redacted
          ? `Remembered "${value.name}" (${value.type}, ${value.projectScope}); some content was withheld as a possible secret.`
          : `Remembered "${value.name}" (${value.type}, ${value.projectScope}).`,
      }],
    },
    async execute(args, exec) {
      if (!exec.agent) {
        // Memory scoping resolves from the calling session's cwd; a
        // non-agent caller has no session to scope a project-tier entry to.
        throw new Error('remember_fact requires an owning agent session')
      }
      const cwd = exec.agent.session.header.cwd
      const result = await ctx.memoryStorage.writeEntry({
        name: args.name,
        type: args.type,
        description: args.description,
        content: args.content,
        projectScope: args.projectScope,
        ...cwd === undefined ? {} : { cwd },
        signal: exec.signal,
      })
      return {
        name: result.record.name,
        type: result.record.type,
        projectScope: result.record.projectScope,
        redacted: result.redacted,
      }
    },
    presentCall: args => ({ card: 'generic', title: 'Remember', kind: 'other', rawInput: args.name }),
  }))
}
