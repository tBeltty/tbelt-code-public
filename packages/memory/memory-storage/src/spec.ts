/**
 * The memory domain declaration: one `entries` table keyed by
 * {@link MemoryEntryKey}, each record one typed, durable cross-session memory
 * entry. `layout: 'per-record'` and `invalidRecords: 'backup-and-skip'`
 * mirror `packages/session/session-projection-cache/src/spec.ts`: memory
 * entries are sparse, individually disposable (a corrupt entry never blocks
 * every other entry from loading), and expected to evolve in shape as the
 * Markdown/frontmatter read/write layer (a later task) adds fields. New
 * fields join with `.default(...)` so already-stored records keep parsing
 * unchanged, following the convention at
 * `packages/workspace/workspace/src/spec.ts`.
 * @module @deepseek-ai/dsh-memory-storage/src/spec
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { MemoryEntryKey } from './types.ts'

/**
 * The four memory categories the Plan of Record adopts from this repo's own
 * per-project auto-memory convention under `~/.claude/projects/` (one
 * `memory/` directory per project): `user` (role, goals, and knowledge about
 * the person), `feedback` (corrections and confirmations about how to work),
 * `project` (ongoing work, decisions, and deadlines), `reference` (pointers
 * to external systems).
 */
export const MEMORY_ENTRY_TYPES = ['user', 'feedback', 'project', 'reference'] as const

/** One of {@link MEMORY_ENTRY_TYPES}. */
export type MemoryEntryType = typeof MEMORY_ENTRY_TYPES[number]

/**
 * A memory entry's stable name: a lowercase, hyphen-separated slug. Used as
 * the human-readable half of the entry's storage key and, in the later
 * Markdown read/write layer, its topic-file base name.
 */
const memoryEntryName = z.string().min(1).max(128).regex(
  /^[a-z0-9]+(-[a-z0-9]+)*$/,
  'must be a lowercase, hyphen-separated slug',
)

/**
 * Durable shape of one memory entry. `modified` is an ISO-8601 timestamp
 * with an explicit offset (or `Z`), validated at write time via
 * `z.iso.datetime` — an ISO-8601 string is the same shape
 * `packages/workspace/workspace/src/spec.ts` stores for `createdAt`/
 * `updatedAt` at this same storage-domain boundary (that package's own
 * schema leaves the field as a bare `z.string()`; this domain validates the
 * format explicitly, a stricter version of the same convention), and the
 * natural spelling for a YAML frontmatter timestamp once the Markdown
 * read/write layer writes this field into a topic file's frontmatter block.
 * `projectScope` names the tier the entry belongs to; the entry's storage
 * key (see `scope.ts`) separately encodes which project a `'project'`-scope
 * entry belongs to, since this domain has exactly one `entries` table
 * shared by every project.
 */
export const memoryEntryRecord = z.object({
  name: memoryEntryName,
  type: z.enum(MEMORY_ENTRY_TYPES),
  description: z.string().min(1),
  modified: z.iso.datetime({ offset: true }),
  projectScope: z.enum(['project', 'global']),
})

/** One stored memory entry, inferred from {@link memoryEntryRecord}. */
export type MemoryEntryRecord = z.infer<typeof memoryEntryRecord>

/**
 * The memory domain spec: one `entries` table keyed by
 * {@link MemoryEntryKey}. Version 1 has no predecessor, so
 * `compatibleVersions` is empty; a future additive field bumps neither
 * `version` nor `compatibleVersions` as long as it carries `.default(...)`,
 * per {@link memoryEntryRecord}'s convention.
 */
export const memoryDomainSpec = defineDomain({
  name: 'memory',
  version: 1,
  layout: 'per-record',
  invalidRecords: 'backup-and-skip',
  tables: { entries: domainTable<MemoryEntryKey, MemoryEntryRecord>(memoryEntryRecord) },
})
