import type { Branded } from '@deepseek-ai/dsh-brand'

/**
 * Identifies one stored memory entry: `<scope-id>_<name>`, where `scope-id`
 * is `'global'` for a global-tier entry or a project-scope id (see
 * `scope.ts`) for a project-tier entry. Branded because a bare key string
 * must never be constructed by hand outside {@link import('./scope.ts').memoryEntryKey}.
 */
export type MemoryEntryKey = Branded<'MemoryEntryKey'>
