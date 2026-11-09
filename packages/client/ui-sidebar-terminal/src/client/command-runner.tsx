/** Run buttons for shell fences in the conversation, executed in a sidebar terminal with user permissions. */
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { TerminalCommandResult, WebTerminalId } from '@deepseek-ai/dsh-api-terminal-controller/types'
import type { TerminalCommandRun } from '@deepseek-ai/dsh-api-terminal-controller/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import {
  CodeToolbarAction, IconPlayOutlineRegular, type MarkdownCodeRunner, type MarkdownCodeRunnerProps,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarTerminalKey } from './locales.ts'
import css from './command-runner.module.css'

/** Fence languages that run in the execution environment's default shell. */
export const RUNNABLE_LANGUAGES: ReadonlySet<string> = new Set(['bash', 'sh', 'shell', 'zsh'])

/** Progress of one command text in one Session; identical fences share it. */
export type CommandRunState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'starting' }
  | { readonly phase: 'running'; readonly id: WebTerminalId }
  | { readonly phase: 'done'; readonly id: WebTerminalId; readonly result: TerminalCommandResult; readonly reported: boolean }
  | { readonly phase: 'failed'; readonly id?: WebTerminalId | undefined; readonly message: string }

/** One shared run state with stable React subscription callbacks. */
interface CommandRunStore {
  readonly state: SnapshotStore<CommandRunState>
  readonly subscribe: (listener: () => void) => () => void
  readonly getSnapshot: () => CommandRunState
}

/** Session-bound operations the runner performs. */
export interface CommandRunnerDeps {
  /**
   * Start a command terminal.
   * @param command - fence source.
   * @param signal - plugin lifetime.
   * @returns the terminal identity and its pending result.
   */
  readonly run: (command: string, signal: AbortSignal) => Promise<TerminalCommandRun>
  /**
   * Show a command terminal in the right sidebar.
   * @param id - Host terminal identity.
   */
  readonly open: (id: WebTerminalId) => void
  /**
   * Queue a user message in the Session.
   * @param text - message text.
   * @returns an error message, or null after the Session accepted it.
   */
  readonly report: (text: string) => Promise<string | null>
  /**
   * Translate terminal copy.
   * @param key - locale key.
   * @param params - interpolation values.
   * @returns localized text.
   */
  readonly t: (key: SidebarTerminalKey, params?: Record<string, string | number>) => string
  /** Cancels result waits when the plugin unloads. */
  readonly signal: AbortSignal
}

/**
 * Wrap text in a Markdown fence longer than any backtick run inside it.
 * @param text - fence body.
 * @param lang - info string.
 * @returns the fenced block.
 */
export function fence(text: string, lang: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/gu)].map(match => match[0].length))
  const marker = '`'.repeat(longest + 1)
  return `${marker}${lang}\n${text}\n${marker}`
}

/**
 * Compose the message that returns a command's outcome to the Agent.
 * @param command - executed fence source.
 * @param lang - fence language.
 * @param result - final terminal state.
 * @param t - terminal copy.
 * @returns Markdown with the command, exit status and output.
 */
export function commandReport(
  command: string, lang: string, result: TerminalCommandResult, t: CommandRunnerDeps['t'],
): string {
  const status = result.state === 'failed'
    ? t('run.report.failed', { message: result.error ?? '' })
    : result.exitCode === null ? t('run.report.stopped') : t('run.report.exit', { code: result.exitCode })
  const output = result.output.length === 0 ? t('run.report.empty')
    : `${result.truncated ? `${t('run.report.truncated')}\n\n` : ''}${fence(result.output, 'text')}`
  return [t('run.report.intro'), fence(command, lang), status, output].join('\n\n')
}

/**
 * Create the runner for one Session. Runs outlive the fence component, so a result is reported after scrolling or switching Sessions.
 * @param deps - Session-bound operations.
 * @returns a stable runner for the Chat Markdown delegate.
 */
export function createCommandRunner(deps: CommandRunnerDeps): MarkdownCodeRunner {
  const runs = new Map<string, CommandRunStore>()
  const store = (command: string): CommandRunStore => {
    let entry = runs.get(command)
    if (entry === undefined) {
      const state = createSnapshotStore<CommandRunState>({ phase: 'idle' })
      entry = { state, subscribe: listener => state.subscribe(listener), getSnapshot: () => state.getSnapshot() }
      runs.set(command, entry)
    }
    return entry
  }
  const start = (command: string, lang: string): void => {
    // The shared state disables every matching Run action until this run settles.
    const { state } = store(command)
    state.set({ phase: 'starting' })
    void (async () => {
      let id: WebTerminalId | undefined
      try {
        const run = await deps.run(command, deps.signal)
        id = run.id
        state.set({ phase: 'running', id })
        deps.open(id)
        const result = await run.result
        state.set({ phase: 'done', id, result, reported: false })
        const failure = await deps.report(commandReport(command, lang, result, deps.t))
        if (failure !== null) throw new Error(failure)
        state.set({ phase: 'done', id, result, reported: true })
      } catch (error) {
        if (deps.signal.aborted) return
        state.set({ phase: 'failed', id, message: error instanceof Error ? error.message : String(error) })
      }
    })()
  }
  function CommandFence({ code, lang, renderBlock }: MarkdownCodeRunnerProps): ReactNode {
    const { subscribe, getSnapshot } = store(code)
    const run = useSyncExternalStore(subscribe, getSnapshot)
    const busy = run.phase === 'starting' || run.phase === 'running'
    const terminal = run.phase === 'idle' || run.phase === 'starting' ? undefined : run.id
    return renderBlock({
      actions: (
        <CodeToolbarAction
          label={run.phase === 'idle' ? deps.t('run.action') : deps.t('run.again')}
          icon={<IconPlayOutlineRegular size={14} />}
          disabled={busy}
          onClick={() => { start(code, lang) }}
        />
      ),
      footer: run.phase === 'idle' ? undefined : (
        <div className={css.footer} data-command-run={run.phase}>
          <span className={css.status} role="status">{statusText(run, deps.t)}</span>
          {terminal !== undefined && (
            <button type="button" className={css.link} onClick={() => { deps.open(terminal) }}>{deps.t('run.show')}</button>
          )}
        </div>
      ),
    })
  }
  return { accepts: lang => RUNNABLE_LANGUAGES.has(lang.toLowerCase()), Component: CommandFence }
}

function statusText(run: Exclude<CommandRunState, { phase: 'idle' }>, t: CommandRunnerDeps['t']): string {
  switch (run.phase) {
    case 'starting': return t('creating')
    case 'running': return t('run.running')
    case 'failed': return t('run.failed', { message: run.message })
    case 'done': {
      const exit = run.result.state === 'failed' ? t('failed', { message: run.result.error ?? '' })
        : run.result.exitCode === null ? t('run.stopped') : t('exited', { code: run.result.exitCode })
      return run.reported ? `${exit} · ${t('run.reported')}` : exit
    }
    /* v8 ignore next -- CommandRunState is a closed union. */
    default: return assertNever(run, 'command run phase')
  }
}
