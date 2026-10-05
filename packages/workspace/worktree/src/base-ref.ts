/**
 * Base-ref qualification for `git worktree add`. Adapted from Orca's
 * `worktree/base-ref.ts` (MIT, see `LICENSES/Orca-MIT.txt`).
 * @module @deepseek-ai/dsh-worktree/base-ref
 */

/**
 * Qualify a base ref so a short name cannot collide with a tag. A ref with a
 * slash is read as `<remote>/<branch>` first and as a local branch with a
 * slash in its name second; a bare name is a local branch.
 * @param baseRef - the ref as configured or requested.
 * @param refExists - whether a fully qualified ref resolves in the repository.
 * @returns the qualified ref, or `baseRef` unchanged when nothing matches, so git reports the unknown revision itself.
 */
export async function qualifyBaseRef(baseRef: string, refExists: (qualifiedRef: string) => Promise<boolean>): Promise<string> {
  if (baseRef.startsWith('refs/')) return baseRef
  const candidates = baseRef.includes('/') ? [`refs/remotes/${baseRef}`, `refs/heads/${baseRef}`] : [`refs/heads/${baseRef}`]
  for (const candidate of candidates) {
    if (await refExists(candidate)) return candidate
  }
  return baseRef
}
