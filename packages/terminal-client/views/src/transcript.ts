/**
 * The transcript: turns Session events into the lines a terminal prints. Output
 * is append-only. A reply streams as it arrives; when the durable message
 * lands, only what was not already streamed is printed.
 * @module @deepseek-ai/dsh-terminal-views/transcript
 */
import type { StreamChunk } from '@deepseek-ai/dsh-llm/types'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { ToolResultNode, StartedToolCall } from '@deepseek-ai/dsh-presentation-tool-call'
import { t } from './copy.ts'
import type { Style } from './ansi.ts'
import { changedSummaryLine, DeliverablesTracker, presentedLines } from './deliverables.ts'
import { stripAnsi } from './ansi.ts'
import { renderImage } from './images.ts'
import type { ImageFacts, ImageProtocol } from './images.ts'
import { sanitizeOutput, toolCallLine, toolResultLines, type ToolViewContext } from './tool-lines.ts'
import { isWorkflowEvent, WorkflowRunLines } from './workflow-run.ts'

/** Live Assistant output that has no durable event yet. */
export interface LiveChunkEvent {
  readonly type: 'assistant/live-chunk'
  readonly seq: number
  readonly time: number
  readonly data: {
    readonly turn: number
    readonly step: number
    readonly chunk: StreamChunk
  }
}

/** One thing the transcript renders. */
export type TranscriptEvent = SessionEvent | LiveChunkEvent

/** What the transcript needs from its surroundings. */
export interface TranscriptOptions {
  readonly style: Style
  readonly cwd?: string | undefined
  readonly home?: string | undefined
  /** Terminal width, read at each render so a resize applies. */
  readonly columns: () => number
  /** Most output lines shown for one tool result. */
  readonly maxOutputLines: number
  /** Inline images in user messages; without it, or with protocol `none`, an image shows as its marker. */
  readonly images?: {
    readonly protocol: ImageProtocol
    /** Base64 bytes of an attachment the caller already fetched, by attachment id. */
    readonly data: (attachmentId: string) => string | undefined
  } | undefined
}

/** The kind of text currently open on the last printed line. */
type OpenText = 'text' | 'reasoning' | undefined

/** Plain text of message content blocks, with markers for file attachments; images are drawn separately. */
function contentText(blocks: readonly { readonly type: string; readonly text?: string; readonly name?: string }[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    if (block.type === 'text' && block.text !== undefined) parts.push(block.text)
    else if (block.type === 'file') parts.push(t('tool.fileBlock', { name: block.name ?? '' }))
  }
  return parts.join('\n')
}

/** A string field of an event payload that this package does not declare, or undefined when absent or not a string. */
function textField(data: unknown, key: string): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const value: unknown = Reflect.get(data, key)
  return typeof value === 'string' ? value : undefined
}

/** Renders events to text, remembering what it already printed. */
export class TranscriptRenderer {
  readonly #options: TranscriptOptions
  readonly #calls = new Map<string, StartedToolCall>()
  /** Slash commands that started and have not settled, by command id, as the line the person typed. */
  readonly #commands = new Map<string, string>()
  readonly #deliverables = new DeliverablesTracker()
  readonly #workflows = new WorkflowRunLines()
  /** Steps whose reply was printed from live chunks, as `turn:step`. */
  readonly #streamed = new Set<string>()
  #open: OpenText
  /** Whether the last printed character ended a line. */
  #lineStart = true
  /** Whether anything has been printed, so the first block gets no blank line above. */
  #printed = false
  /** Call whose line was printed last, to indent its outcome under it. */
  #lastCall: string | undefined

  /** @param options - styling and terminal facts. */
  constructor(options: TranscriptOptions) {
    this.#options = options
  }

  /**
   * Render a window of earlier events, such as the history of a resumed session.
   * @param events - events in order.
   * @returns text to print.
   */
  history(events: readonly TranscriptEvent[]): string {
    return events.map(event => this.append(event)).join('') + this.#close()
  }

  /**
   * Render one live event.
   * @param event - the event that just arrived.
   * @returns text to print; empty when the event shows nothing.
   */
  append(event: TranscriptEvent): string {
    switch (event.type) {
      case 'assistant/live-chunk': return this.#chunk(event)
      case 'user/message': return this.#user(event)
      case 'assistant/message': return this.#assistant(event)
      case 'tool/call': return this.#call(event)
      case 'tool/result': return this.#result(event)
      case 'turn/end': return this.#turnEnd(event)
      default: return this.#other(event)
    }
  }

  /** Finish an open line, such as when a turn ends or an approval prompt interrupts a reply. */
  flush(): string {
    return this.#close()
  }

  #close(): string {
    if (this.#lineStart) return ''
    this.#open = undefined
    this.#lineStart = true
    return '\n'
  }

  /** Blank line between blocks, except before the first. */
  #gap(): string {
    const gap = this.#printed ? '\n' : ''
    this.#printed = true
    return gap
  }

  #user(event: SessionEvent<'user/message'>): string {
    const data = event.data
    if (data.source.kind !== 'user') return this.#notice(data)
    const text = contentText(data.content)
    const images = data.content.filter(block => block.type === 'image')
    if (text.trim() === '' && images.length === 0) return ''
    const { style } = this.#options
    const lines = sanitizeOutput(text).split('\n')
    this.#lastCall = undefined
    const head = text.trim() === '' ? '' : lines.map((line, index) => style.bold(index === 0 ? `› ${line}` : `  ${line}`)).join('\n') + '\n'
    return this.#close() + this.#gap() + head + images.map(block => this.#image(block.attachment)).join('')
  }

  /** One image of a user message: drawn when the bytes were fetched and the terminal can show them, otherwise its marker. */
  #image(attachment: Omit<ImageFacts, 'base64'> & { readonly attachmentId: string }): string {
    const { images, style } = this.#options
    const base64 = images?.data(attachment.attachmentId)
    if (images === undefined || base64 === undefined) return renderImage('none', style, this.#options.columns(), { ...attachment, base64: '' })
    return renderImage(images.protocol, style, this.#options.columns(), { ...attachment, base64 })
  }

  /** A synthetic user message with a one-line account, such as a goal continuation. */
  #notice(data: SessionEvent<'user/message'>['data']): string {
    const { source } = data
    const summary = 'form' in source && source.form === 'notice' && 'summary' in source ? source.summary : undefined
    if (typeof summary !== 'string') return ''
    this.#lastCall = undefined
    return this.#close() + this.#options.style.dim(`· ${sanitizeOutput(summary)}`) + '\n'
  }

  #chunk(event: LiveChunkEvent): string {
    const { chunk, turn, step } = event.data
    if (chunk.type !== 'text-delta' && chunk.type !== 'reasoning-delta') return ''
    if (chunk.text === '') return ''
    this.#streamed.add(`${String(turn)}:${String(step)}`)
    return this.#write(chunk.type === 'text-delta' ? 'text' : 'reasoning', chunk.text)
  }

  /** Print assistant text of one kind, opening a block when the kind changes. */
  #write(kind: 'text' | 'reasoning', text: string): string {
    const { style } = this.#options
    let out = ''
    if (this.#open !== kind) {
      out += this.#close() + this.#gap()
      this.#open = kind
      this.#lastCall = undefined
    }
    const clean = stripAnsi(text).replace(/\r/gu, '')
    out += kind === 'reasoning' ? style.dim(clean) : clean
    this.#lineStart = clean.endsWith('\n')
    return out
  }

  #assistant(event: SessionEvent<'assistant/message'>): string {
    const key = `${String(event.data.turn)}:${String(event.data.step)}`
    if (this.#streamed.delete(key)) return this.#close()
    let out = ''
    for (const block of event.data.message.content) {
      if (block.type === 'reasoning') out += this.#write('reasoning', block.text) + this.#close()
      else if (block.type === 'text' && block.text.trim() !== '') out += this.#write('text', block.text) + this.#close()
    }
    return out
  }

  #context(): ToolViewContext {
    return {
      style: this.#options.style,
      cwd: this.#options.cwd,
      home: this.#options.home,
      columns: this.#options.columns(),
      maxOutputLines: this.#options.maxOutputLines,
    }
  }

  #call(event: SessionEvent<'tool/call'>): string {
    this.#deliverables.observe(event)
    const { callId, name, arguments: argsRaw, turn, step } = event.data
    const block: StartedToolCall = {
      phase: 'start', callId, name, turn, step, time: event.time, argsRaw, subCalls: [],
    }
    this.#calls.set(callId, block)
    this.#lastCall = callId
    return this.#close() + toolCallLine(this.#context(), block) + '\n'
  }

  #result(event: SessionEvent<'tool/result'>): string {
    this.#deliverables.observe(event)
    const { message, error, meta } = event.data
    const callId = message.toolCallId
    const call = this.#calls.get(callId)
    this.#calls.delete(callId)
    const node: ToolResultNode = {
      kind: 'tool-result',
      seq: event.seq,
      time: event.time,
      callId,
      call: call === undefined ? null : { name: call.name, argsRaw: call.argsRaw },
      callTime: call?.time ?? null,
      content: message.content,
      isError: message.isError === true,
      ...error === undefined ? {} : { error },
      ...meta === undefined ? {} : { meta },
      subCalls: [],
    }
    const lines = toolResultLines(this.#context(), node)
    if (lines.length === 0) return ''
    const adjacent = this.#lastCall === callId
    this.#lastCall = undefined
    const head = adjacent || call === undefined ? '' : toolCallLine(this.#context(), {
      phase: 'start', callId, name: call.name, turn: call.turn, step: call.step, time: call.time, argsRaw: call.argsRaw, subCalls: [],
    }) + '\n'
    return this.#close() + head + lines.join('\n') + '\n'
  }

  /** Events with their own lines: workflow runs, presented files and slash commands. Any other event shows nothing. */
  #other(event: TranscriptEvent): string {
    const record: { readonly type: string; readonly data?: unknown } = event
    const { style } = this.#options
    if (isWorkflowEvent(record.type)) {
      const lines = this.#workflows.lines(style, record.type, record.data)
      this.#lastCall = undefined
      return lines.length === 0 ? '' : this.#close() + (record.type === 'tool-workflow/run-start' ? this.#gap() : '') + lines.join('\n') + '\n'
    }
    const presented = this.#deliverables.observe(event)
    if (presented.length > 0) {
      this.#lastCall = undefined
      return this.#close() + presentedLines(style, presented).join('\n') + '\n'
    }
    return this.#command(event)
  }

  /**
   * A slash command's lifecycle events, declared by `dsh-commands`: the start is remembered and the outcome printed
   * under the command line. Any other event shows nothing.
   */
  #command(event: TranscriptEvent): string {
    const record: { readonly type: string; readonly data?: unknown } = event
    const commandId = textField(record.data, 'commandId')
    if (commandId === undefined) return ''
    if (record.type === 'command/run') {
      const name = textField(record.data, 'name') ?? ''
      this.#commands.set(commandId, `/${name}${textField(record.data, 'args') ?? ''}`.trimEnd())
      return ''
    }
    if (record.type !== 'command/done') return ''
    const line = this.#commands.get(commandId) ?? t('command.unnamed')
    this.#commands.delete(commandId)
    const { style } = this.#options
    const failed = textField(record.data, 'kind') === 'error'
    const text = sanitizeOutput(textField(record.data, 'text') ?? '').trimEnd()
    const head = style.dim(sanitizeOutput(line))
    const body = text === ''
      ? (failed ? style.red(t('command.failed')) : style.dim(t('command.done')))
      : text.split('\n').map(row => (failed ? style.red(`  ${row}`) : `  ${row}`)).join('\n')
    this.#lastCall = undefined
    return `${this.#close()}${this.#gap()}${head}\n${body}\n`
  }

  #turnEnd(event: SessionEvent<'turn/end'>): string {
    const { style } = this.#options
    this.#lastCall = undefined
    const changed = this.#deliverables.turn(event.data.turn)?.produced.length ?? 0
    return this.#close() + this.#reason(event.data.reason) + (changed === 0 ? '' : changedSummaryLine(style, changed) + '\n')
  }

  /** The line that says why a turn ended, when it did not complete. */
  #reason(reason: SessionEvent<'turn/end'>['data']['reason']): string {
    const { style } = this.#options
    switch (reason.kind) {
      case 'aborted': return style.dim(t('turn.interrupted')) + '\n'
      case 'blocked': return style.yellow(t('turn.blocked')) + '\n'
      case 'max-tokens': return style.yellow(t('turn.maxTokens')) + '\n'
      case 'error': return style.red(t('turn.error', { message: sanitizeOutput(reason.error.message) })) + '\n'
      default: return ''
    }
  }
}
