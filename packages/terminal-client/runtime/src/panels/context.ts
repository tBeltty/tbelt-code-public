/**
 * What a panel reads and does: the Remote namespaces, the client services and
 * a narrow view of the session on screen. Panels never touch the terminal;
 * they ask and tell through {@link FlowUi}, so tests drive them with a script.
 * @module @deepseek-ai/dsh-terminal-client/panels/context
 */
import type { SessionChoice, Style, TranscriptEvent } from '@deepseek-ai/dsh-terminal-views'
import type { TerminalFiles } from '../files.ts'
import type { ClientServicesPort, RemotePort, SessionFacePort } from '../ports.ts'

/** Where the person asked to go next. */
export type SwitchTarget =
  | { readonly kind: 'resume'; readonly sessionId: string }
  | { readonly kind: 'new'; readonly cwd: string }

/** The client services panels call besides the Remote namespaces. */
export type PanelServices = Pick<ClientServicesPort, 'jobs' | 'workspaces' | 'fileUpload'>

/** The session on screen, as a panel sees it. */
export interface PanelSession {
  readonly sessionId: string
  /** The session's working directory. */
  readonly cwd: string
  /** Account home directory, for `~/…` paths. */
  readonly home: string | undefined
  /** Whether a turn is running. */
  running(): boolean
  /** The events of the loaded history window, oldest first. */
  events(): readonly TranscriptEvent[]
  /** The current value of a projection the Host computes from the session log. */
  projection(key: string): unknown
  readonly prompt: SessionFacePort['prompt']
  readonly updateQueue: SessionFacePort['updateQueue']
  /** Put text into the composer at the cursor, so the person can finish the message. */
  insertText(text: string): void
}

/** Everything a panel may use. */
export interface PanelContext {
  readonly remote: RemotePort
  readonly services: PanelServices
  readonly session: PanelSession
  readonly files: TerminalFiles
  /** Text styles for lines a panel builds itself. */
  readonly style: Style
  /** Clock reading in epoch milliseconds. */
  readonly now: () => number
  /** IANA time zone of the person, for times of day. */
  readonly timeZone: string
  /** The session list at this moment. */
  readonly sessions: () => readonly SessionChoice[]
  /** Leave the session on screen for another one. */
  readonly leave: (target: SwitchTarget) => void
}
