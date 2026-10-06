/**
 * Browser-safe request, result, and state-stream vocabulary for the Workspace
 * and directory-picking Remote namespaces this package owns. The picking seam
 * declares its own listing types, so they are re-exported here rather than
 * restated: a browser consumer reads the very declaration the backend answers.
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionActivity, WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

export type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
export type {
  SessionActivity, SessionActivityItem, SessionActivityKind, SessionActivityKindMap,
} from '@deepseek-ai/dsh-workspace/types'
export type { DirectoryEntry, DirectoryListing } from '@deepseek-ai/dsh-host-directory-picker/types'

/** One durable Workspace projected for browser consumers. */
export interface WorkspaceView {
  readonly workspaceId: WorkspaceId
  /** Canonical host directory path. */
  readonly path: string
  /** User-visible title. */
  readonly title: string
  /** Sessions accounted to this Workspace in manual order. */
  readonly sessionIds: readonly SessionId[]
  /** ISO-8601 creation instant. */
  readonly createdAt: string
  /** ISO-8601 last-mutation instant. */
  readonly updatedAt: string
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The requested directory cannot back a Workspace. */
    'workspace/invalid-path': { readonly path: string }
    /** Another Workspace already uses the requested name. */
    'workspace/name-conflict': { readonly name: string }
    /**
     * The Session still has running work — its own turn, a subagent, a
     * background job, or an active schedule — so archiving was refused
     * without a write; `activity` names what must stop first.
     */
    'workspace/session-active': {
      readonly sessionId: SessionId
      readonly activity: readonly SessionActivity[]
    }
    /** The Session or its anchor is not in the Workspace's manual order. */
    'workspace/move-invalid': {
      readonly workspaceId: WorkspaceId
      readonly sessionId: SessionId
      readonly beforeSessionId?: SessionId
    }
    /** The worktree service is not mounted, git is missing, or the Workspace directory is not a repository checkout. */
    'workspace/worktree-unavailable': { readonly workspaceId: WorkspaceId }
    /** A removal was refused because the worktree holds uncommitted or untracked changes. */
    'workspace/worktree-dirty': { readonly workspaceId: WorkspaceId; readonly entries: readonly string[] }
    /** The Workspace is not a removable linked worktree, or git refused the operation. */
    'workspace/worktree-failed': { readonly workspaceId: WorkspaceId }
    /** The verb needs an interaction the composed backend does not serve. */
    'directory-picker/unavailable': { readonly capability: string }
    /** The target is not fully qualified, or the backend cannot list it. */
    'directory-picker/unreadable': { readonly path: string }
    /** A child of that name is already there. */
    'directory-picker/exists': { readonly path: string }
    /** The parent is not fully qualified, the name is not one segment, or creation failed. */
    'directory-picker/create-failed': { readonly path: string }
  }
}

/** Existing directory requested for Workspace adoption. */
export interface WorkspaceCreateRequest {
  readonly path: string
}

/** Created or previously registered Workspace. */
export interface WorkspaceCreateValue {
  readonly workspace: WorkspaceView
  readonly created: boolean
}

/** Workspace title mutation. */
export interface WorkspaceRenameRequest {
  readonly workspaceId: WorkspaceId
  readonly title: string
}

/** Workspace mutation returning the complete changed row. */
export interface WorkspaceValue {
  readonly workspace: WorkspaceView
}

/** Workspace registration deletion. */
export interface WorkspaceDeleteRequest {
  readonly workspaceId: WorkspaceId
}

/** Receipt after one Workspace registration is deleted. */
export interface WorkspaceDeleteValue {
  readonly deleted: true
}

/** DOM-insertBefore-like Workspace order mutation. */
export interface WorkspaceInsertBeforeRequest {
  readonly workspaceId: WorkspaceId
  readonly beforeWorkspaceId?: WorkspaceId
}

/** Complete Workspace registry order after a mutation. */
export interface WorkspaceOrderValue {
  readonly workspaceIds: readonly WorkspaceId[]
}

/** DOM-insertBefore-like Session membership order mutation. */
export interface WorkspaceInsertSessionBeforeRequest {
  readonly workspaceId: WorkspaceId
  readonly sessionId: SessionId
  readonly beforeSessionId?: SessionId
}

/** Session requested for archival from Workspace grouping surfaces. */
export interface WorkspaceArchiveSessionRequest {
  readonly sessionId: SessionId
  /**
   * Stop the Session's running work — its turn, subagent descendants, owned
   * background jobs, and active schedules — instead of refusing the archive
   * as `workspace/session-active`. The stops are requested before the
   * archive write and are not awaited; the response arrives once the archive
   * set is durable.
   */
  readonly stopActivity?: boolean
}

/** Session requested for restoration from the archived Session list. */
export interface WorkspaceUnarchiveSessionRequest {
  readonly sessionId: SessionId
}

/** Complete archived Session set after a mutation. */
export interface WorkspaceArchiveValue {
  readonly archivedSessionIds: readonly SessionId[]
}

/** Session requested for pinning ahead of unpinned Sessions on grouping surfaces. */
export interface WorkspacePinSessionRequest {
  readonly sessionId: SessionId
}

/** Session requested for removal from the pin set. */
export interface WorkspaceUnpinSessionRequest {
  readonly sessionId: SessionId
}

/** Complete pinned Session set after a mutation, most recently pinned first. */
export interface WorkspacePinValue {
  readonly pinnedSessionIds: readonly SessionId[]
}

/** New linked worktree requested from the repository a Workspace points at. */
export interface WorkspaceCreateWorktreeRequest {
  /** Workspace whose directory is the repository (or one of its worktrees). */
  readonly workspaceId: WorkspaceId
  /** Name the branch and directory are derived from; generated when omitted. */
  readonly name?: string
  /** Ref the new branch starts from; the configured default when omitted. */
  readonly baseRef?: string
}

/** The Workspace registered over a freshly created worktree. */
export interface WorkspaceCreateWorktreeValue {
  readonly workspace: WorkspaceView
  readonly worktree: {
    readonly branch: string
    readonly baseRef: string
    /** Non-fatal problems from linking, copying, or setup commands. */
    readonly warnings: readonly string[]
  }
}

/** Worktree listing requested for the repository of one Workspace. */
export interface WorkspaceListWorktreesRequest {
  readonly workspaceId: WorkspaceId
}

/** One worktree of a repository. */
export interface WorkspaceWorktreeEntry {
  readonly path: string
  readonly branch?: string
  readonly isPrimary: boolean
  readonly locked: boolean
  readonly prunable: boolean
  /** The Workspace registered over this directory, when there is one. */
  readonly workspaceId?: WorkspaceId
}

/** Every worktree of the repository, primary checkout first. */
export interface WorkspaceListWorktreesValue {
  readonly worktrees: readonly WorkspaceWorktreeEntry[]
}

/** Worktree state requested before offering its removal. */
export interface WorkspaceInspectWorktreeRequest {
  readonly workspaceId: WorkspaceId
}

/**
 * What removing a Workspace would do to its directory. A Workspace that is not
 * a linked worktree (or a host without the worktree service) reports
 * `linked: false`, so callers fall back to the plain registration delete.
 */
export interface WorkspaceInspectWorktreeValue {
  readonly linked: boolean
  readonly branch?: string
  /** `git status --porcelain` entries a removal would lose; empty when clean. */
  readonly uncommitted: readonly string[]
}

/** Linked worktree and its Workspace registration to remove. */
export interface WorkspaceRemoveWorktreeRequest {
  readonly workspaceId: WorkspaceId
  /** Remove even when the worktree holds uncommitted changes. */
  readonly force?: boolean
}

/** Receipt after a worktree and its Workspace registration are removed. */
export interface WorkspaceRemoveWorktreeValue {
  readonly deleted: true
  readonly branch?: string
  /** True when the branch was fully merged and was deleted with the worktree. */
  readonly branchDeleted: boolean
}

/** Complete reconnect baseline for Workspace browser state. */
export interface WorkspaceBaseline {
  readonly items: readonly WorkspaceView[]
  readonly archivedSessionIds: readonly SessionId[]
  /** Registry-global pin set, most recently pinned first. */
  readonly pinnedSessionIds: readonly SessionId[]
}

/** One ordered Workspace change after a generation's baseline. */
export type WorkspaceFollowIncrement =
  | { readonly type: 'upsert'; readonly workspace: WorkspaceView }
  | { readonly type: 'remove'; readonly workspaceId: WorkspaceId }
  | { readonly type: 'order'; readonly workspaceIds: readonly WorkspaceId[] }
  | { readonly type: 'archived'; readonly archivedSessionIds: readonly SessionId[] }
  | { readonly type: 'pinned'; readonly pinnedSessionIds: readonly SessionId[] }

/** Workspace state stream; every generation starts with exactly one baseline. */
export type WorkspaceFollowFrame =
  | { readonly type: 'baseline'; readonly value: WorkspaceBaseline }
  | WorkspaceFollowIncrement
