/**
 * Upward marker-directory search for locating a project root from a working
 * directory. Extracted from the two private copies that predate this
 * package (`packages/context/agent-instructions/src/files.ts` and
 * `packages/skill/skill-filesystem/src/index.ts`) so a new consumer does not
 * add a third; the two existing private copies are unchanged by this
 * extraction and keep their own inlined walks.
 * @module @deepseek-ai/dsh-project-root
 */

import { dirname, join, resolve } from 'node:path'
import { stat } from 'node:fs/promises'
import type { FileSystem } from '@deepseek-ai/dsh-fs'

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}

function isMissingProviderPathError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'FS_NOT_FOUND'
}

async function existsAsMarker(path: string, fileSystem?: FileSystem, signal?: AbortSignal): Promise<boolean> {
  if (fileSystem !== undefined) {
    try {
      const target = await fileSystem.resolve(path, signal === undefined ? undefined : { signal })
      return await fileSystem.stat(target, signal) !== undefined
    } catch (error: unknown) {
      signal?.throwIfAborted()
      if (isMissingProviderPathError(error)) return false
      throw error
    }
  }
  try {
    signal?.throwIfAborted()
    await stat(path)
    signal?.throwIfAborted()
    return true
  } catch (error: unknown) {
    signal?.throwIfAborted()
    if (isMissingPathError(error)) return false
    throw error
  }
}

/**
 * Walk upward to the first directory containing a configured root marker.
 * @param cwd - absolute directory where the walk begins.
 * @param markers - child names that identify a project root.
 * @param fileSystem - optional provider used instead of host filesystem probes.
 * @param signal - cancellation for provider and host probes.
 * @returns the discovered project root, or `cwd` when no marker exists.
 * @throws the original marker metadata error or cancellation reason when a probe is unavailable.
 */
export async function findProjectRoot(
  cwd: string,
  markers: readonly string[],
  fileSystem?: FileSystem,
  signal?: AbortSignal,
): Promise<string> {
  let current = resolve(cwd)
  for (;;) {
    for (const marker of markers) {
      if (await existsAsMarker(join(current, marker), fileSystem, signal)) return current
    }
    const parent = dirname(current)
    if (parent === current) return resolve(cwd)
    current = parent
  }
}

/** Default marker set for {@link findProjectRoot}: a git worktree or repository root. */
export const DEFAULT_PROJECT_ROOT_MARKERS: readonly string[] = ['.git']
