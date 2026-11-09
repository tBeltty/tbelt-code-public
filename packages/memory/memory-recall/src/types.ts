/**
 * Typed, attributable `source` for one memory-recall injection message.
 *
 * The package declares its own `memory-recall` member on `MessageSourceMap`.
 * Each section names every listed entry's id, category, and modification
 * time, so a permission rule or audit log can attribute recalled content
 * without re-parsing the rendered text (OWASP ASI06).
 * @module @deepseek-ai/dsh-memory-recall/types
 */

import type { ContextSnapshotEntry, ContextSnapshotSection, MessageSource } from '@deepseek-ai/dsh-llm'
import type { MemoryEntryType } from '@deepseek-ai/dsh-memory-storage'

/** Producer-owned `source.kind` of every memory-recall injection. */
export const MEMORY_RECALL_SOURCE_KIND = 'memory-recall'

/** One injected scope's index entries, structurally attributable without re-parsing the rendered text. */
export interface MemoryRecallEntry extends ContextSnapshotEntry {
  /** The entry's slug (mirrors `ContextSnapshotEntry.id`). */
  id: string
  /** One of {@link MemoryEntryType} (mirrors `ContextSnapshotEntry.category`). */
  category: MemoryEntryType
  /** ISO-8601 timestamp the entry was last modified. */
  modified: string
}

/** One injected scope's rendered section, plus its structured entry list. */
export interface MemoryRecallSection extends ContextSnapshotSection {
  /** `"project:<scopeId>"` or `"global"`. */
  name: string
  /** The scope's rendered `<memory-index>`-wrapped prompt block. */
  text: string
  entries: readonly MemoryRecallEntry[]
}

/** Durable, attributable `source` for one memory-recall `agent/pre-step` injection. */
export interface MemoryRecallSource {
  kind: typeof MEMORY_RECALL_SOURCE_KIND
  form: 'snapshot'
  sections: readonly MemoryRecallSection[]
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Memory-recall injection. */
    'memory-recall': MemoryRecallSource
  }
}

/**
 * Narrow a message `source` to {@link MemoryRecallSource}.
 * @param source - any message source.
 * @returns whether `source` is a memory-recall injection's source.
 */
export function isMemoryRecallSource(source: MessageSource): source is MemoryRecallSource {
  return source.kind === MEMORY_RECALL_SOURCE_KIND
}
