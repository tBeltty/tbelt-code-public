/** Public vocabulary of the worktree service: configuration, requests, and results. */

/** Per-repository worktree behavior; every field has a deployment default and a per-project override. */
export interface WorktreeSettings {
  /**
   * Directory that holds the repository's worktrees, one subdirectory each.
   * `{repo}` stands for the primary checkout's directory name; a relative
   * value resolves against the primary checkout, so the default lands beside it.
   */
  directory: string
  /** Ref a new worktree branches from when the request names none. `HEAD` follows the primary checkout. */
  baseRef: string
  /** Text placed before the worktree name in its branch name, such as `wt/`. */
  branchPrefix: string
  /** Repository-relative paths symlinked from the primary checkout so one install serves every worktree, such as `node_modules`. */
  sharedPaths: string[]
  /** Repository-relative paths copied into each worktree, such as local environment files. Missing paths are skipped. */
  copyPaths: string[]
  /** Commands run in order inside a new worktree, each an argument list never interpreted by a shell. The first failure stops the rest. */
  setup: string[][]
}

/** Overrides for the repository whose primary checkout is {@link ProjectConfig.path}. */
export interface ProjectConfig extends Partial<WorktreeSettings> {
  /** Absolute path of the primary checkout the overrides apply to. */
  path: string
}

/** Ceilings for the files copied into one worktree, measured before copying. */
export interface CopyBudgetConfig {
  /** Total bytes the copies may hold. */
  maxBytes: number
  /** Total files and directories the copies may hold. */
  maxEntries: number
}

/** Plugin configuration: the default {@link WorktreeSettings}, per-project overrides, and bounds. */
export interface Config extends WorktreeSettings {
  /** Per-repository overrides, matched by primary checkout path. */
  projects: ProjectConfig[]
  /** Copy ceilings shared by every repository. */
  copyBudget: CopyBudgetConfig
  /** Milliseconds one git command may run. */
  timeoutMs: number
  /** Bytes of git output retained per command. */
  outputMaxBytes: number
  /** Milliseconds one setup command may run. */
  setupTimeoutMs: number
  /**
   * Let `workspace-write` sessions inside a linked worktree write the git
   * directories `git commit` needs. Without it a confined `git commit`
   * fails there.
   */
  grantGitAccess: boolean
}

/** A request to create a worktree. */
export interface CreateWorktreeRequest {
  /** Any directory inside the repository or one of its worktrees. */
  repoPath: string
  /** Name for the worktree and its branch, normalized to kebab-case; a random name is used when absent. */
  name?: string
  /** Ref to branch from, overriding the configured base. */
  baseRef?: string
  /** Cancellation. */
  signal?: AbortSignal
}

/** A created worktree. */
export interface CreatedWorktree {
  /** Absolute path of the new checkout. */
  path: string
  /** The new branch. */
  branch: string
  /** The qualified ref the branch was created from. */
  baseRef: string
  /** The commit the worktree starts at. */
  head: string
  /** The primary checkout it belongs to. */
  primaryPath: string
  /** Problems that did not stop creation: skipped copies, failed links, a failed setup command. */
  warnings: string[]
}

/** A request to remove a worktree. */
export interface RemoveWorktreeRequest {
  /** The worktree to remove. */
  path: string
  /** A directory inside the repository to run git in when the worktree directory is already gone. */
  repoPath?: string
  /** Remove even with uncommitted or untracked changes. */
  force?: boolean
  /** Keep the branch even when it is fully merged. */
  keepBranch?: boolean
  /** Cancellation. */
  signal?: AbortSignal
}

/** What a removal did. */
export interface RemovedWorktree {
  /** The short branch name the worktree had, absent when it was detached. */
  branch?: string
  /** The branch was fully merged and deleted; an unmerged branch is kept. */
  branchDeleted: boolean
}

/** One worktree of a repository. */
export interface WorktreeSummary {
  /** Absolute checkout path. */
  path: string
  /** Short branch name, absent when detached. */
  branch?: string
  /** The commit it is at. */
  head: string
  /** It is the primary checkout, which this plugin never removes. */
  isPrimary: boolean
  /** It is locked against removal. */
  locked: boolean
  /** Its directory is gone and git would prune the registration. */
  prunable: boolean
}
