/**
 * Deliverables: the files a turn changed and the files the agent presented.
 * Changed files come from the arguments of write and edit calls that
 * succeeded, presented files from `deliverables/presented` events.
 * @module @deepseek-ai/dsh-terminal-views/deliverables
 */
import { t } from './copy.ts'
import type { Style } from './ansi.ts'
import { oneLine, recordOf, stringField } from './lines.ts'
import type { TranscriptEvent } from './transcript.ts'

/** A file the agent presented. */
export interface PresentedPath {
  readonly path: string
  readonly description: string | undefined
}

/** What one turn produced. */
export interface TurnDeliverables {
  readonly turn: number
  /** Paths written or edited, once each, in the order first touched. */
  readonly produced: readonly string[]
  readonly presented: readonly PresentedPath[]
}

/** A non-blank string, or undefined. */
function pathValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** The path an editor command changes, or undefined for a command that does not change a file. */
function editorPath(args: Record<string, unknown>): string | undefined {
  const path = pathValue(args['path'])
  if (path === undefined) return undefined
  switch (args['command']) {
    case 'create': return typeof args['file_text'] === 'string' ? path : undefined
    case 'str_replace': return typeof args['old_str'] === 'string' && args['old_str'] !== '' ? path : undefined
    case 'insert': return Number.isInteger(args['insert_line']) && typeof args['new_str'] === 'string' ? path : undefined
    default: return undefined
  }
}

/**
 * The path a first-party mutation call changes.
 * @param name - the tool name.
 * @param argsRaw - the model's JSON arguments.
 * @returns the path, or undefined when the call is not a complete write, edit or editor change.
 */
export function mutationPath(name: string, argsRaw: string): string | undefined {
  let args: unknown
  try {
    args = JSON.parse(argsRaw)
  } catch {
    // Arguments that are not JSON cannot name a file.
    return undefined
  }
  const fields = recordOf(args)
  if (fields === undefined) return undefined
  switch (name) {
    case 'write': return typeof fields['content'] === 'string' ? pathValue(fields['file_path']) : undefined
    case 'edit': return typeof fields['old_string'] === 'string' && fields['old_string'] !== '' && typeof fields['new_string'] === 'string'
      && fields['old_string'] !== fields['new_string'] ? pathValue(fields['file_path']) : undefined
    case 'str_replace_editor': return editorPath(fields)
    default: return undefined
  }
}

/** Collects the deliverables of every turn from the events it is shown. */
export class DeliverablesTracker {
  /** Mutation calls waiting for their result, by call id. */
  readonly #calls = new Map<string, { readonly turn: number; readonly path: string }>()
  readonly #produced = new Map<number, string[]>()
  readonly #presented = new Map<number, PresentedPath[]>()

  /**
   * Take one event into account.
   * @param event - the next event of the session, in order.
   * @returns the files a `deliverables/presented` event declared, so a caller can print them as they arrive; empty for any other event.
   */
  observe(event: TranscriptEvent): readonly PresentedPath[] {
    if (event.type === 'tool/call') {
      const path = mutationPath(event.data.name, event.data.arguments)
      if (path !== undefined) this.#calls.set(event.data.callId, { turn: event.data.turn, path })
    } else if (event.type === 'tool/result') {
      const call = this.#calls.get(event.data.message.toolCallId)
      this.#calls.delete(event.data.message.toolCallId)
      if (call !== undefined && event.data.message.isError !== true) this.#addProduced(call.turn, call.path)
    } else {
      return this.#presentedBy(event)
    }
    return []
  }

  #addProduced(turn: number, path: string): void {
    const paths = this.#produced.get(turn) ?? []
    if (!paths.includes(path)) paths.push(path)
    this.#produced.set(turn, paths)
  }

  #presentedBy(event: TranscriptEvent): readonly PresentedPath[] {
    const record: { readonly type: string; readonly data?: unknown } = event
    if (record.type !== 'deliverables/presented') return []
    const turn = recordOf(record.data)?.['turn']
    const files: unknown = recordOf(record.data)?.['files']
    if (typeof turn !== 'number' || !Array.isArray(files)) return []
    const declared: PresentedPath[] = []
    for (const file of files as unknown[]) {
      const path = pathValue(recordOf(file)?.['path'])
      if (path !== undefined) declared.push({ path, description: stringField(file, 'description') })
    }
    if (declared.length > 0) this.#presented.set(turn, [...this.#presented.get(turn) ?? [], ...declared])
    return declared
  }

  /**
   * What one turn produced.
   * @param turn - the turn number.
   * @returns its deliverables, or undefined when it produced and presented nothing.
   */
  turn(turn: number): TurnDeliverables | undefined {
    const produced = this.#produced.get(turn) ?? []
    const presented = this.#presented.get(turn) ?? []
    return produced.length === 0 && presented.length === 0 ? undefined : { turn, produced, presented }
  }

  /**
   * Every turn that produced or presented something.
   * @returns the deliverables, oldest turn first.
   */
  turns(): TurnDeliverables[] {
    const numbers = [...new Set([...this.#produced.keys(), ...this.#presented.keys()])].sort((a, b) => a - b)
    return numbers.map(turn => ({ turn, produced: this.#produced.get(turn) ?? [], presented: this.#presented.get(turn) ?? [] }))
  }
}

/**
 * The deliverables of every turn in a list of events.
 * @param events - session events in order.
 * @returns the turns that produced or presented files, oldest first.
 */
export function turnDeliverables(events: readonly TranscriptEvent[]): TurnDeliverables[] {
  const tracker = new DeliverablesTracker()
  for (const event of events) tracker.observe(event)
  return tracker.turns()
}

/**
 * The line printed when a turn ends after changing files.
 * @param style - text styles.
 * @param count - how many files the turn changed.
 * @returns one line.
 */
export function changedSummaryLine(style: Style, count: number): string {
  return style.dim(t('deliverables.summary', { count }))
}

/**
 * The files a turn presented, as printed when the event arrives.
 * @param style - text styles.
 * @param files - the declared files.
 * @returns one line per file.
 */
export function presentedLines(style: Style, files: readonly PresentedPath[]): string[] {
  return files.map(file => `${style.green(t('deliverables.presented'))} ${file.path}${file.description === undefined ? '' : style.dim(` — ${oneLine(file.description, 60)}`)}`)
}

/**
 * One turn's deliverables in full.
 * @param style - text styles.
 * @param deliverables - what the turn produced.
 * @returns lines to print.
 */
export function deliverableLines(style: Style, deliverables: TurnDeliverables): string[] {
  return [
    style.bold(t('deliverables.turn', { turn: deliverables.turn })),
    ...deliverables.produced.length === 0 ? [] : [
      style.dim(t('deliverables.changed', { count: deliverables.produced.length })),
      ...deliverables.produced.map(path => `  ${path}`),
    ],
    ...deliverables.presented.length === 0 ? [] : [
      style.dim(t('deliverables.delivered', { count: deliverables.presented.length })),
      ...presentedLines(style, deliverables.presented).map(line => `  ${line}`),
    ],
  ]
}
