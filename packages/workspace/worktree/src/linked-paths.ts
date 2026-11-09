/**
 * Materialization of shared and copied paths from the primary checkout into a
 * new worktree. Adapted from Orca's `worktree-symlinks.ts` (MIT, see
 * `LICENSES/Orca-MIT.txt`): the shared mode is its `share` mode and the copy
 * mode its `copy` mode; its `link` mode, the `.worktreeinclude` reader, and
 * console logging are not carried over.
 * @module @deepseek-ai/dsh-worktree/linked-paths
 */

import { cp, lstat, mkdir, realpath, stat, symlink, unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  ApfsCloneUnavailableError,
  LinkedPathTargetExistsError,
  canCloneWithApfs,
  cloneWorktreePathWithApfs,
} from './apfs-clone.ts'
import type { ApfsCloneDeps, DarwinFilesystemCache } from './apfs-clone.ts'
import { createCopyBudgetTracker } from './copy-budget.ts'
import type { CopyBudget, SkippedCopyPath } from './copy-budget.ts'
import { safeRelativePath } from './safe-path.ts'

/**
 * `share` always symlinks, because a clone would give each worktree its own
 * `node_modules` and defeat one install serving every worktree. `copy` makes a
 * private copy, cloning copy-on-write on APFS, because edits in a worktree
 * must not leak back into the primary checkout.
 */
export type MaterializeMode = 'share' | 'copy'

/** Collaborators and bounds for one materialization. */
export interface MaterializeOptions {
  /** Host platform; selects the Windows junction fallback and the macOS clone. */
  platform: NodeJS.Platform
  /** Command runner and uuid source for APFS clones. */
  apfsCloneDeps: ApfsCloneDeps
  /** Ceilings for `copy` mode. */
  copyBudget: CopyBudget
  /** Reports a per-path failure; creation continues with the next path. */
  warn: (message: string) => void
  /** Replaces the real clone in tests. */
  cloneWorktreePath?: (source: string, target: string, sourceIsDirectory: boolean) => Promise<void>
  /** Replaces `fs.symlink` in tests, where a Windows privilege failure cannot be provoked. */
  symlink?: (source: string, target: string, type: 'junction' | 'dir' | 'file') => Promise<void>
}

/**
 * The `fs.symlink` types to attempt, in order, for one shared path. A plain
 * Windows symlink needs Developer Mode or administrator rights, so a directory
 * junction, which needs neither, is tried first; the symlink fallback keeps
 * UNC targets working, which a junction cannot point at.
 * @param platform - host platform.
 * @param sourceIsDirectory - whether the shared path is a directory.
 * @returns the types in the order to try them.
 */
export function symlinkTypeCandidates(platform: NodeJS.Platform, sourceIsDirectory: boolean): ('junction' | 'dir' | 'file')[] {
  if (!sourceIsDirectory) return ['file']
  return platform === 'win32' ? ['junction', 'dir'] : ['dir']
}

/** Symlink `target` to the absolute `source`, trying each candidate type until one works. */
async function symlinkPath(source: string, target: string, sourceIsDirectory: boolean, options: MaterializeOptions): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  const link = options.symlink ?? symlink
  const candidates = symlinkTypeCandidates(options.platform, sourceIsDirectory)
  for (const [index, type] of candidates.entries()) {
    try {
      // `source` is always absolute, which a junction requires.
      await link(source, target, type)
      return
    } catch (error) {
      if (index === candidates.length - 1) throw error
    }
  }
}

/** Copy without clobbering anything a racing process placed at the target after the existence preflight. */
async function copyPath(source: string, target: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  await cp(source, target, { recursive: true, force: false, errorOnExist: false })
}

/** A clone was expected, so its bytes were never charged, but it failed and the real copy would escape the budget. */
class CopyBudgetFallbackError extends Error {
  /**
   * @param target - the path the fallback copy would have written.
   */
  constructor(target: string) {
    super(`APFS clone failed and a real copy of "${target}" would exceed the copy budget`)
    this.name = 'CopyBudgetFallbackError'
  }
}

/** Whether an error names a missing path. */
function isMissing(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'ENOENT'
}

/** Whether anything, including a broken symlink, occupies `target`. */
async function targetExists(target: string): Promise<boolean> {
  try {
    // lstat so a pre-existing symlink, even a broken one, is preserved rather than overwritten.
    await lstat(target)
    return true
  } catch {
    // A target that cannot be inspected cannot be proven present; creating it reports the real failure.
    return false
  }
}

/** What {@link createPath} needs to materialize one path. */
interface PathPlan {
  source: string
  copySource: string
  target: string
  sourceIsDirectory: boolean
  mode: MaterializeMode
}

/** Create one path in the worktree: clone on macOS copies, else copy or symlink by mode. */
async function createPath(
  plan: PathPlan,
  options: MaterializeOptions,
  cache: DarwinFilesystemCache,
  realCopyFallbackAllowed: () => boolean,
): Promise<void> {
  const { source, copySource, target, sourceIsDirectory, mode } = plan
  if (mode === 'copy' && options.platform === 'darwin') {
    try {
      const clone = options.cloneWorktreePath
        ?? ((cloneSource, cloneTarget, cloneIsDirectory) => (
          cloneWorktreePathWithApfs(cloneSource, cloneTarget, cloneIsDirectory, options.apfsCloneDeps, cache)
        ))
      await clone(copySource, target, sourceIsDirectory)
      return
    } catch (error) {
      if (error instanceof LinkedPathTargetExistsError) return
      // Clone-copy fails across volumes or on non-APFS disks; fall back to a real copy without
      // touching a target that appeared after the preflight.
      if (!(error instanceof ApfsCloneUnavailableError)) {
        options.warn(`APFS clone-copy unavailable for "${target}": ${String(error)}`)
        // The fallback is a byte-for-byte copy. An entry admitted as a free clone was never charged,
        // so bill it now and refuse if it no longer fits.
        if (!realCopyFallbackAllowed()) throw new CopyBudgetFallbackError(target)
      }
    }
  }
  if (mode === 'copy') {
    await copyPath(copySource, target)
    return
  }
  await symlinkPath(source, target, sourceIsDirectory, options)
}

/** Whether a copy of `source` into the worktree lands as a clone, which costs no bytes. */
async function copyIsCopyOnWrite(
  source: string,
  worktreePath: string,
  options: MaterializeOptions,
  cache: DarwinFilesystemCache,
): Promise<boolean> {
  if (options.platform !== 'darwin') return false
  // An injected clone stands in for the real one; probing the real filesystem would make those tests host-dependent.
  if (options.cloneWorktreePath) return true
  return canCloneWithApfs(source, worktreePath, options.apfsCloneDeps, cache)
}

/**
 * Link or copy each configured path from the primary checkout into a freshly
 * created worktree at the same relative location. Failures on one path are
 * reported and skipped so a missing or stale entry never blocks creation.
 * Paths missing from the primary checkout, such as a `node_modules` that was
 * never installed, are skipped without a report; paths that already exist in
 * the worktree are left alone.
 * @param primaryPath - the primary checkout the paths come from.
 * @param worktreePath - the new worktree.
 * @param paths - repository-relative paths; unsafe ones are reported and skipped.
 * @param mode - symlink (`share`) or private copy (`copy`).
 * @param options - platform, clone runner, copy budget, and failure reporting.
 * @returns the entries the copy budget refused, always empty in `share` mode.
 */
export async function materializePaths(
  primaryPath: string,
  worktreePath: string,
  paths: readonly string[],
  mode: MaterializeMode,
  options: MaterializeOptions,
): Promise<SkippedCopyPath[]> {
  // One volume probe per distinct volume for the whole materialization, not per copied path.
  const cache: DarwinFilesystemCache = new Map()
  // One budget for the whole materialization, so a hundred medium entries are refused for the same reason one huge entry is.
  const copyBudget = createCopyBudgetTracker(options.copyBudget)
  const skipped: SkippedCopyPath[] = []

  for (const rawPath of paths) {
    const safePath = safeRelativePath(rawPath)
    if (!safePath.safe) {
      options.warn(`Skipping unsafe worktree path "${rawPath}"`)
      continue
    }
    const source = resolve(primaryPath, safePath.rel)
    const target = resolve(worktreePath, safePath.rel)

    let sourceIsDirectory: boolean
    let sourceIsSymbolicLink: boolean
    try {
      sourceIsSymbolicLink = (await lstat(source)).isSymbolicLink()
      sourceIsDirectory = (await stat(source)).isDirectory()
    } catch (error) {
      if (isMissing(error)) continue
      options.warn(`Failed to inspect "${safePath.rel}" (${source}): ${String(error)}`)
      continue
    }
    if (await targetExists(target)) continue

    try {
      // A copy promises an independent tree; copying the symlink itself would recreate a link to
      // the shared target, so resolve the real source.
      let copySource = source
      let bytesAreCopied = true
      let measuredBytes = 0
      if (mode === 'copy') {
        if (sourceIsSymbolicLink) copySource = await realpath(source)
        // An APFS clone is copy-on-write, so bytes are not its cost, inodes are; charging bytes would refuse work that is already free.
        bytesAreCopied = !(await copyIsCopyOnWrite(copySource, worktreePath, options, cache))
        const verdict = await copyBudget.admit(copySource, { bytesAreCopied })
        if (!verdict.withinBudget) {
          // Refuse before the first byte is written; a started copy cannot be aborted and would strand a partial tree.
          skipped.push({ path: safePath.rel, reason: verdict.reason })
          continue
        }
        measuredBytes = verdict.bytes
      }
      await createPath(
        { source, copySource, target, sourceIsDirectory, mode },
        options,
        cache,
        () => bytesAreCopied || copyBudget.chargeBytes(measuredBytes),
      )
    } catch (error) {
      if (error instanceof CopyBudgetFallbackError) {
        // A directory clone reserves the target and removes it only while empty, so leftovers can
        // survive; a file clone leaves nothing behind.
        skipped.push({ path: safePath.rel, reason: 'bytes', ...sourceIsDirectory ? { mayBePartial: true } : {} })
        continue
      }
      options.warn(`Failed to ${mode === 'copy' ? 'copy' : 'link'} "${safePath.rel}" (${source} -> ${target}): ${String(error)}`)
    }
  }
  return skipped
}

/**
 * Remove the symlinks {@link materializePaths} created in `share` mode before
 * the worktree is deleted. `git worktree remove` refuses a worktree with
 * untracked files, and a link to the primary's `node_modules` looks untracked,
 * so removal would otherwise always need force. Only symbolic links are
 * removed: a regular file or directory a user placed at the same path stays.
 * @param worktreePath - the worktree about to be removed.
 * @param paths - the shared paths that were configured.
 * @param warn - reports a link that could not be removed.
 */
export async function removeSharedLinks(worktreePath: string, paths: readonly string[], warn: (message: string) => void): Promise<void> {
  for (const rawPath of paths) {
    const safePath = safeRelativePath(rawPath)
    if (!safePath.safe) continue
    const target = resolve(worktreePath, safePath.rel)
    try {
      if ((await lstat(target)).isSymbolicLink()) await unlink(target)
    } catch (error) {
      if (!isMissing(error)) warn(`Failed to remove shared link "${safePath.rel}" (${target}): ${String(error)}`)
    }
  }
}
