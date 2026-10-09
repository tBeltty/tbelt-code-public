/**
 * Trajectory: the turns of a session with their timing, and the ledger of
 * events inside one turn.
 * @module @deepseek-ai/dsh-terminal-views/trajectory
 */
import { t } from './copy.ts'
import type { Style } from './ansi.ts'
import type { PickerItem } from './picker.ts'
import { durationText, numberField, oneLine, recordOf, stringField } from './lines.ts'
import type { TranscriptEvent } from './transcript.ts'

/** One started turn with the previews the Host keeps. */
export interface TurnOutlineRow {
  readonly turn: number
  readonly prompt: string
  readonly response: string
}

/** Whole-log figures of the session. */
export interface SessionStatsRow {
  readonly turns: number
  readonly steps: number
  readonly llmMs: number
  readonly toolMs: number
}

/**
 * The started turns.
 * @param outline - the `turnOutline` projection value, which is wire data.
 * @returns one row per entry that has a turn number, in order.
 */
export function outlineRows(outline: unknown): TurnOutlineRow[] {
  if (!Array.isArray(outline)) return []
  const rows: TurnOutlineRow[] = []
  for (const entry of outline as unknown[]) {
    const turn = numberField(entry, 'turn')
    if (turn === undefined) continue
    rows.push({ turn, prompt: stringField(entry, 'prompt') ?? '', response: stringField(entry, 'response') ?? '' })
  }
  return rows
}

/**
 * The whole-log figures.
 * @param stats - the `sessionStats` projection value, which is wire data.
 * @returns the figures, or undefined when the Host reports none.
 */
export function statsRow(stats: unknown): SessionStatsRow | undefined {
  const turns = numberField(stats, 'turns')
  const steps = numberField(stats, 'steps')
  const llmMs = numberField(stats, 'llmMs')
  const toolMs = numberField(stats, 'toolMs')
  return turns === undefined || steps === undefined || llmMs === undefined || toolMs === undefined
    ? undefined
    : { turns, steps, llmMs, toolMs }
}

/** The data of an event whose type this package does not declare. */
function dataOf(event: TranscriptEvent): { readonly type: string; readonly data: unknown } {
  const record: { readonly type: string; readonly data?: unknown } = event
  return { type: record.type, data: record.data }
}

/**
 * Split events into turns.
 * @param events - session events in order.
 * @returns the events from each `turn/start` up to the next one, by turn number; events before the first start are dropped.
 */
export function turnSlices(events: readonly TranscriptEvent[]): Map<number, TranscriptEvent[]> {
  const slices = new Map<number, TranscriptEvent[]>()
  let current: TranscriptEvent[] | undefined
  for (const event of events) {
    const { type, data } = dataOf(event)
    const turn = type === 'turn/start' ? numberField(data, 'turn') : undefined
    if (turn !== undefined) {
      current = slices.get(turn) ?? []
      slices.set(turn, current)
    }
    current?.push(event)
  }
  return slices
}

/** How long the loaded events of a turn span. */
function span(events: readonly TranscriptEvent[]): number {
  const first = events[0]
  const last = events.at(-1)
  return first === undefined || last === undefined ? 0 : last.time - first.time
}

/**
 * The figures above the turn list.
 * @param style - text styles.
 * @param stats - the whole-log figures.
 * @returns lines to print.
 */
export function trajectoryHeader(style: Style, stats: SessionStatsRow): string[] {
  return [style.dim(t('trajectory.totals', {
    turns: stats.turns, steps: stats.steps, model: durationText(stats.llmMs), tools: durationText(stats.toolMs),
  }))]
}

/**
 * Rows of the turn list.
 * @param rows - the started turns.
 * @param slices - the loaded events of each turn.
 * @returns one item per turn, newest first, with the time its loaded events span as detail.
 */
export function trajectoryItems(rows: readonly TurnOutlineRow[], slices: ReadonlyMap<number, readonly TranscriptEvent[]>): PickerItem[] {
  return [...rows].reverse().map((row) => {
    const events = slices.get(row.turn)
    return {
      value: String(row.turn),
      label: `${String(row.turn)}. ${row.prompt === '' ? t('trajectory.noPrompt') : oneLine(row.prompt, 60)}`,
      detail: events === undefined ? t('trajectory.notLoaded') : durationText(span(events)),
    }
  })
}

/** The text blocks of a message, joined. */
function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return (content as unknown[]).map(block => stringField(block, 'text') ?? '').join(' ')
}

/**
 * The events of one turn in order, with the time since the turn began.
 * @param style - text styles.
 * @param events - the loaded events of the turn.
 * @returns lines to print, one per event that shows something.
 */
export function ledgerLines(style: Style, events: readonly TranscriptEvent[]): string[] {
  const start = events[0]?.time ?? 0
  const names = new Map<string, string>()
  const lines: string[] = []
  for (const event of events) {
    const { type, data } = dataOf(event)
    const offset = `+${((event.time - start) / 1000).toFixed(1)}s`.padStart(8)
    let what: string | undefined
    if (type === 'user/message') what = t('trajectory.user', { text: oneLine(textOf(recordOf(data)?.['content']), 60) })
    else if (type === 'assistant/message') what = t('trajectory.assistant', { text: oneLine(textOf(recordOf(recordOf(data)?.['message'])?.['content']), 60) })
    else if (type === 'tool/call') {
      const name = stringField(data, 'name') ?? ''
      names.set(stringField(data, 'callId') ?? '', name)
      what = t('trajectory.call', { name })
    } else if (type === 'tool/result') {
      const message = recordOf(recordOf(data)?.['message'])
      const failed = message?.['isError'] === true
      what = t(failed ? 'trajectory.resultFailed' : 'trajectory.result', { name: names.get(stringField(message, 'toolCallId') ?? '') ?? '' })
    } else if (type === 'turn/end') {
      what = t('trajectory.end', { reason: stringField(recordOf(recordOf(data)?.['reason']), 'kind') ?? '' })
    }
    if (what !== undefined) lines.push(`${style.dim(offset)}  ${what}`)
  }
  return lines
}

/** Marker value of the fork point at the end of the conversation. */
export const FORK_END = 'end'

/**
 * Rows of the fork list: the end of the conversation, then each finished turn that is loaded.
 * @param events - session events in order.
 * @returns the end first, then turns newest first; the value of a turn is the sequence number of its `turn/end` event.
 */
export function forkItems(events: readonly TranscriptEvent[]): PickerItem[] {
  const turns: PickerItem[] = []
  for (const [turn, slice] of turnSlices(events)) {
    const end = slice.find(event => event.type === 'turn/end')
    if (end === undefined || !('seq' in end)) continue
    const first = slice.find(event => event.type === 'user/message')
    const prompt = first === undefined ? '' : textOf(recordOf(dataOf(first).data)?.['content'])
    turns.push({ value: String(end.seq), label: t('fork.turn', { turn, text: oneLine(prompt, 60) }) })
  }
  return [{ value: FORK_END, label: t('fork.now') }, ...turns.reverse()]
}
