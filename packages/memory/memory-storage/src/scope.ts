/**
 * Project/global scope resolution and storage-key construction for memory
 * entries. The memory domain (`spec.ts`) is one process-wide `entries`
 * table — `packages/storage/storage-domain` names a domain once per
 * facility and offers no per-project domain instance — so a `'project'`-scope
 * entry's project identity must live in its storage key, not in a second
 * domain. This module is the single place that builds that key so every
 * consumer agrees on its shape.
 *
 * Project-root resolution is extracted to `@deepseek-ai/dsh-project-root`
 * rather than added as a third private copy alongside the two existing ones
 * in `packages/context/agent-instructions` and `packages/skill/skill-filesystem`
 * (neither of which is migrated to the shared package by this change — see
 * this package's README "Known Limitations and Deferred Work").
 * @module @deepseek-ai/dsh-memory-storage/src/scope
 */

import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import type { FileSystem } from '@deepseek-ai/dsh-fs'
import { DEFAULT_PROJECT_ROOT_MARKERS, findProjectRoot } from '@deepseek-ai/dsh-project-root'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { MemoryEntryKey } from './types.ts'

/** Storage-key scope id for every global-tier memory entry. */
export const GLOBAL_SCOPE_ID = 'global'

/**
 * Derive the storage-key scope id for a project-tier memory entry. A stable,
 * fixed-length hash (rather than the raw path) keeps the id filesystem- and
 * key-charset-safe regardless of the host path's characters or length; it is
 * not a secrecy measure; the project root itself is not sensitive.
 * @param projectRoot - absolute project root, typically from {@link resolveMemoryProjectRoot}.
 * @returns a 16-character lowercase hex scope id, stable for the same absolute root.
 */
export function projectScopeId(projectRoot: string): string {
  return createHash('sha256').update(resolve(projectRoot)).digest('hex').slice(0, 16)
}

/**
 * Resolve the project root a project-tier memory entry scopes against. Thin
 * wrapper over {@link findProjectRoot} with this package's marker default,
 * so every memory-scope caller agrees on the same walk without repeating its
 * configuration.
 * @param cwd - session working directory (`agent.session.header.cwd`, falling back to `process.cwd()` at the call site).
 * @param fileSystem - optional provider used instead of host filesystem probes.
 * @param signal - cancellation for provider and host probes.
 * @returns the resolved project root, or `cwd` when no marker is found.
 */
export function resolveMemoryProjectRoot(
  cwd: string,
  fileSystem?: FileSystem,
  signal?: AbortSignal,
): Promise<string> {
  return findProjectRoot(cwd, DEFAULT_PROJECT_ROOT_MARKERS, fileSystem, signal)
}

/**
 * Build the storage key for one memory entry.
 * @param scopeId - {@link GLOBAL_SCOPE_ID} or a {@link projectScopeId} result.
 * @param name - the entry's slug (`MemoryEntryRecord.name`).
 * @returns the branded storage key.
 */
export function memoryEntryKey(scopeId: string, name: string): MemoryEntryKey {
  return brandString<MemoryEntryKey>(`${scopeId}/${name}`)
}
