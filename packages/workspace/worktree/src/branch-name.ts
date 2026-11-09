/**
 * Branch-name normalization for worktrees. Adapted from Orca's
 * `branch-name-from-work.ts` (MIT, see `LICENSES/Orca-MIT.txt`).
 * @module @deepseek-ai/dsh-worktree/branch-name
 */

/** Words kept from a requested name so a long phrase cannot become an unreadable branch. */
export const MAX_BRANCH_NAME_WORDS = 6

/**
 * Turn free text into a short kebab-case branch leaf.
 * @param raw - the text to normalize.
 * @param maxWords - words to keep, defaulting to {@link MAX_BRANCH_NAME_WORDS}.
 * @returns the leaf, or an empty string when nothing usable remains.
 */
export function sanitizeBranchSlug(raw: string, maxWords = MAX_BRANCH_NAME_WORDS): string {
  const words = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .split('-')
    .filter(Boolean)
  return words.slice(0, maxWords).join('-')
}
