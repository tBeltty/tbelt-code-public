/**
 * Model-facing `recall_memory` tool: on-demand recall of stored memory
 * entries by literal keyword, distinct from `@deepseek-ai/dsh-memory-recall`'s
 * always-on `agent/pre-step` index injection. The always-on injection carries
 * only the index (name/type/description/modified, no body text); this tool
 * is how the agent pulls a matching entry's full topic-file body into
 * context on demand.
 *
 * Retrieval is a pure, literal case-insensitive substring match over
 * `ctx.memoryStorage`'s in-memory records and topic-file bodies — no LLM or
 * embedding call. "An LLM or embedding call [in the recall path] breaks
 * keyless replay determinism; recall stays a pure function of the log"
 * (`.agents/notes/proposed/feature/2026-07-06-recallable-compaction.md:88`);
 * this tool is new construction sharing that same recall path, so it keeps
 * the same determinism property rather than reaching for a smarter match.
 * @module @deepseek-ai/dsh-tool-recall-memory
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  GLOBAL_SCOPE_ID, MEMORY_ENTRY_TYPES, projectScopeId, resolveMemoryProjectRoot,
} from '@deepseek-ai/dsh-memory-storage'
import type { MemoryEntryType } from '@deepseek-ai/dsh-memory-storage'

export const name = 'tool-recall-memory'
export const inject = ['tools', 'memoryStorage']

const SCOPE_FILTERS = ['project', 'global', 'both'] as const
type ScopeFilter = typeof SCOPE_FILTERS[number]

const DEFAULT_LIMIT = 10
const EXCERPT_RADIUS = 80

const DESCRIPTION =
  'Search durably remembered memory entries (written by /remember or remember_fact) for a literal keyword or '
  + 'phrase. Matches entry names, descriptions, and full content by case-insensitive substring — this is not a '
  + 'semantic or fuzzy search. Use it to pull a matching entry\'s full stored content into context; the '
  + 'always-visible memory index only carries short descriptions.'

/** One matched entry, with a short excerpt around the first literal match. */
interface RecallMatch {
  name: string
  type: MemoryEntryType
  projectScope: 'project' | 'global'
  modified: string
  description: string
  excerpt: string
}

/** Case-insensitive substring index of `needle` in `haystack`, or -1. */
function indexOfCaseInsensitive(haystack: string, needle: string): number {
  return haystack.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase())
}

/** A short window of `text` around `matchIndex`, ellipsized at either cut edge. */
function excerptAround(text: string, matchIndex: number, needleLength: number): string {
  const start = Math.max(0, matchIndex - EXCERPT_RADIUS)
  const end = Math.min(text.length, matchIndex + needleLength + EXCERPT_RADIUS)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return `${prefix}${text.slice(start, end).trim()}${suffix}`
}

/** Resolve which `{scopeId, projectScope}` pairs one call searches, from its `scopeFilter` and the session `cwd`. */
async function resolveScopes(
  scopeFilter: ScopeFilter,
  cwd: string | undefined,
  signal: AbortSignal,
): Promise<{ scopeId: string; projectScope: 'project' | 'global' }[]> {
  const scopes: { scopeId: string; projectScope: 'project' | 'global' }[] = []
  if (scopeFilter === 'global' || scopeFilter === 'both') {
    scopes.push({ scopeId: GLOBAL_SCOPE_ID, projectScope: 'global' })
  }
  if (scopeFilter === 'project' || scopeFilter === 'both') {
    if (cwd === undefined) {
      if (scopeFilter === 'project') {
        throw new Error('recall_memory: this session has no known working directory to search project-scope memory')
      }
    } else {
      const projectRoot = await resolveMemoryProjectRoot(cwd, undefined, signal)
      scopes.push({ scopeId: projectScopeId(projectRoot), projectScope: 'project' })
    }
  }
  return scopes
}

/**
 * Register the `recall_memory` tool on `ctx.tools`.
 * @param ctx - registrant context carrying the tool registry and `ctx.memoryStorage`.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'recall_memory',
    description: DESCRIPTION,
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: 'Literal keyword or phrase to search for (case-insensitive substring match; no semantic search).',
      },
      type: {
        type: 'string',
        enum: [...MEMORY_ENTRY_TYPES],
        description: 'Restrict to one memory category.',
      },
      scope: {
        type: 'string',
        enum: [...SCOPE_FILTERS],
        description: 'project | global | both (default: both).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string', required: true },
          results: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                type: { type: 'string', required: true, enum: [...MEMORY_ENTRY_TYPES] },
                projectScope: { type: 'string', required: true, enum: ['project', 'global'] },
                modified: { type: 'string', required: true },
                description: { type: 'string', required: true },
                excerpt: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.results.length === 0
          ? `No memory entries match "${value.query}".`
          : value.results.map(result => `- **${result.name}** (${result.type}, ${result.projectScope}): ${result.excerpt}`).join('\n'),
      }],
    },
    async execute(args, exec) {
      if (!exec.agent) {
        // Memory scoping resolves from the calling session's cwd; a
        // non-agent caller has no session to scope a project-tier search to.
        throw new Error('recall_memory requires an owning agent session')
      }
      const query = args.query.trim()
      if (query.length === 0) throw new Error('recall_memory: query must not be empty')
      const cwd = exec.agent.session.header.cwd
      const scopes = await resolveScopes(args.scope ?? 'both', cwd, exec.signal)
      const results: RecallMatch[] = []
      for (const scope of scopes) {
        for (const record of ctx.memoryStorage.listEntries(scope.scopeId)) {
          if (args.type !== undefined && record.type !== args.type) continue
          const descriptionIndex = indexOfCaseInsensitive(record.description, query)
          const nameIndex = indexOfCaseInsensitive(record.name, query)
          if (descriptionIndex >= 0 || nameIndex >= 0) {
            results.push({
              name: record.name,
              type: record.type,
              projectScope: scope.projectScope,
              modified: record.modified,
              description: record.description,
              excerpt: descriptionIndex >= 0
                ? excerptAround(record.description, descriptionIndex, query.length)
                : record.description,
            })
            continue
          }
          const read = await ctx.memoryStorage.readEntry(scope.scopeId, record.name)
          const bodyIndex = read === undefined ? -1 : indexOfCaseInsensitive(read.body, query)
          if (read !== undefined && bodyIndex >= 0) {
            results.push({
              name: record.name,
              type: record.type,
              projectScope: scope.projectScope,
              modified: record.modified,
              description: record.description,
              excerpt: excerptAround(read.body, bodyIndex, query.length),
            })
          }
        }
      }
      results.sort((left, right) => right.modified.localeCompare(left.modified))
      return { query, results: results.slice(0, DEFAULT_LIMIT) }
    },
    presentCall: args => ({ card: 'generic', title: 'Recall memory', kind: 'other', rawInput: args.query }),
  }))
}
