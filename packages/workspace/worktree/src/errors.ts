/**
 * Failures worktree operations report to their callers.
 * @module @deepseek-ai/dsh-worktree/errors
 */

/** git is not installed, or only the macOS developer-tools stub is. */
export class GitUnavailableError extends Error {
  constructor() {
    super('git is not available on this host')
    this.name = 'GitUnavailableError'
  }
}

/** The path is not inside a repository with a working tree. */
export class NotARepositoryError extends Error {
  /**
   * @param path - the path that was given.
   * @param detail - git's explanation, or why the checkout cannot host worktrees.
   */
  constructor(readonly path: string, detail: string) {
    super(`"${path}" is not a repository that can host worktrees: ${detail}`)
    this.name = 'NotARepositoryError'
  }
}

/** The path is not a linked worktree of its repository, so removing it would delete a primary checkout or an unrelated directory. */
export class NotALinkedWorktreeError extends Error {
  /**
   * @param path - the path that was given.
   */
  constructor(readonly path: string) {
    super(`"${path}" is not a linked worktree`)
    this.name = 'NotALinkedWorktreeError'
  }
}

/** The worktree holds uncommitted or untracked work and removal was not forced. */
export class WorktreeDirtyError extends Error {
  /**
   * @param path - the worktree.
   * @param entries - `git status --porcelain` entries, excluding the shared links this plugin created.
   */
  constructor(readonly path: string, readonly entries: readonly string[]) {
    super(`Worktree "${path}" has uncommitted or untracked changes`)
    this.name = 'WorktreeDirtyError'
  }
}

/** The worktree is locked, so git would refuse its removal. */
export class WorktreeLockedError extends Error {
  /**
   * @param path - the worktree.
   * @param reason - the recorded lock reason, empty when none was given.
   */
  constructor(readonly path: string, readonly reason: string) {
    super(`Worktree "${path}" is locked${reason ? `: ${reason}` : ''}`)
    this.name = 'WorktreeLockedError'
  }
}
