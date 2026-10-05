/**
 * `ctx.repoMap` — Cordis service wiring around P4-T2's pure walk/parse/extract
 * functions: budget-bounded composition, event-driven targeted invalidation,
 * and `agent/pre-step` injection of a flat, naive-v1 repo symbol map.
 *
 * Splice position: this plugin enters its message immediately after the
 * claimed message batch on `agent/pre-step`, mirroring
 * `agent-instructions/src/index.ts:315-341` rather than `memory-recall`'s
 * prepend-and-append-last shape. A repo map is closer in spirit to baseline
 * workspace context (what agent-instructions injects) than to on-demand
 * recall triggered by a citation in the user's message (what memory-recall
 * injects): it is present on every step once computed, unconditionally, not
 * fetched in response to something the model asked for. The splice-after
 * position keeps the direct prompt first and lets driver-appended runtime
 * context (memory-recall, session-reference) still follow it.
 *
 * Event-driven invalidation mirrors `agent-instructions/src/index.ts:76-84,
 * 270-309,346-360`: a successful, non-aborted, file-mutating tool call
 * queues a targeted single-file recomputation (never a full repo re-walk),
 * gated behind `stepIsOpen` so recomputation never fires mid-step — a touch
 * observed while a step is open is deferred to `stepTouches` and flushed on
 * `step/end`. Recomputation is scoped to files the initial walk already
 * tracked: a touch to a path outside that set (a brand-new file, or one
 * never walked) is skipped entirely rather than triggering any parse — this
 * is a deliberate naive-v1 simplification (see the package README's Known
 * Limitations) that also makes "untracked touch never re-walks" trivially
 * true by construction, not by racing a debounce.
 *
 * `FILE_TOUCH_TOOL_NAMES` intentionally excludes `read`: agent-instructions
 * includes `read` because it tracks instruction *visibility*, but repo-map
 * only cares whether a file's *content* could have changed, so it watches
 * `write`, `edit`, `search_replace`, and `str_replace_editor`'s
 * content-mutating commands (`create`/`str_replace`/`insert`, not `view`).
 *
 * @module @deepseek-ai/dsh-repo-map/plugin
 */

import { isDeepStrictEqual } from 'node:util'
import { stat } from 'node:fs/promises'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage, LlmError } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-token-meter'
import type { ToolExecution, ToolExecutionResult, ToolExecutionToken } from '@deepseek-ai/dsh-tools'
import { walkRepoFiles } from './walk.ts'
import { extractFileSymbols } from './extract.ts'
import type { RepoMapFileResult } from './types.ts'
import { orderFilesByRecency, renderRepoMap, type RankedFile } from './render.ts'
import { DEFAULT_MIN_REPO_MAP_BYTES, DEFAULT_REPO_MAP_CONTEXT_FRACTION, RepoMapError, type Config } from './config.ts'

export { RepoMapError } from './config.ts'
export type { Config, RepoMapErrorCode } from './config.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    repoMap: RepoMap
  }
}

/** Producer-owned `source.kind` of the injected repo-map context message. */
export const REPO_MAP_PLUGIN_SOURCE_NAME = 'repo-map'

/** Durable source of the injected repo map. */
export interface RepoMapSource {
  kind: typeof REPO_MAP_PLUGIN_SOURCE_NAME
  form: 'instructions'
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'repo-map': RepoMapSource
  }
}

/** File-mutating tool names this plugin watches, and the argument key each carries its target path under. */
const FILE_TOUCH_ARG_NAME: Readonly<Record<string, string>> = {
  write: 'file_path',
  edit: 'file_path',
  search_replace: 'path',
  str_replace_editor: 'path',
}

/** `str_replace_editor` commands that can change file content; `view` is read-only. */
const STR_REPLACE_EDITOR_MUTATING_COMMANDS = new Set(['create', 'str_replace', 'insert'])

function filePathFromExecution(exec: ToolExecution): string | undefined {
  const argName = FILE_TOUCH_ARG_NAME[exec.name]
  if (argName === undefined) return undefined
  if (typeof exec.arguments !== 'object' || exec.arguments === null) return undefined
  const args = exec.arguments as Record<string, unknown>
  if (exec.name === 'str_replace_editor') {
    const command = args.command
    if (typeof command !== 'string' || !STR_REPLACE_EDITOR_MUTATING_COMMANDS.has(command)) return undefined
  }
  const raw = args[argName]
  if (typeof raw !== 'string') return undefined
  const path = raw.trim()
  return path.length > 0 ? path : undefined
}

function sameContextPayload(left: UserMessage, right: UserMessage): boolean {
  return isDeepStrictEqual(left.content, right.content) && isDeepStrictEqual(left.source, right.source)
}

function buildMessage(text: string): UserMessage {
  return createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: REPO_MAP_PLUGIN_SOURCE_NAME, form: 'instructions' },
  })
}

async function statMtime(path: string): Promise<number> {
  try {
    return (await stat(path)).mtimeMs
  } catch {
    return 0
  }
}

/** Per-session cache of the last walk: tracked files, their extracted symbols, and their mtimes. */
interface RepoMapState {
  rootDir: string
  files: Map<string, RepoMapFileResult>
  mtimes: Map<string, number>
}

/** One deferred or queued file touch. */
interface ProjectionTouch {
  agent: Agent
  path: string
}

/**
 * `ctx.repoMap`: owns the per-session symbol cache, the budget-bounded
 * composition, and the event-driven invalidation wired to `tools/result`
 * and `agent/pre-step`.
 */
export class RepoMap extends Service {
  static inject = ['sessionProjections', 'subprocess', 'tokenMeter']
  static Config: z<Config> = z.object({
    rootDir: z.string(),
    repoMapContextFraction: z.number().min(0).max(1).default(DEFAULT_REPO_MAP_CONTEXT_FRACTION),
  })

  private readonly config: { rootDir: string | undefined; repoMapContextFraction: number }
  private readonly states = new WeakMap<Session, RepoMapState>()
  private readonly stateInitTails = new WeakMap<Session, Promise<RepoMapState>>()
  private readonly projectionTails = new WeakMap<Agent, Promise<void>>()
  private readonly stepTouches = new WeakMap<Session, ProjectionTouch[]>()
  private readonly executionTouches = new Map<ToolExecutionToken, ProjectionTouch[]>()
  private readonly lifecycle = new AbortController()

  /**
   * Count of complete repository walks performed (one `rg --files` spawn plus
   * a parse of every discovered file each). Test/diagnostic instrumentation
   * only, never read by any decision this service makes.
   */
  walkCount: number = 0
  /**
   * Count of single-file targeted recomputations performed by the
   * event-driven invalidation path. Test/diagnostic instrumentation only.
   */
  fileRecomputeCount: number = 0

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'repoMap')
    this.config = {
      rootDir: config.rootDir,
      repoMapContextFraction: config.repoMapContextFraction ?? DEFAULT_REPO_MAP_CONTEXT_FRACTION,
    }
    if (!(this.config.repoMapContextFraction >= 0 && this.config.repoMapContextFraction <= 1)) {
      throw new RepoMapError(
        'repo-map: repoMapContextFraction must be between zero and one',
        'REPO_MAP_INVALID_CONFIG',
      )
    }

    ctx.effect(() => () => {
      this.lifecycle.abort(new Error('repo-map disposed'))
    }, 'repo-map.lifecycle')

    ctx.on('session/event', (session, event) => {
      if (event.type !== 'step/end') return
      const pending = this.stepTouches.get(session)
      if (pending === undefined) return
      this.stepTouches.delete(session)
      for (const touch of pending) this.queueProjection(touch.agent, touch.path)
    })

    ctx.on('tools/result', (exec: ToolExecution, result: ToolExecutionResult) => {
      const touches = this.executionTouches.get(exec.token) ?? []
      this.executionTouches.delete(exec.token)
      if (!result.isError && exec.agent !== undefined && !exec.signal.aborted) {
        const path = filePathFromExecution(exec)
        if (path !== undefined) touches.push({ agent: exec.agent, path })
      }
      if (exec.parent !== undefined) {
        if (touches.length > 0) {
          const parentTouches = this.executionTouches.get(exec.parent)
          if (parentTouches === undefined) this.executionTouches.set(exec.parent, touches)
          else parentTouches.push(...touches)
        }
        return
      }
      for (const touch of touches) this.projectTouch(touch)
    })

    ctx.on('agent/pre-step', async ({ agent, messages, signal }, next): Promise<PreStepDecision> => {
      const decision = await next()
      await this.waitForProjections(agent)
      if (decision.kind === 'reject') return decision
      const desired = await this.composeMessage(agent, signal)
      signal.throwIfAborted()
      if (desired === undefined) return decision
      if (decision.messages.some(message => sameContextPayload(message, desired))) return decision
      // Fold the repo map right after the claimed batch — see the module
      // docstring for why this mirrors agent-instructions' splice position.
      const lastClaimedIndex = decision.messages.findLastIndex(message => messages.includes(message))
      const entered = decision.messages.toSpliced(lastClaimedIndex + 1, 0, desired)
      return { ...decision, messages: entered }
    })
  }

  private async ensureState(agent: Agent, signal: AbortSignal): Promise<RepoMapState> {
    const session = agent.session
    const existing = this.states.get(session)
    if (existing !== undefined) return existing
    let pending = this.stateInitTails.get(session)
    if (pending === undefined) {
      pending = this.buildInitialState(agent, signal)
      this.stateInitTails.set(session, pending)
    }
    try {
      return await pending
    } finally {
      if (this.stateInitTails.get(session) === pending) this.stateInitTails.delete(session)
    }
  }

  private async buildInitialState(agent: Agent, signal: AbortSignal): Promise<RepoMapState> {
    /* v8 ignore next -- normal agents carry an absolute session cwd. */
    const rootDir = this.config.rootDir ?? agent.session.header.cwd ?? process.cwd()
    const paths = await walkRepoFiles(this.ctx, rootDir, { signal })
    this.walkCount += 1
    const files = new Map<string, RepoMapFileResult>()
    const mtimes = new Map<string, number>()
    for (const path of paths) {
      const [result, mtimeMs] = await Promise.all([extractFileSymbols(path), statMtime(path)])
      files.set(path, result)
      mtimes.set(path, mtimeMs)
    }
    const state: RepoMapState = { rootDir, files, mtimes }
    this.states.set(agent.session, state)
    return state
  }

  /**
   * Recompute one already-tracked file's symbols. A path the initial walk
   * never tracked is skipped without reading or parsing anything — this is
   * the content-identity/scope discipline that keeps an unrelated touch from
   * forcing any recomputation, let alone a full re-walk.
   */
  private async recomputeFile(session: Session, path: string): Promise<void> {
    const state = this.states.get(session)
    if (state === undefined) return
    if (!state.files.has(path)) return
    this.fileRecomputeCount += 1
    try {
      const [result, mtimeMs] = await Promise.all([extractFileSymbols(path), statMtime(path)])
      state.files.set(path, result)
      state.mtimes.set(path, mtimeMs)
    } catch {
      // Removed or unreadable: drop it from the tracked set rather than
      // retaining a stale symbol list for a path that no longer resolves.
      state.files.delete(path)
      state.mtimes.delete(path)
    }
  }

  private queueProjection(agent: Agent, path: string): void {
    const previous = this.projectionTails.get(agent) ?? Promise.resolve()
    const current = previous.then(() => this.recomputeFile(agent.session, path))
      .catch((error: unknown) => {
        if (!this.lifecycle.signal.aborted) this.ctx.logger.warn('repo-map targeted recomputation failed: %o', error)
      })
    this.projectionTails.set(agent, current)
    void current.then(() => {
      if (this.projectionTails.get(agent) === current) this.projectionTails.delete(agent)
    })
  }

  private async waitForProjections(agent: Agent): Promise<void> {
    let projection: Promise<void> | undefined
    while ((projection = this.projectionTails.get(agent)) !== undefined) await projection
  }

  private stepIsOpen(session: Session): boolean {
    const boundary = this.ctx.sessionProjections.stateOf(session, 'turnBoundary')
    if (boundary === undefined) {
      throw new RepoMapError('repo-map requires the turnBoundary session projection', 'REPO_MAP_MISSING_PROJECTION')
    }
    return boundary.openTurnStartSeq !== null
      && boundary.lastStepBoundary !== null
      && boundary.lastStepBoundary.kind === 'start'
      && boundary.lastStepBoundary.seq > boundary.openTurnStartSeq
  }

  private projectTouch(touch: ProjectionTouch): void {
    const session = touch.agent.session
    if (!this.stepIsOpen(session)) {
      this.queueProjection(touch.agent, touch.path)
      return
    }
    const pending = this.stepTouches.get(session)
    if (pending === undefined) this.stepTouches.set(session, [touch])
    else pending.push(touch)
  }

  private async resolveContextWindow(agent: Agent, signal: AbortSignal): Promise<number> {
    const fallback = DEFAULT_MIN_REPO_MAP_BYTES / 4
    const { provider, model } = agent.options
    const llm = this.ctx.get('llm')
    if (provider === undefined || model === undefined || llm === undefined) return fallback
    try {
      const info = await llm.resolveModelInfo(provider, model, signal)
      return info.context?.contextWindow ?? fallback
    } catch (error: unknown) {
      // Stream middleware can serve routes without a registered adapter.
      if (!(error instanceof LlmError) || error.code !== 'NO_ADAPTER') throw error
      return fallback
    }
  }

  /**
   * Compose the repo-map message for one step: size a byte budget from the
   * model's context window (`session-reference/src/index.ts:375`'s formula
   * shape), render within it, then treat `ctx.tokenMeter.estimateMessage`'s
   * real count on the actually-composed message as the authoritative second
   * gate — when it disagrees enough to risk exceeding the token budget, drop
   * the least-recently-touched tracked file and re-measure until it fits or
   * no files remain.
   */
  private async composeMessage(agent: Agent, signal: AbortSignal): Promise<UserMessage | undefined> {
    const state = await this.ensureState(agent, signal)
    if (state.files.size === 0) return undefined
    const contextWindow = await this.resolveContextWindow(agent, signal)
    const byteBudget = Math.max(
      DEFAULT_MIN_REPO_MAP_BYTES,
      Math.floor(contextWindow * 4 * this.config.repoMapContextFraction),
    )
    const tokenBudget = Math.max(1, Math.floor(contextWindow * this.config.repoMapContextFraction))
    let ranked: RankedFile[] = orderFilesByRecency([...state.files].map(([path, result]) => ({
      path,
      result,
      mtimeMs: state.mtimes.get(path) ?? 0,
    })))
    let text = renderRepoMap(ranked, byteBudget)
    let message = buildMessage(text)
    let tokens = this.ctx.tokenMeter.estimateMessage(message)
    let guard = ranked.length
    while (tokens > tokenBudget && ranked.length > 0 && guard-- > 0) {
      ranked = ranked.slice(0, -1)
      text = renderRepoMap(ranked, byteBudget)
      message = buildMessage(text)
      tokens = this.ctx.tokenMeter.estimateMessage(message)
    }
    if (text.trim().length === 0) return undefined
    return message
  }
}

export default RepoMap
