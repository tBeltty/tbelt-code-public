/** Worktree commands of the Workspace Remote owner, backed by the optional `ctx.worktrees` service. */

import { realpath } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { GitUnavailableError, NotARepositoryError, WorktreeDirtyError } from '@deepseek-ai/dsh-worktree'
import type WorktreeService from '@deepseek-ai/dsh-worktree'
import type {
  WorkspaceCreateRequest,
  WorkspaceCreateValue,
  WorkspaceCreateWorktreeRequest,
  WorkspaceCreateWorktreeValue,
  WorkspaceDeleteRequest,
  WorkspaceDeleteValue,
  WorkspaceInspectWorktreeRequest,
  WorkspaceInspectWorktreeValue,
  WorkspaceListWorktreesRequest,
  WorkspaceListWorktreesValue,
  WorkspaceRemoveWorktreeRequest,
  WorkspaceRemoveWorktreeValue,
} from './types.ts'

/** Registration verbs the worktree commands reuse from the Workspace commands, so they share its serialization. */
export interface RegistrationVerbs {
  create(request: WorkspaceCreateRequest): Promise<WorkspaceCreateValue>
  delete(request: WorkspaceDeleteRequest): Promise<WorkspaceDeleteValue>
}

/** Implements worktree creation, listing, inspection, and removal over registered Workspaces. */
export class WorktreeCommands {
  /**
   * @param ctx - Host context; `worktrees` may be absent.
   * @param verbs - Workspace registration commands.
   */
  constructor(private readonly ctx: Context, private readonly verbs: RegistrationVerbs) {}

  /**
   * Create a linked worktree of a Workspace's repository and register a Workspace over it.
   * @param request - source Workspace and optional name and base ref.
   * @returns the new Workspace and the branch it was created on.
   */
  async create(request: WorkspaceCreateWorktreeRequest): Promise<WorkspaceCreateWorktreeValue> {
    const workspace = this.requireWorkspace(request.workspaceId)
    const created = await this.guard(request.workspaceId, () => this.service(request.workspaceId).create({
      repoPath: workspace.path,
      ...request.name === undefined ? {} : { name: request.name },
      ...request.baseRef === undefined ? {} : { baseRef: request.baseRef },
    }))
    const registered = await this.verbs.create({ path: created.path })
    return {
      workspace: registered.workspace,
      worktree: { branch: created.branch, baseRef: created.baseRef, warnings: created.warnings },
    }
  }

  /**
   * List the worktrees of a Workspace's repository.
   * @param request - Workspace inside the repository.
   * @returns each worktree with the Workspace registered over it, if any.
   */
  async list(request: WorkspaceListWorktreesRequest): Promise<WorkspaceListWorktreesValue> {
    const workspace = this.requireWorkspace(request.workspaceId)
    const summaries = await this.guard(request.workspaceId, () => this.service(request.workspaceId).list(workspace.path))
    const registered = await this.registeredByPath()
    return {
      worktrees: await Promise.all(summaries.map(async (summary) => {
        const workspaceId = registered.get(await canonical(summary.path))
        return {
          path: summary.path,
          ...summary.branch === undefined ? {} : { branch: summary.branch },
          isPrimary: summary.isPrimary,
          locked: summary.locked,
          prunable: summary.prunable,
          ...workspaceId === undefined ? {} : { workspaceId },
        }
      })),
    }
  }

  /**
   * Report whether a Workspace is a linked worktree and what removing it would lose.
   * @param request - Workspace to inspect.
   * @returns `linked: false` for a primary checkout, a plain directory, or a host without the service.
   */
  async inspect(request: WorkspaceInspectWorktreeRequest): Promise<WorkspaceInspectWorktreeValue> {
    const workspace = this.requireWorkspace(request.workspaceId)
    const service = this.ctx.get('worktrees')
    if (service === undefined) return { linked: false, uncommitted: [] }
    try {
      const own = await linkedEntry(service, workspace.path)
      if (own === undefined) return { linked: false, uncommitted: [] }
      return {
        linked: true,
        ...own.branch === undefined ? {} : { branch: own.branch },
        uncommitted: await service.uncommittedChanges(workspace.path),
      }
    } catch (error) {
      if (error instanceof GitUnavailableError || error instanceof NotARepositoryError) {
        return { linked: false, uncommitted: [] }
      }
      throw error
    }
  }

  /**
   * Remove a Workspace's linked worktree, then its registration. Sessions and their logs stay.
   * @param request - Workspace to remove and whether to discard uncommitted changes.
   * @returns the removed branch and whether it was deleted.
   */
  async remove(request: WorkspaceRemoveWorktreeRequest): Promise<WorkspaceRemoveWorktreeValue> {
    const workspace = this.requireWorkspace(request.workspaceId)
    const removed = await this.guard(request.workspaceId, () => this.service(request.workspaceId).remove({
      path: workspace.path,
      ...request.force === true ? { force: true } : {},
    }))
    await this.verbs.delete({ workspaceId: request.workspaceId })
    return { deleted: true, ...removed.branch === undefined ? {} : { branch: removed.branch }, branchDeleted: removed.branchDeleted }
  }

  private service(workspaceId: WorkspaceId): WorktreeService {
    const service = this.ctx.get('worktrees')
    if (service === undefined) throw unavailable(workspaceId, 'the worktree service is not mounted on this host')
    return service
  }

  private requireWorkspace(workspaceId: WorkspaceId): Workspace {
    const workspace = this.ctx.workspaceRegistry.get(WorkspaceId(workspaceId))
    if (workspace === undefined) {
      throw new RemoteError('workspace/not-found', `Workspace "${workspaceId}" not found`, { workspaceId })
    }
    return workspace
  }

  private async registeredByPath(): Promise<Map<string, WorkspaceId>> {
    const entries = await Promise.all(this.ctx.workspaceRegistry.list().map(async workspace => [
      await canonical(workspace.path), workspace.id,
    ] as const))
    return new Map(entries)
  }

  /** Map worktree service failures to stable Remote failures. */
  private async guard<T>(workspaceId: WorkspaceId, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof RemoteError) throw error
      if (error instanceof GitUnavailableError || error instanceof NotARepositoryError) {
        throw unavailable(workspaceId, error.message, error)
      }
      if (error instanceof WorktreeDirtyError) {
        throw new RemoteError('workspace/worktree-dirty', error.message, { workspaceId, entries: error.entries }, { cause: error })
      }
      // A primary checkout, a locked worktree, and a git refusal all surface as one failure whose message names the cause.
      /* v8 ignore next -- the worktree service throws Error subclasses only. */
      const message = error instanceof Error ? error.message : String(error)
      throw new RemoteError('workspace/worktree-failed', message, { workspaceId }, { cause: error })
    }
  }
}

function unavailable(workspaceId: WorkspaceId, message: string, cause?: unknown): RemoteError<'workspace/worktree-unavailable'> {
  return new RemoteError('workspace/worktree-unavailable', message, { workspaceId }, cause === undefined ? undefined : { cause })
}

/** The linked (non-primary) worktree whose directory is `path`, if any. */
async function linkedEntry(service: WorktreeService, path: string) {
  const own = await canonical(path)
  const summaries = await service.list(path)
  for (const summary of summaries) {
    if (!summary.isPrimary && await canonical(summary.path) === own) return summary
  }
  return undefined
}

async function canonical(path: string): Promise<string> {
  try {
    return await realpath(path)
  } catch (missing) {
    // A deleted directory has no canonical form; compare it as written. `missing` is the ENOENT or EACCES from realpath.
    void missing
    return path
  }
}
