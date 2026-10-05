/**
 * Git operations behind worktree creation, listing, and removal. The base-ref
 * choice follows Orca's `worktree-add.ts`, the clean-removal check its
 * `worktree-removal-preflight.ts`, and the remove-then-delete-branch order its
 * `worktree-removal.ts` (MIT, see `LICENSES/Orca-MIT.txt`); the commands run
 * through this package's {@link Git} runner instead of Orca's cached runner.
 * @module @deepseek-ai/dsh-worktree/worktrees
 */

import { lstat, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { qualifyBaseRef } from './base-ref.ts'
import { NotARepositoryError } from './errors.ts'
import type { Git } from './git.ts'
import { parseWorktreeList } from './porcelain.ts'
import type { GitWorktreeInfo } from './porcelain.ts'

/**
 * List every worktree of the repository enclosing `path`.
 * @param git - command runner.
 * @param path - any directory inside the repository or one of its worktrees.
 * @param signal - cancellation.
 * @returns the entries, the primary checkout first.
 * @throws NotARepositoryError when `path` is not inside a repository.
 */
export async function listWorktrees(git: Git, path: string, signal: AbortSignal): Promise<GitWorktreeInfo[]> {
  const result = await git.run(['worktree', 'list', '--porcelain', '-z'], path, signal)
  if (result.exitCode !== 0) throw new NotARepositoryError(path, result.stderr.trim())
  return parseWorktreeList(result.stdout)
}

/**
 * The primary checkout of the repository enclosing `path`.
 * @param git - command runner.
 * @param path - any directory inside the repository or one of its worktrees.
 * @param signal - cancellation.
 * @returns the primary checkout's list entry.
 * @throws NotARepositoryError when `path` is not inside a repository, or the repository is bare.
 */
export async function primaryCheckout(git: Git, path: string, signal: AbortSignal): Promise<GitWorktreeInfo> {
  const [primary] = await listWorktrees(git, path, signal)
  if (primary === undefined || primary.isBare) throw new NotARepositoryError(path, 'a bare repository has no checkout to branch from')
  return primary
}

/**
 * Whether a fully qualified ref resolves to a commit.
 * @param git - command runner.
 * @param cwd - the repository.
 * @param ref - a ref such as `refs/heads/main`.
 * @param signal - cancellation.
 * @returns true when the ref exists.
 */
export async function refExists(git: Git, cwd: string, ref: string, signal: AbortSignal): Promise<boolean> {
  const result = await git.run(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd, signal)
  return result.exitCode === 0
}

/**
 * Qualify a base ref against the repository so a short name cannot collide with a tag.
 * @param git - command runner.
 * @param cwd - the repository.
 * @param baseRef - the ref as configured or requested.
 * @param signal - cancellation.
 * @returns the qualified ref for `git worktree add`.
 */
export function resolveBaseRef(git: Git, cwd: string, baseRef: string, signal: AbortSignal): Promise<string> {
  return qualifyBaseRef(baseRef, qualified => refExists(git, cwd, qualified, signal))
}

/** Whether anything, including a broken symlink, occupies `path`. */
async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ENOENT') return false
    throw error
  }
}

/** A directory name and branch that are both free. */
export interface FreeSlot {
  /** Leaf directory name under the worktree directory. */
  name: string
  /** Full branch name. */
  branch: string
}

/**
 * Find the first name whose directory and branch are both unused, appending
 * `-2`, `-3`, and so on to the requested one.
 * @param git - command runner.
 * @param primaryPath - the primary checkout.
 * @param directory - the directory holding this repository's worktrees.
 * @param name - the requested leaf name.
 * @param branchPrefix - text placed before the name in the branch, such as `wt/`.
 * @param signal - cancellation.
 * @returns the free slot.
 */
export async function findFreeSlot(
  git: Git, primaryPath: string, directory: string, name: string, branchPrefix: string, signal: AbortSignal,
): Promise<FreeSlot> {
  for (let attempt = 1; ; attempt++) {
    const candidate = attempt === 1 ? name : `${name}-${attempt}`
    const branch = `${branchPrefix}${candidate}`
    if (await pathExists(join(directory, candidate))) continue
    if (await refExists(git, primaryPath, `refs/heads/${branch}`, signal)) continue
    return { name: candidate, branch }
  }
}

/**
 * Create a worktree on a new branch. `--no-track` keeps the base's upstream
 * from making `git status` report "behind by N" before the first publish.
 * @param git - command runner.
 * @param primaryPath - the primary checkout the command runs in.
 * @param worktreePath - where the worktree is created.
 * @param branch - the new branch.
 * @param base - the qualified base ref.
 * @param signal - cancellation.
 * @throws GitCommandError when git refuses.
 */
export async function addWorktree(
  git: Git, primaryPath: string, worktreePath: string, branch: string, base: string, signal: AbortSignal,
): Promise<void> {
  await git.must(['worktree', 'add', '--no-track', '-b', branch, worktreePath, base], primaryPath, signal)
}

/**
 * The `git status --porcelain` entries that would block a non-forced removal.
 * @param git - command runner.
 * @param worktreePath - the worktree.
 * @param signal - cancellation.
 * @returns the entries, empty when the worktree is clean.
 */
export async function uncommittedEntries(git: Git, worktreePath: string, signal: AbortSignal): Promise<string[]> {
  const stdout = await git.must(['status', '--porcelain', '-z', '--untracked-files=all'], worktreePath, signal)
  return stdout.split('\0').filter(Boolean)
}

/**
 * Drop the untracked shared links from a status listing: they are not the
 * user's work and cannot be committed away. Adapted from Orca's
 * `getBlockingUntrackedStatusEntries`.
 * @param entries - `git status --porcelain -z` entries.
 * @param sharedPaths - the configured shared paths.
 * @returns the entries that still block a non-forced removal.
 */
export function blockingEntries(entries: readonly string[], sharedPaths: readonly string[]): string[] {
  const shared = new Set(
    sharedPaths
      .map(entry => entry.trim().replace(/^[\\/]+/, '').replace(/[\\/]+$/, '').replaceAll('\\', '/'))
      .filter(entry => entry && !entry.split('/').includes('..')),
  )
  return entries.filter(entry => !(entry.startsWith('?? ') && shared.has(entry.slice(3).replace(/\/$/, '').replaceAll('\\', '/'))))
}

/**
 * Remove a worktree's checkout and registration.
 * @param git - command runner.
 * @param primaryPath - the primary checkout the command runs in.
 * @param worktreePath - the worktree.
 * @param force - remove even with uncommitted changes.
 * @param signal - cancellation.
 * @throws GitCommandError when git refuses.
 */
export async function removeWorktree(
  git: Git, primaryPath: string, worktreePath: string, force: boolean, signal: AbortSignal,
): Promise<void> {
  await git.must(['worktree', 'remove', ...force ? ['--force'] : [], worktreePath], primaryPath, signal)
}

/**
 * Delete a branch only when it is fully merged, so unmerged commits survive a removal.
 * @param git - command runner.
 * @param primaryPath - the primary checkout.
 * @param branch - the short branch name.
 * @param signal - cancellation.
 * @returns true when the branch was deleted.
 */
export async function deleteMergedBranch(git: Git, primaryPath: string, branch: string, signal: AbortSignal): Promise<boolean> {
  const result = await git.run(['branch', '--delete', '--', branch], primaryPath, signal)
  return result.exitCode === 0
}

/**
 * Compare two paths by their canonical spelling, so `/var` and `/private/var` match on macOS.
 * @param left - first path.
 * @param right - second path.
 * @returns true when both name the same location.
 */
export async function samePath(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([realpath(left).catch(() => left), realpath(right).catch(() => right)])
  return a === b
}
