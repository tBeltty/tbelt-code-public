/**
 * The Remote namespaces and client services the terminal panels call, described
 * by the members they use. Like {@link ./ports.ts}, these interfaces are the
 * whole contract between the panels and the browser-format client bundles; the
 * contract suite runs the real services against them.
 * @module @deepseek-ai/dsh-terminal-client/panel-ports
 */
import type { ObservablePort, RemoteResultPort } from './ports.ts'

/** One user-invocable skill. */
export interface SkillPort {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string | undefined
}

/** The `skills` Remote namespace. */
export interface SkillsRemotePort {
  list(request: { readonly sessionId: string }): Promise<RemoteResultPort<{ readonly skills: readonly SkillPort[] }>>
}

/** A scheduled follow-up as the catalog reports it. */
export interface ScheduleEntryPort {
  readonly id: string
  readonly kind: 'after' | 'at' | 'every' | 'daily' | 'weekly' | 'cron'
  readonly title: string
  readonly prompt: string
  readonly scheduledAt: string
  readonly sessionId: string
  readonly status: 'active' | 'inactive'
  readonly afterSeconds?: number | undefined
  readonly everySeconds?: number | undefined
  readonly time?: string | undefined
  readonly timeZone?: string | undefined
  readonly weekdays?: readonly number[] | undefined
  readonly expression?: string | undefined
  readonly lastDelivery?: { readonly deliveredAt: string } | undefined
}

/** A new timing for a scheduled follow-up. */
export type ScheduleTimingPort =
  | { readonly kind: 'at'; readonly at: string }
  | { readonly kind: 'every'; readonly every_seconds: number }
  | { readonly kind: 'daily'; readonly daily: { readonly time: string; readonly time_zone: string } }
  | { readonly kind: 'cron'; readonly cron: { readonly expression: string; readonly time_zone: string } }

/** One delivery of a scheduled follow-up. */
export interface ScheduleDeliveryPort {
  readonly scheduledAt: string
  readonly deliveredAt: string
  readonly prompt?: string | undefined
}

/** The `schedule` Remote namespace. */
export interface ScheduleRemotePort {
  catalog(): Promise<RemoteResultPort<readonly ScheduleEntryPort[]>>
  history(request: { readonly sessionId: string; readonly id: string; readonly limit: number }): Promise<RemoteResultPort<
    | { readonly records: readonly ScheduleDeliveryPort[] }
    | { readonly code: string }
  >>
  update(request: {
    readonly sessionId: string
    readonly id: string
    readonly expected: ScheduleEntryPort
    readonly title?: string
    readonly prompt?: string
    readonly change?: ScheduleTimingPort
  }): Promise<RemoteResultPort<{ readonly updated: boolean } | { readonly code: string }>>
  delete(request: { readonly sessionId: string; readonly id: string }): Promise<RemoteResultPort<{ readonly deleted: boolean }>>
}

/** A goal as the Host reports it. */
export interface GoalPort {
  readonly id: string
  readonly revision: number
  readonly objective: string
  readonly phase: 'active' | 'paused' | 'blocked' | 'complete'
  readonly blockedReason?: { readonly code: string; readonly message: string } | undefined
  readonly maxGoalRounds: number
  readonly roundsStarted: number
  readonly activation: 'armed' | 'disarmed'
}

/** The compare-and-set reference of a goal. */
export interface GoalRefPort {
  readonly id: string
  readonly revision: number
}

/** The `goals` Remote namespace. */
export interface GoalsRemotePort {
  get(sessionId: string): Promise<RemoteResultPort<GoalPort | undefined>>
  create(sessionId: string, request: { readonly objective: string }): Promise<RemoteResultPort<{ readonly ref: GoalRefPort }>>
  edit(sessionId: string, ref: GoalRefPort, request: { readonly objective: string }): Promise<RemoteResultPort<GoalPort>>
  pause(sessionId: string, ref: GoalRefPort): Promise<RemoteResultPort<GoalPort>>
  resume(sessionId: string, ref: GoalRefPort): Promise<RemoteResultPort<GoalPort>>
  complete(sessionId: string, ref: GoalRefPort): Promise<RemoteResultPort<GoalPort>>
  clear(sessionId: string, ref: GoalRefPort): Promise<RemoteResultPort<GoalRefPort>>
}

/** A direct child of a session, as the parent's catalog lists it. */
export interface SubagentEntryPort {
  readonly id: string
  readonly mode: 'one-shot' | 'continuable' | 'unknown'
  readonly label?: string | undefined
}

/** The `subagents` Remote namespace. */
export interface SubagentsRemotePort {
  prompt(request: {
    readonly requestId: string
    readonly parentSessionId: string
    readonly childSessionId: string
    readonly mode: 'continuable'
    readonly delivery: 'queue' | 'steer'
    readonly content: readonly { readonly type: 'text'; readonly text: string }[]
  }, signal?: AbortSignal): Promise<RemoteResultPort<{ readonly messageId: string }>>
  interruptByParent(childSessionId: string, parentSessionId: string, mode: 'continuable'): Promise<RemoteResultPort<{ readonly accepted: true }>>
}

/** A background job as the roster reports it. */
export interface JobViewPort {
  readonly id: string
  readonly kind: string
  readonly label: string
  readonly status: 'running' | 'stopping' | 'completed' | 'killed' | 'failed'
  readonly progress?: string | undefined
  readonly detail?: string | undefined
  readonly startedAt: number
  readonly finishedAt?: number | undefined
}

/** The live view of one observed job's output. */
export interface ObservedJobPort {
  readonly text: string
  readonly gapBefore: boolean
  readonly streaming: boolean
  readonly error?: string | undefined
}

/** The client jobs service. */
export interface JobsPort {
  readonly state: ObservablePort<{
    readonly rows: Readonly<Record<string, readonly JobViewPort[]>>
    readonly observed: Readonly<Record<string, ObservedJobPort>>
  }>
  watchRows(sessionId: string): () => void
  observe(sessionId: string | undefined, id: string): () => void
  kill(sessionId: string, id: string): Promise<RemoteResultPort<{ readonly outcome: 'requested' | 'already-finished' }>>
}

/** One workspace as the registry lists it. */
export interface WorkspacePort {
  readonly workspaceId: string
  readonly path: string
  readonly title: string
  readonly sessionIds: readonly string[]
}

/** One worktree of a repository. */
export interface WorktreePort {
  readonly path: string
  readonly branch?: string | undefined
  readonly isPrimary: boolean
  readonly locked: boolean
  readonly prunable: boolean
  readonly workspaceId?: string | undefined
}

/** The client workspace service; its commands throw when the Host refuses. */
export interface WorkspacesPort {
  readonly list: ObservablePort<{
    readonly items: readonly WorkspacePort[]
    readonly archivedSessionIds: readonly string[]
    readonly pinnedSessionIds: readonly string[]
    readonly phase: 'pending' | 'ready'
  }>
  create(input: { readonly path: string }): Promise<WorkspacePort>
  rename(workspaceId: string, title: string): Promise<WorkspacePort>
  delete(workspaceId: string): Promise<void>
  insertBefore(workspaceId: string, beforeWorkspaceId?: string): Promise<void>
  createWorktree(workspaceId: string, options?: { readonly name?: string; readonly baseRef?: string }): Promise<{
    readonly workspace: WorkspacePort
    readonly worktree: { readonly branch: string; readonly baseRef: string; readonly warnings: readonly string[] }
  }>
  listWorktrees(workspaceId: string): Promise<{ readonly worktrees: readonly WorktreePort[] }>
  inspectWorktree(workspaceId: string): Promise<{
    readonly linked: boolean
    readonly branch?: string | undefined
    readonly uncommitted: readonly string[]
  }>
  removeWorktree(workspaceId: string, options?: { readonly force?: boolean }): Promise<{
    readonly deleted: true
    readonly branch?: string | undefined
    readonly branchDeleted: boolean
  }>
  archiveSession(sessionId: string, options?: { readonly stopActivity?: boolean }): Promise<void>
  unarchiveSession(sessionId: string): Promise<void>
  pinSession(sessionId: string): Promise<void>
  unpinSession(sessionId: string): Promise<void>
  insertSessionBefore(workspaceId: string, sessionId: string, beforeSessionId?: string): Promise<WorkspacePort>
}

/** The client file upload service. */
export interface FileUploadPort {
  upload(sessionId: string, data: Uint8Array, name?: string): Promise<RemoteResultPort<{
    readonly receiptId: string
    readonly file: { readonly name: string; readonly bytes: number }
  }>>
}

/** A file or directory that `@` can name. */
export interface FileCandidatePort {
  /** Path relative to the session directory. */
  readonly path: string
  readonly kind: 'file' | 'directory'
}

/** A session that `@` can name. */
export interface SessionCandidatePort {
  readonly sessionId: string
  readonly label: string
  readonly displayTitle?: string | undefined
  /** The text that goes into the prompt to name the session. */
  readonly mention: string
}

/** The `fileReferences` Remote namespace. */
export interface FileReferencesRemotePort {
  list(sessionId: string, query: string): Promise<RemoteResultPort<readonly FileCandidatePort[]>>
}

/** The `sessionReferenceResolver` Remote namespace. */
export interface SessionReferencesRemotePort {
  candidates(sessionId: string, query: string): Promise<RemoteResultPort<readonly SessionCandidatePort[]>>
}

/** One assistant message rating. */
export interface MessageFeedbackItemPort {
  readonly messageId: string
  readonly rating: 'positive' | 'negative'
  readonly note?: string | undefined
  readonly version: string
}

/** The `messageFeedback` Remote namespace. */
export interface MessageFeedbackRemotePort {
  list(request: { readonly sessionId: string }): Promise<RemoteResultPort<
    | { readonly ok: true; readonly value: { readonly items: readonly MessageFeedbackItemPort[] } }
    | { readonly ok: false; readonly error: { readonly code: string } }
  >>
  put(request: {
    readonly sessionId: string
    readonly messageId: string
    readonly rating: 'positive' | 'negative'
    readonly note?: string
    readonly category?: string
    readonly ifVersion: string | null
  }): Promise<RemoteResultPort<
    | { readonly ok: true; readonly value: MessageFeedbackItemPort }
    | { readonly ok: false; readonly error: { readonly code: string } }
  >>
  delete(request: { readonly sessionId: string; readonly messageId: string; readonly ifVersion: string }): Promise<RemoteResultPort<
    | { readonly ok: true }
    | { readonly ok: false; readonly error: { readonly code: string } }
  >>
}

/** The `sessionFeedback` Remote namespace. */
export interface SessionFeedbackRemotePort {
  record(request: { readonly sessionId: string; readonly text?: string; readonly category?: string }): Promise<RemoteResultPort<
    | { readonly ok: true }
    | { readonly ok: false; readonly error: { readonly code: string } }
  >>
}

/** Spend and limit of one scope. */
export interface SpendScopePort {
  readonly spentUsd: number
  readonly limitUsd?: number | undefined
  readonly unpricedCalls: number
}

/** The `spendBudget` Remote namespace. */
export interface SpendBudgetRemotePort {
  summary(sessionId: string): Promise<RemoteResultPort<{
    readonly session: SpendScopePort
    readonly month: string
    readonly monthly: SpendScopePort
  }>>
}

/** A command the Host offers. */
export interface CommandPort {
  readonly name: string
  readonly description: string
  readonly input?: { readonly hint: string } | undefined
}

/** The `commands` Remote namespace. */
export interface CommandsRemotePort {
  list(sessionId: string): Promise<RemoteResultPort<readonly CommandPort[]>>
}

/** An application that can open a path. */
export interface PathApplicationPort {
  readonly id: string
  readonly name: string
  readonly default: boolean
}

/** The `userQuestions` Remote namespace. */
export interface UserQuestionsRemotePort {
  attachWait(sessionId: string, callId: string, signal: AbortSignal): AsyncIterable<{ readonly remainingMs: number }> & {
    [Symbol.asyncIterator](): AsyncIterator<{ readonly remainingMs: number }>
    dispose?(): void
  }
}
