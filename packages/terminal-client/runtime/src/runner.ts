/**
 * The terminal runner: chooses the session to show, wires standard input to a
 * {@link TerminalSession}, and puts the terminal back as it found it when the
 * person leaves. All process access arrives as {@link RunnerEnvironment}, so
 * tests drive the runner with in-memory streams.
 * @module @deepseek-ai/dsh-terminal-client/runner
 */
import {
  BRACKETED_PASTE_OFF, BRACKETED_PASTE_ON, chooseSession, createStyle, t,
} from '@deepseek-ai/dsh-terminal-views'
import type { ImageProtocol, OpenCandidate } from '@deepseek-ai/dsh-terminal-views'
import type { TerminalFiles } from './files.ts'
import type { HostTitleSettings } from './host-title.ts'
import type { ClientServicesPort, SessionBindingPort, SessionListPort } from './ports.ts'
import { listenForApprovals, TerminalSession } from './terminal-session.ts'
import type { SwitchTarget } from './terminal-session.ts'

/** Standard input as the runner uses it. */
export interface RunnerInput {
  readonly isTTY?: boolean | undefined
  setRawMode?(enabled: boolean): unknown
  setEncoding(encoding: 'utf8'): unknown
  resume(): unknown
  pause(): unknown
  on(event: 'data', listener: (chunk: string) => void): unknown
  off(event: 'data', listener: (chunk: string) => void): unknown
}

/** Standard output as the runner uses it. */
export interface RunnerOutput {
  readonly isTTY?: boolean | undefined
  readonly columns?: number | undefined
  write(chunk: string): unknown
  on(event: 'resize', listener: () => void): unknown
  off(event: 'resize', listener: () => void): unknown
}

/** Process facts and effects the runner depends on. */
export interface RunnerEnvironment {
  readonly stdin: RunnerInput
  readonly stdout: RunnerOutput
  readonly cwd: string
  readonly home?: string | undefined
  /** Whether colors may be used. */
  readonly color: boolean
  /** Request process exit once the terminal is restored. */
  readonly exit: (code: number) => void
  readonly files: TerminalFiles
  /** How images are drawn in this terminal. */
  readonly imageProtocol: ImageProtocol
  /** Clock reading in epoch milliseconds. */
  readonly now: () => number
  /** How the window title follows the session; the title is left alone when absent. */
  readonly hostTitle?: HostTitleSettings | undefined
}

/** What the command line asked for. */
export interface RunnerRequest {
  readonly resume?: string | undefined
  readonly continueLatest: boolean
}

/** A running terminal conversation. */
export interface TerminalRun {
  /** Restore the terminal and stop following the session; safe to call twice. */
  stop(): void
}

/** Default width when standard output reports none. */
const FALLBACK_COLUMNS = 80

/** Wait for the first session list pull. */
function listReady(services: ClientServicesPort): Promise<SessionListPort> {
  const { list } = services.sessions
  return new Promise((resolve) => {
    const check = (): boolean => {
      const snapshot = list.getSnapshot()
      if (snapshot.phase !== 'ready') return false
      resolve(snapshot)
      return true
    }
    if (check()) return
    const stop = list.subscribe(() => { if (check()) stop() })
  })
}

/** Catalog rows in the shape {@link chooseSession} reads. */
function candidates(list: SessionListPort): OpenCandidate[] {
  return Object.values(list.byId)
}

/** Wait until the retained session is open. */
async function openSession(services: ClientServicesPort, target: string): Promise<{ binding: SessionBindingPort; release: () => void }> {
  const reference = services.sessions.retain(target, { source: 'terminal' })
  try {
    return { binding: await reference.ready, release: () => { reference.release() } }
  } catch (error) {
    reference.release()
    throw error
  }
}

/** A session to show: where it lives and whether it already existed. */
type Opening =
  | { readonly kind: 'resume'; readonly sessionId: string; readonly cwd: string }
  | { readonly kind: 'new'; readonly cwd: string }

/** The session on screen and what releases it. */
interface Mounted {
  readonly terminal: TerminalSession
  readonly stopApprovals: () => void
  readonly release: () => void
}

/**
 * Show sessions in the terminal until the person leaves. The person can move to
 * another stored session or start a new one without leaving the process.
 * @param services - the client services of the connected tree.
 * @param env - process streams, working directory and exit hook.
 * @param request - which session the command line asked for.
 * @returns a handle whose `stop` restores the terminal.
 * @throws when standard input or output is not a terminal, or the requested session cannot be opened; nothing has been written then.
 */
export async function runTerminal(
  services: ClientServicesPort,
  env: RunnerEnvironment,
  request: RunnerRequest,
): Promise<TerminalRun> {
  const { stdin, stdout } = env
  if (stdin.isTTY !== true || stdout.isTTY !== true || stdin.setRawMode === undefined) {
    throw new Error(t('error.notTty'))
  }
  const setRawMode = stdin.setRawMode.bind(stdin)
  const list = await listReady(services)
  const choice = chooseSession(
    { resume: request.resume, continueLatest: request.continueLatest, cwd: env.cwd },
    candidates(list),
  )
  if (choice.kind === 'error') throw new Error(choice.message)

  let mounted: Mounted | undefined
  let stopped = false
  const style = createStyle(env.color)

  const unmount = (): void => {
    const current = mounted
    mounted = undefined
    if (current === undefined) return
    current.stopApprovals()
    current.terminal.dispose()
    current.release()
  }
  const stop = (): void => {
    if (stopped) return
    stopped = true
    unmount()
    stdin.off('data', onData)
    stdout.off('resize', onResize)
    stdout.write(BRACKETED_PASTE_OFF)
    setRawMode(false)
    stdin.pause()
  }
  const leave = (code: number): void => {
    stop()
    env.exit(code)
  }

  const mount = async (opening: Opening): Promise<TerminalSession | undefined> => {
    const target = opening.kind === 'resume' ? opening.sessionId : await services.sessions.create({ cwd: opening.cwd })
    const { binding, release } = await openSession(services, target)
    if (stopped) {
      release()
      return undefined
    }
    const terminal: TerminalSession = new TerminalSession({
      binding,
      io: { write: chunk => stdout.write(chunk), columns: () => stdout.columns ?? FALLBACK_COLUMNS },
      style,
      cwd: opening.cwd,
      home: env.home,
      resumed: opening.kind === 'resume',
      deps: {
        sessions: () => Object.values(services.sessions.list.getSnapshot().byId),
        remote: services.remote.session,
        client: services.remote,
        files: env.files,
        imageProtocol: env.imageProtocol,
        now: env.now,
      },
      hostTitle: env.hostTitle,
      onExit: leave,
      onSwitch: (next) => { void switchTo(next, { kind: 'resume', sessionId: binding.sessionId, cwd: opening.cwd }) },
    })
    const stopApprovals = listenForApprovals(services, binding.sessionId, () => terminal)
    mounted = { terminal, stopApprovals, release }
    return terminal
  }

  /** Leave the session on screen for another one; if that fails, go back to `previous` and say why. */
  const switchTo = async (next: SwitchTarget, previous: Opening): Promise<void> => {
    unmount()
    const opening: Opening = next.kind === 'new'
      ? next
      : { kind: 'resume', sessionId: next.sessionId, cwd: services.sessions.list.getSnapshot().byId[next.sessionId]?.cwd ?? env.cwd }
    try {
      const terminal = await mount(opening)
      terminal?.start()
    } catch (error) {
      stdout.write(`${style.red(t('switch.failed', { message: error instanceof Error ? error.message : String(error) }))}\n`)
      try {
        const back = await mount(previous)
        back?.start()
      } catch (again) {
        stdout.write(`${style.red(t('error.connection', { message: again instanceof Error ? again.message : String(again) }))}\n`)
        leave(1)
      }
    }
  }

  const onData = (chunk: string): void => {
    if (mounted !== undefined) mounted.terminal.handleInput(chunk)
    else if (chunk.includes('\u0003')) leave(0)
  }
  const onResize = (): void => { mounted?.terminal.resize() }

  const first: Opening = choice.kind === 'resume'
    ? { kind: 'resume', sessionId: choice.sessionId, cwd: list.byId[choice.sessionId]?.cwd ?? env.cwd }
    : { kind: 'new', cwd: env.cwd }
  const firstTerminal = await mount(first)

  setRawMode(true)
  stdin.setEncoding('utf8')
  stdin.on('data', onData)
  stdout.on('resize', onResize)
  stdin.resume()
  stdout.write(BRACKETED_PASTE_ON)
  firstTerminal?.start()
  return { stop }
}
