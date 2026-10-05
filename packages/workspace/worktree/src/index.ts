/**
 * Git worktree service (`ctx.worktrees`): creates a linked worktree on its
 * own branch, links or copies configured paths into it, runs setup commands,
 * and removes it again, so a session can run in a checkout of its own while
 * other sessions work in the same repository. Shared-path, copy-budget, and
 * clone logic is adapted from Orca (MIT, see `LICENSES/Orca-MIT.txt`).
 * @module @deepseek-ai/dsh-worktree
 */

import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-subprocess'
import type { RunCommand } from './apfs-clone.ts'
import { sanitizeBranchSlug } from './branch-name.ts'
import { formatSkippedCopyWarning } from './copy-budget.ts'
import { GitUnavailableError, NotALinkedWorktreeError, WorktreeDirtyError, WorktreeLockedError } from './errors.ts'
import { linkedWorktreeWritableRoots } from './git-dirs.ts'
import { Git, resolveGit } from './git.ts'
import { materializePaths, removeSharedLinks } from './linked-paths.ts'
import { runCollected } from './run-command.ts'
import type { MaterializeOptions } from './linked-paths.ts'
import { assertConfig, resolveSettings, worktreeDirectory } from './settings.ts'
import type {
  Config, CreateWorktreeRequest, CreatedWorktree, RemoveWorktreeRequest, RemovedWorktree, WorktreeSettings, WorktreeSummary,
} from './types.ts'
import {
  addWorktree, blockingEntries, deleteMergedBranch, findFreeSlot, listWorktrees, primaryCheckout, removeWorktree, resolveBaseRef, samePath,
  uncommittedEntries,
} from './worktrees.ts'

export {
  GitUnavailableError, NotALinkedWorktreeError, NotARepositoryError, WorktreeDirtyError, WorktreeLockedError,
} from './errors.ts'
export { linkedWorktreeWritableRoots } from './git-dirs.ts'
export type {
  Config, CopyBudgetConfig, CreateWorktreeRequest, CreatedWorktree, ProjectConfig, RemoveWorktreeRequest, RemovedWorktree,
  WorktreeSettings, WorktreeSummary,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    worktrees: WorktreeService
  }
}

/** Bytes of one setup command's output kept; stderr feeds its failure message. */
const SETUP_OUTPUT_BYTES = 8 * 1024
/** Milliseconds a setup child gets to exit after termination starts. */
const GRACE_MS = 2_000

/** Short branch name of a `refs/heads/...` ref, or undefined for a detached HEAD. */
function shortBranch(ref: string): string | undefined {
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : undefined
}

/**
 * Worktree service. Creation and removal are serialized per repository by git
 * itself; the service holds no state besides the resolved git executable.
 */
export default class WorktreeService extends Service {
  static inject = ['subprocess']
  // Inline schema call: the config catalog walks `static Config` statically.
  static Config: z<Config> = z.object({
    directory: z.string().default('../{repo}-worktrees'),
    baseRef: z.string().default('HEAD'),
    branchPrefix: z.string().default(''),
    sharedPaths: z.array(z.string()).default([]),
    copyPaths: z.array(z.string()).default(['.env', '.env.local']),
    setup: z.array(z.array(z.string())).default([]),
    // schemastery fills an absent array with `[]`, which would erase the deployment default;
    // a null default leaves it absent so the override only applies when written.
    projects: z.array(z.object({
      path: z.string().required(),
      directory: z.string(),
      baseRef: z.string(),
      branchPrefix: z.string(),
      sharedPaths: z.array(z.string()).default(null as never),
      copyPaths: z.array(z.string()).default(null as never),
      setup: z.array(z.array(z.string())).default(null as never),
    })).default([]),
    copyBudget: z.object({
      maxBytes: z.number().default(2 * 1024 * 1024 * 1024),
      maxEntries: z.number().default(50_000),
    }).default({}),
    timeoutMs: z.number().default(60_000),
    outputMaxBytes: z.number().default(8 * 1024 * 1024),
    setupTimeoutMs: z.number().default(10 * 60_000),
    grantGitAccess: z.boolean().default(true),
  })

  private readonly lifetime = new AbortController()
  private git?: Promise<Git>

  /**
   * @param ctx - host context with `subprocess`.
   * @param config - validated configuration.
   * @throws when the configuration names an unsafe path, an empty command, a relative project path, or a non-positive bound.
   */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'worktrees')
    assertConfig(config)
    ctx.effect(() => () => { this.lifetime.abort() }, 'worktree.lifetime')
    if (config.grantGitAccess) {
      ctx.inject(['sandboxPolicy'], (scope: Context) => {
        scope.effect(
          () => scope.sandboxPolicy.registerExtraWritableRoots(({ workspaceRoot }) => linkedWorktreeWritableRoots(workspaceRoot)),
          'worktree.sandboxRoots',
        )
      })
    }
  }

  /**
   * Create a worktree on a new branch for a repository.
   * @param request - the repository and optional name and base.
   * @returns the new checkout, its branch and base, and any non-fatal warnings.
   * @throws GitUnavailableError when git is missing.
   * @throws NotARepositoryError when `repoPath` is not inside a repository with a checkout.
   * @throws GitCommandError when git refuses to create the worktree.
   */
  async create(request: CreateWorktreeRequest): Promise<CreatedWorktree> {
    const signal = this.signalFor(request.signal)
    const git = await this.runner()
    const primary = await primaryCheckout(git, request.repoPath, signal)
    const settings = await this.settingsFor(primary.path)
    const directory = worktreeDirectory(settings.directory, primary.path)
    const name = sanitizeBranchSlug(request.name ?? '') || `wt-${randomBytes(3).toString('hex')}`
    const slot = await findFreeSlot(git, primary.path, directory, name, settings.branchPrefix, signal)
    const base = await resolveBaseRef(git, primary.path, request.baseRef ?? settings.baseRef, signal)
    const path = join(directory, slot.name)
    await mkdir(directory, { recursive: true })
    await addWorktree(git, primary.path, path, slot.branch, base, signal)
    // Read before the steps that can be cancelled, so a cancelled creation still reports the worktree it made.
    const head = (await git.must(['rev-parse', 'HEAD'], path, signal)).trim()

    const warnings: string[] = []
    const warn = (message: string): void => {
      warnings.push(message)
      this.ctx.logger.warn(`worktree ${path}: ${message}`)
    }
    const options = this.materializeOptions(warn)
    await materializePaths(primary.path, path, settings.sharedPaths, 'share', options)
    const skipped = await materializePaths(primary.path, path, settings.copyPaths, 'copy', options)
    const skippedWarning = formatSkippedCopyWarning(skipped, this.config.copyBudget)
    if (skippedWarning !== undefined) warnings.push(skippedWarning)
    for (const argv of settings.setup) {
      const failure = await this.runSetup(argv, path, signal)
      if (failure === undefined) continue
      warn(`Setup command ${JSON.stringify(argv)} failed: ${failure}`)
      break
    }
    return { path, branch: slot.branch, baseRef: base, head, primaryPath: primary.path, warnings }
  }

  /**
   * List the worktrees of a repository.
   * @param repoPath - any directory inside the repository or one of its worktrees.
   * @param signal - cancellation.
   * @returns the worktrees, the primary checkout first.
   * @throws GitUnavailableError when git is missing.
   * @throws NotARepositoryError when `repoPath` is not inside a repository.
   */
  async list(repoPath: string, signal?: AbortSignal): Promise<WorktreeSummary[]> {
    const entries = await listWorktrees(await this.runner(), repoPath, this.signalFor(signal))
    return entries.map(entry => ({
      path: entry.path,
      ...shortBranch(entry.branch) === undefined ? {} : { branch: shortBranch(entry.branch) as string },
      head: entry.head,
      isPrimary: entry.isMainWorktree,
      locked: entry.locked,
      prunable: entry.prunable,
    }))
  }

  /**
   * The uncommitted or untracked entries that would block a non-forced
   * removal, so a caller can warn before asking to remove.
   * @param path - the worktree.
   * @param signal - cancellation.
   * @returns `git status --porcelain` entries without the shared links this plugin created; empty when the worktree is clean.
   * @throws GitUnavailableError when git is missing.
   * @throws NotARepositoryError when `path` is not inside a repository.
   */
  async uncommittedChanges(path: string, signal?: AbortSignal): Promise<string[]> {
    const cancel = this.signalFor(signal)
    const git = await this.runner()
    const primary = await primaryCheckout(git, path, cancel)
    const settings = await this.settingsFor(primary.path)
    return blockingEntries(await uncommittedEntries(git, path, cancel), settings.sharedPaths)
  }

  /**
   * Remove a linked worktree and, when it is fully merged, its branch.
   * @param request - the worktree and removal options.
   * @returns the branch the worktree had and whether it was deleted.
   * @throws GitUnavailableError when git is missing.
   * @throws NotALinkedWorktreeError when `path` is the primary checkout or no worktree of the repository.
   * @throws WorktreeLockedError when the worktree is locked.
   * @throws WorktreeDirtyError when it holds uncommitted work and `force` is not set.
   * @throws GitCommandError when git refuses to remove it.
   */
  async remove(request: RemoveWorktreeRequest): Promise<RemovedWorktree> {
    const signal = this.signalFor(request.signal)
    const git = await this.runner()
    const entries = await listWorktrees(git, request.repoPath ?? request.path, signal)
    const matches = await Promise.all(entries.map(entry => samePath(entry.path, request.path)))
    const index = matches.indexOf(true)
    const target = entries[index]
    const primary = entries[0]
    if (target === undefined || primary === undefined || target.isMainWorktree) throw new NotALinkedWorktreeError(request.path)
    if (target.locked) throw new WorktreeLockedError(target.path, target.lockReason)
    const branch = shortBranch(target.branch)
    if (target.prunable) {
      await git.must(['worktree', 'prune'], primary.path, signal)
    } else {
      const settings = await this.settingsFor(primary.path)
      const force = request.force === true
      if (!force) {
        const blocking = blockingEntries(await uncommittedEntries(git, target.path, signal), settings.sharedPaths)
        if (blocking.length > 0) throw new WorktreeDirtyError(target.path, blocking)
        await removeSharedLinks(target.path, settings.sharedPaths, (message) => { this.ctx.logger.warn(`worktree ${target.path}: ${message}`) })
      }
      await removeWorktree(git, primary.path, target.path, force, signal)
    }
    const branchDeleted = branch !== undefined && request.keepBranch !== true && await deleteMergedBranch(git, primary.path, branch, signal)
    return { ...branch === undefined ? {} : { branch }, branchDeleted }
  }

  /** Merge the caller's cancellation with the plugin lifetime. */
  private signalFor(signal: AbortSignal | undefined): AbortSignal {
    return signal === undefined ? this.lifetime.signal : AbortSignal.any([signal, this.lifetime.signal])
  }

  /** The git runner, resolving the executable on first use. */
  private runner(): Promise<Git> {
    this.git ??= resolveGit(this.ctx.subprocess, this.lifetime.signal).then((executable) => {
      if (executable === null) throw new GitUnavailableError()
      return new Git(this.ctx.subprocess, executable, { timeoutMs: this.config.timeoutMs, outputMaxBytes: this.config.outputMaxBytes })
    })
    return this.git
  }

  /** Resolve the settings for one repository. */
  private settingsFor(primaryPath: string): Promise<WorktreeSettings> {
    return resolveSettings(this.config, primaryPath, samePath)
  }

  /** Collaborators for {@link materializePaths}, with commands spawned through the subprocess capability. */
  private materializeOptions(warn: (message: string) => void): MaterializeOptions {
    const run: RunCommand = argv => runCollected(this.ctx.subprocess, argv, this.lifetime.signal)
    return {
      platform: process.platform,
      apfsCloneDeps: { run, randomUUID, deviceOf: async path => (await stat(path)).dev },
      copyBudget: this.config.copyBudget,
      warn,
    }
  }

  /** Run one setup command in the new worktree; returns why it failed, or undefined when it succeeded. */
  private async runSetup(argv: readonly string[], cwd: string, signal: AbortSignal): Promise<string | undefined> {
    const [program, ...args] = argv as [string, ...string[]]
    let executable: string
    try {
      executable = await this.ctx.subprocess.resolveExecutable(program, undefined, signal)
    } catch (error) {
      return String(error)
    }
    const timeout = AbortSignal.timeout(this.config.setupTimeoutMs)
    const handle = this.ctx.subprocess.spawn({
      argv: [executable, ...args], cwd, graceMs: GRACE_MS, signal: AbortSignal.any([signal, timeout]),
      stdio: { stdin: 'ignore', stdout: { maxBytes: SETUP_OUTPUT_BYTES }, stderr: { maxBytes: SETUP_OUTPUT_BYTES } },
    })
    const outcome = await handle.done
    if (timeout.aborted) return `timed out after ${this.config.setupTimeoutMs}ms`
    if (signal.aborted) return 'was aborted'
    if (outcome.exitCode === 0) return undefined
    /* v8 ignore next -- collect-mode stdio always yields the stderr reader. */
    const stderr = handle.collected.stderr?.readFrom(0).text.trim() ?? ''
    return `exited ${outcome.exitCode}${stderr ? `: ${stderr}` : ''}`
  }
}
