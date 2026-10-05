/**
 * Validation of repository-relative paths named in worktree configuration.
 * Adapted from Orca's `worktree-symlink-detection.ts` (MIT, see `LICENSES/Orca-MIT.txt`).
 * @module @deepseek-ai/dsh-worktree/safe-path
 */

/** Outcome of {@link safeRelativePath}: the normalized path, or a refusal. */
export type SafeRelativePathResult = { safe: true; rel: string } | { safe: false }

/**
 * A rooted spelling that survives the leading-separator strip is a Windows
 * drive designator. `win32.isAbsolute` misses the drive-relative form
 * (`C:foo`), which still resolves against that drive's current directory.
 */
const WINDOWS_DRIVE_DESIGNATOR = /^[a-zA-Z]:/

/**
 * Normalize a configured path to a repository-relative one. Leading separators
 * of both kinds are stripped, and any `..` segment or drive designator is
 * refused on every host so one configuration gets the same verdict everywhere.
 * @param rawPath - the path as written in configuration.
 * @returns the relative path, or `{ safe: false }` when it is empty or could leave the repository.
 */
export function safeRelativePath(rawPath: string): SafeRelativePathResult {
  const rel = rawPath.trim().replace(/^[\\/]+/, '')
  if (!rel || WINDOWS_DRIVE_DESIGNATOR.test(rel) || rel.split(/[\\/]/).includes('..')) return { safe: false }
  return { safe: true, rel }
}
