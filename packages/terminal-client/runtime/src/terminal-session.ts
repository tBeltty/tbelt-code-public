/**
 * One terminal conversation: reads keys, draws the composer and the transcript,
 * sends prompts, cancels turns and answers permission requests for a single
 * retained session. It touches the terminal only through {@link TerminalIo}, so
 * the contract and unit tests drive it with plain strings.
 * @module @deepseek-ai/dsh-terminal-client/terminal-session
 */
import { basename } from 'node:path'
import { ApprovalGrants, approvalModel, approvalOutcome } from '@deepseek-ai/dsh-presentation-approval'
import type { ApprovalChoice, ApprovalModel } from '@deepseek-ai/dsh-presentation-approval'
import {
  EMPTY_COMPOSER, Screen, TranscriptRenderer, approvalKeyChoice, approvalPromptLines, bannerLines, classifyInput,
  createMultiPicker, createPicker, createPrompt, decodeKeys, farewellLine, helpLines, modelItems, parseModelValue, reduceComposer,
  reducePicker, reducePrompt, renderComposer, renderPicker, renderPrompt, resolveTypedPath, sessionItems, t, workingLine,
} from '@deepseek-ai/dsh-terminal-views'
import type {
  ComposerFrame, ComposerState, ImageProtocol, Key, PickerItem, PickerState, PromptOptions, PromptState, SessionChoice, Style,
} from '@deepseek-ai/dsh-terminal-views'
import { runConfigScreen } from './config/index.ts'
import type { ConfigScreen, FlowUi } from './config/index.ts'
import type { TerminalFiles } from './files.ts'
import { HostTitle } from './host-title.ts'
import type { HostTitleSettings } from './host-title.ts'
import type {
  ApprovalOutcomePort, ApprovalRequestPort, EventWindowPort, PromptPartPort, RemotePort, RemoteResultPort, SessionBindingPort,
  SessionFacePort, SessionRemotePort, SessionsPort,
} from './ports.ts'

/** Most lines shown under one tool call. */
const MAX_OUTPUT_LINES = 12

/** A failed Remote result for a call that threw, so callers handle one shape. */
function failure(error: unknown): { readonly ok: false; readonly error: { readonly code: string; readonly message: string } } {
  return { ok: false, error: { code: 'terminal/call-failed', message: error instanceof Error ? error.message : String(error) } }
}

/** The terminal as the session sees it. */
export interface TerminalIo {
  /** Write to standard output. */
  write(chunk: string): unknown
  /** Current width in cells. */
  columns(): number
}

/** Where the person asked to go next. */
export type SwitchTarget =
  | { readonly kind: 'resume'; readonly sessionId: string }
  | { readonly kind: 'new'; readonly cwd: string }

/** What a session reads from outside itself. */
export interface TerminalDeps {
  /** The session list at this moment. */
  readonly sessions: () => readonly SessionChoice[]
  /** The `session` Remote namespace: model catalog and model selection. */
  readonly remote: SessionRemotePort
  /** Every Remote namespace the configuration screens call. */
  readonly client: RemotePort
  readonly files: TerminalFiles
  /** How images are drawn in this terminal. */
  readonly imageProtocol: ImageProtocol
  /** Clock reading in epoch milliseconds. */
  readonly now: () => number
}

/** Inputs of one {@link TerminalSession}. */
export interface TerminalSessionOptions {
  readonly binding: SessionBindingPort
  readonly io: TerminalIo
  readonly style: Style
  /** Session working directory, for relative paths in tool lines. */
  readonly cwd: string
  /** Account home directory. */
  readonly home?: string | undefined
  /** Whether an earlier session was reopened. */
  readonly resumed: boolean
  readonly deps: TerminalDeps
  /** Called once when the person leaves; the runner restores the terminal and exits. */
  readonly onExit: (code: number) => void
  /** Called once instead of {@link onExit} when the person opens another session; this session is already disposed. */
  readonly onSwitch: (target: SwitchTarget) => void
  /** How the window title follows the session; the title is left alone when absent. */
  readonly hostTitle?: HostTitleSettings | undefined
}

/** A picker in place of the composer, and what choosing an item does. */
type OpenPicker = {
  state: PickerState
  /** Called when the person leaves the list without choosing. */
  readonly cancel?: (() => void) | undefined
} & (
  | { readonly choose: (item: PickerItem) => void }
  /** Called with the ticked values when a multiple choice is confirmed. */
  | { readonly confirm: (values: readonly string[]) => void }
)

/** A question waiting for a typed answer. */
interface OpenPrompt {
  state: PromptState
  readonly settle: (answer: string | undefined) => void
}

/** A permission request waiting for the person. */
interface PendingApproval {
  readonly model: ApprovalModel
  readonly settle: (choice: ApprovalChoice) => void
}

/** Drives one session in the terminal. */
export class TerminalSession {
  readonly #options: TerminalSessionOptions
  readonly #screen: Screen
  readonly #title: HostTitle | undefined
  readonly #renderer: TranscriptRenderer
  readonly #session: SessionFacePort
  readonly #grants = new ApprovalGrants()
  readonly #approvals: PendingApproval[] = []
  readonly #unsubscribe: (() => void)[] = []
  /** Base64 bytes of stored images already fetched, by attachment id; the renderer draws from it. */
  readonly #images = new Map<string, string>()
  /** Images the person attached to the next message. */
  #attached: PromptPartPort[] = []
  #picker: OpenPicker | undefined
  #prompt: OpenPrompt | undefined
  /** Whether a configuration screen is running; only one runs at a time. */
  #flowOpen = false
  /** Work that must print after earlier work, such as events waiting for their images. */
  #chain: Promise<void> = Promise.resolve()
  #queued = 0
  #selectedModel: { readonly provider: string; readonly model: string } | undefined
  #composer: ComposerState = EMPTY_COMPOSER
  #running = false
  #cancelling = false
  #closed = false
  #lastRevision = -1

  /** @param options - the session, the terminal and the exit hook. */
  constructor(options: TerminalSessionOptions) {
    this.#options = options
    this.#session = options.binding.session
    this.#screen = new Screen(options.io)
    this.#title = options.hostTitle === undefined ? undefined : new HostTitle(chunk => options.io.write(chunk), options.hostTitle)
    this.#renderer = new TranscriptRenderer({
      style: options.style,
      cwd: options.cwd,
      home: options.home,
      columns: () => options.io.columns(),
      maxOutputLines: MAX_OUTPUT_LINES,
      images: options.deps.imageProtocol === 'none'
        ? undefined
        : { protocol: options.deps.imageProtocol, data: id => this.#images.get(id) },
    })
  }

  /** Print the banner and history, start following the session, and show the composer. */
  start(): void {
    const { binding, style, cwd, home, resumed } = this.#options
    this.#screen.print(`${bannerLines(style, { sessionId: binding.sessionId, cwd, home, resumed }).join('\n')}\n`)
    const events = binding.eventSource
    this.#follow(events.getSnapshot())
    this.#unsubscribe.push(events.subscribe(() => { this.#follow(events.getSnapshot()) }))
    this.#running = this.#session.getSnapshot().running
    this.#unsubscribe.push(this.#session.subscribe(() => { this.#sync() }))
    this.#render()
  }

  /**
   * Handle bytes read from the terminal.
   * @param data - one read of raw-mode input.
   */
  handleInput(data: string): void {
    if (this.#closed) return
    for (const key of decodeKeys(data)) {
      if (this.#approvals.length > 0) this.#answerApproval(key)
      else if (this.#prompt !== undefined) this.#answer(this.#prompt, key)
      else if (this.#picker !== undefined) this.#choose(this.#picker, key)
      else this.#edit(key)
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- a key handler above can close the session.
      if (this.#closed) return
    }
    this.#render()
  }

  /** Redraw after the terminal was resized. */
  resize(): void {
    if (!this.#closed) this.#render()
  }

  /**
   * Ask the person whether the agent may proceed. Called from the Host's approval waterfall.
   * @param request - the forwarded permission request.
   * @returns the Host outcome once the person answers, or at once for a permission already granted.
   */
  async requestApproval(request: ApprovalRequestPort): Promise<ApprovalOutcomePort> {
    if (this.#closed) return 'rejected'
    const model = approvalModel({ toolName: request.toolName, callId: request.callId, reason: request.reason })
    if (this.#grants.allows(model.scopeKey)) return 'allowed-once'
    const choice = await new Promise<ApprovalChoice>((resolve) => {
      const pending: PendingApproval = { model, settle: resolve }
      const withdraw = (): void => {
        const index = this.#approvals.indexOf(pending)
        if (index === -1) return
        this.#approvals.splice(index, 1)
        resolve('rejected')
        this.#render()
      }
      if (request.signal?.aborted === true) {
        resolve('rejected')
        return
      }
      request.signal?.addEventListener('abort', withdraw, { once: true })
      this.#approvals.push(pending)
      this.#schedule(() => this.#renderer.flush())
      this.#render()
    })
    if (choice === 'allowed-session') this.#grants.grant(model.scopeKey)
    return approvalOutcome(choice)
  }

  /** Stop following the session and remove the composer. */
  dispose(): void {
    if (this.#closed) return
    this.#closed = true
    for (const stop of this.#unsubscribe.splice(0)) stop()
    for (const pending of this.#approvals.splice(0)) pending.settle('rejected')
    const { cancel } = this.#picker ?? {}
    this.#picker = undefined
    cancel?.()
    const open = this.#prompt
    this.#prompt = undefined
    open?.settle(undefined)
    this.#screen.release()
    this.#title?.release()
  }

  #follow(window: EventWindowPort): void {
    if (window.revision === this.#lastRevision) return
    this.#lastRevision = window.revision
    const { change } = window
    // Earlier history shows image markers only; images are fetched for what arrives while the person watches.
    const wanted = change.kind === 'append' || change.kind === 'settle-assistant' ? this.#imageIds(change) : []
    this.#schedule(() => {
      switch (change.kind) {
        case 'replace': return this.#renderer.history(change.entries.map(entry => entry.event))
        case 'append': return change.entries.map(entry => this.#renderer.append(entry.event)).join('')
        case 'settle-assistant': return change.entry === undefined ? '' : this.#renderer.append(change.entry.event)
        case 'prepend': return ''
      }
    }, wanted)
  }

  /** Attachment ids of the images in the user messages of a change. */
  #imageIds(change: EventWindowPort['change']): string[] {
    if (this.#options.deps.imageProtocol === 'none' || change.kind === 'settle-assistant') return []
    const ids: string[] = []
    for (const { event } of change.entries) {
      if (event.type !== 'user/message') continue
      for (const block of event.data.content) {
        if (block.type === 'image') ids.push(block.attachment.attachmentId)
      }
    }
    return ids
  }

  /**
   * Print text produced by `render`, after everything scheduled before it.
   * Output is immediate unless an earlier item still waits for image bytes.
   * @param render - produces the text at print time, so the renderer sees events in order.
   * @param wanted - attachment ids whose bytes must be fetched before printing.
   */
  #schedule(render: () => string, wanted: readonly string[] = []): void {
    const missing = wanted.filter(id => !this.#images.has(id))
    if (missing.length === 0 && this.#queued === 0) {
      this.#printAbove(render())
      return
    }
    this.#queued += 1
    this.#chain = this.#chain
      .then(() => this.#fetchImages(missing))
      .then(() => { if (!this.#closed) this.#printAbove(render()) })
      .finally(() => { this.#queued -= 1 })
  }

  /** Fetch stored images; one that cannot be read is cached empty-handed so the transcript shows its marker. */
  async #fetchImages(ids: readonly string[]): Promise<void> {
    await Promise.all(ids.map(async (id) => {
      const stored = await this.#session.readAttachment(id).catch(() => undefined)
      if (stored?.ok === true) this.#images.set(id, Buffer.from(stored.value.data).toString('base64'))
    }))
  }

  #sync(): void {
    const { running } = this.#session.getSnapshot()
    if (running !== this.#running) {
      this.#running = running
      if (!running) {
        this.#cancelling = false
        this.#schedule(() => this.#renderer.flush())
      }
    }
    this.#render()
  }

  #printAbove(text: string): void {
    if (text !== '') this.#screen.print(text)
  }

  #edit(key: Key): void {
    const step = reduceComposer(this.#composer, key)
    this.#composer = step.state
    const effect = step.effect
    if (effect === undefined) return
    switch (effect.type) {
      case 'submit':
        this.#submit(effect.text)
        break
      case 'interrupt':
        this.#interrupt()
        break
      case 'eof':
        this.#exit(0)
        break
      case 'clear-screen':
        this.#screen.clear()
        break
    }
  }

  #submit(text: string): void {
    const input = classifyInput(text)
    switch (input.kind) {
      case 'help':
        this.#printAbove(`${helpLines(this.#options.style).join('\n')}\n`)
        break
      case 'exit':
        this.#exit(0)
        break
      case 'sessions':
        this.#openSessions()
        break
      case 'model':
        if (input.asDefault) this.#openConfig('default-model')
        else void this.#openModels()
        break
      case 'config':
        this.#openConfig(input.screen)
        break
      case 'rename':
        void this.#rename(input.title)
        break
      case 'new':
        void this.#startNew(input.directory)
        break
      case 'attach':
        void this.#attach(input.path)
        break
      case 'detach':
        this.#detach()
        break
      case 'command':
        void this.#run(() => this.#session.command(input.line), 'error.commandFailed')
        break
      case 'prompt':
        this.#send(input.text)
        break
    }
  }

  /** Send a message with the images attached so far; the images return to the queue if the Host refuses it. */
  #send(text: string): void {
    const images = this.#attached
    this.#attached = []
    void this.#run(
      () => this.#session.prompt([{ type: 'text', text }, ...images], 'queue'),
      'error.promptFailed',
      () => { this.#attached = [...images, ...this.#attached] },
    )
  }

  #openSessions(): void {
    const { deps, binding, home } = this.#options
    const items = sessionItems(deps.sessions(), { currentId: binding.sessionId, home, now: deps.now() })
    this.#pick(t('picker.sessions'), items, (item) => {
      if (item.value === binding.sessionId) return
      this.#leave({ kind: 'resume', sessionId: item.value })
    })
  }

  async #openModels(): Promise<void> {
    const catalog = await this.#options.deps.remote.modelCatalog().catch((error: unknown) => failure(error))
    if (!catalog.ok) {
      this.#note('picker.loadFailed', catalog.error.message)
      return
    }
    this.#pick(t('picker.models'), modelItems(catalog.value, this.#selectedModel), (item) => {
      void this.#selectModel(parseModelValue(item.value))
    })
  }

  async #selectModel(choice: { readonly provider: string; readonly model: string }): Promise<void> {
    const result = await this.#options.deps.remote
      .selectModel({ sessionId: this.#options.binding.sessionId, ...choice })
      .catch((error: unknown) => failure(error))
    if (!result.ok) {
      this.#note('model.failed', result.error.message)
      return
    }
    this.#selectedModel = result.value.selected
    this.#info(t('model.selected', { model: result.value.selected.model, provider: result.value.selected.provider }))
  }

  async #rename(title: string): Promise<void> {
    if (title === '') {
      this.#info(t('rename.usage'))
      return
    }
    const result = await this.#session.rename(title).catch((error: unknown) => failure(error))
    if (result.ok) this.#info(t('rename.done', { title: result.value.title }))
    else this.#note('rename.failed', result.error.message)
  }

  async #startNew(directory: string): Promise<void> {
    const { cwd, home, deps } = this.#options
    const target = resolveTypedPath(directory, { base: cwd, home })
    try {
      if (!await deps.files.isDirectory(target)) {
        this.#note('new.notDirectory', target, 'path')
        return
      }
    } catch (error) {
      this.#note('new.failed', error instanceof Error ? error.message : String(error))
      return
    }
    this.#leave({ kind: 'new', cwd: target })
  }

  async #attach(path: string): Promise<void> {
    if (path === '') {
      this.#info(t('attach.usage'))
      return
    }
    const { cwd, home, deps } = this.#options
    const file = resolveTypedPath(path, { base: cwd, home })
    try {
      const image = await deps.files.readImage(file)
      this.#attached.push({ type: 'image', mediaType: image.mediaType, data: image.base64, name: image.name })
      this.#info(t('attach.added', { name: image.name, count: this.#attached.length }))
    } catch (error) {
      this.#note('attach.failed', error instanceof Error ? error.message : String(error), 'message', { path: file })
    }
  }

  #detach(): void {
    const count = this.#attached.length
    this.#attached = []
    this.#info(t(count === 0 ? 'attach.none' : 'attach.cleared', { count }))
  }

  /** Open a picker in place of the composer. */
  #pick(title: string, items: readonly PickerItem[], choose: (item: PickerItem) => void, cancel?: () => void): void {
    if (this.#closed) return
    this.#picker = { state: createPicker(title, items), choose, cancel }
    this.#render()
  }

  #choose(picker: OpenPicker, key: Key): void {
    const step = reducePicker(picker.state, key)
    picker.state = step.state
    const { effect } = step
    if (effect === undefined) return
    this.#picker = undefined
    // The reducer selects in a single choice and confirms in a multiple choice, so each cast matches the picker's kind.
    if (effect.type === 'select') (picker as { choose: (item: PickerItem) => void }).choose(effect.item)
    else if (effect.type === 'confirm') (picker as { confirm: (values: readonly string[]) => void }).confirm(effect.values)
    else picker.cancel?.()
  }

  #answer(open: OpenPrompt, key: Key): void {
    const step = reducePrompt(open.state, key)
    open.state = step.state
    if (step.effect === undefined) return
    this.#prompt = undefined
    open.settle(step.effect.type === 'submit' ? step.effect.text : undefined)
  }

  /** Run a configuration screen in place of the composer; one screen at a time. */
  #openConfig(screen: ConfigScreen): void {
    if (this.#flowOpen) {
      this.#note('screen.busy', '')
      return
    }
    this.#flowOpen = true
    const { binding, deps } = this.#options
    const session = { sessionId: binding.sessionId, command: (line: string) => this.#session.command(line) }
    void runConfigScreen(screen, deps.client, this.#flowUi(), session)
      .catch((error: unknown) => { this.#note('screen.failed', error instanceof Error ? error.message : String(error)) })
      .finally(() => {
        this.#flowOpen = false
        this.#render()
      })
  }

  /** The questions a configuration screen asks, answered at the terminal. */
  #flowUi(): FlowUi {
    return {
      pick: (title, items) => new Promise((resolve) => {
        if (this.#closed) {
          resolve(undefined)
          return
        }
        this.#pick(title, items, (item) => { resolve(item) }, () => { resolve(undefined) })
      }),
      pickMany: (title, items, options) => new Promise((resolve) => {
        if (this.#closed) {
          resolve(undefined)
          return
        }
        this.#picker = {
          state: createMultiPicker(title, items, { checked: options.checked, doneLabel: count => t('picker.done', { count }) }),
          confirm: (values) => { resolve([...values]) },
          cancel: () => { resolve(undefined) },
        }
        this.#render()
      }),
      ask: (label, options?: PromptOptions) => new Promise((resolve) => {
        if (this.#closed) {
          resolve(undefined)
          return
        }
        this.#prompt = { state: createPrompt(label, options), settle: resolve }
        this.#render()
      }),
      info: (text) => { this.#info(text) },
      warn: (text) => { this.#warn(text) },
    }
  }

  /** A red line above the composer. */
  #warn(text: string): void {
    if (this.#closed) return
    this.#printAbove(`${this.#options.style.red(text)}\n`)
    this.#render()
  }


  /** One dim line above the composer. */
  #info(text: string): void {
    if (this.#closed) return
    this.#printAbove(`${this.#options.style.dim(text)}\n`)
    this.#render()
  }

  /** A failure line above the composer. */
  #note(
    key: 'picker.loadFailed' | 'model.failed' | 'rename.failed' | 'new.notDirectory' | 'new.failed' | 'attach.failed'
      | 'screen.busy' | 'screen.failed',
    detail: string,
    name: 'message' | 'path' = 'message',
    extra: Record<string, string> = {},
  ): void {
    if (this.#closed) return
    this.#printAbove(`${this.#options.style.red(t(key, { [name]: detail, ...extra }))}\n`)
    this.#render()
  }

  async #run(
    call: () => Promise<RemoteResultPort<unknown>>,
    failure: 'error.promptFailed' | 'error.commandFailed',
    onFailure?: () => void,
  ): Promise<void> {
    try {
      const result = await call()
      if (!result.ok) {
        onFailure?.()
        this.#report(failure, result.error.message)
      }
    } catch (error) {
      onFailure?.()
      this.#report(failure, error instanceof Error ? error.message : String(error))
    }
  }

  #report(key: 'error.promptFailed' | 'error.commandFailed', message: string): void {
    if (this.#closed) return
    this.#printAbove(`${this.#options.style.red(t(key, { message }))}\n`)
    this.#render()
  }

  /** Ctrl+C stops a running turn, clears a draft, and otherwise leaves. */
  #interrupt(): void {
    if (this.#approvals.length > 0) {
      for (const pending of this.#approvals.splice(0)) pending.settle('rejected')
    }
    if (this.#running && !this.#cancelling) {
      this.#cancelling = true
      void this.#run(() => this.#session.cancel(), 'error.commandFailed')
      return
    }
    if (this.#composer.text !== '') {
      this.#composer = { ...this.#composer, text: '', cursor: 0, browsing: undefined, draft: '' }
      return
    }
    this.#exit(0)
  }

  #answerApproval(key: Key): void {
    if (key.type === 'key' && key.name === 'interrupt') {
      this.#interrupt()
      return
    }
    const choice = approvalKeyChoice(key)
    const pending = this.#approvals[0]
    if (choice === undefined || pending === undefined) return
    this.#approvals.shift()
    pending.settle(choice)
  }

  /** Print the closing text of this session and stop following it. */
  #close(): void {
    this.#printAbove(this.#renderer.flush())
    this.#screen.release()
    this.#options.io.write(`${farewellLine(this.#options.style, this.#options.binding.sessionId)}\n`)
    this.dispose()
  }

  #exit(code: number): void {
    this.#close()
    this.#options.onExit(code)
  }

  #leave(target: SwitchTarget): void {
    this.#close()
    this.#options.onSwitch(target)
  }

  #frame(): ComposerFrame | undefined {
    const { style, io } = this.#options
    const pending = this.#approvals[0]
    if (pending !== undefined) {
      const lines = approvalPromptLines(style, pending.model)
      return { lines, cursor: { row: lines.length - 1, column: 0 } }
    }
    if (this.#prompt !== undefined) return renderPrompt(style, this.#prompt.state, io.columns())
    if (this.#picker !== undefined) return renderPicker(style, this.#picker.state, io.columns())
    const composer = renderComposer(this.#composer, {
      columns: io.columns(),
      prompt: '› ',
      placeholder: t('composer.placeholder'),
      dim: style.dim,
    })
    const above = [
      ...this.#running ? [workingLine(style, this.#cancelling)] : [],
      ...this.#attached.length > 0 ? [style.dim(t('attach.pending', { count: this.#attached.length }))] : [],
    ]
    if (above.length === 0) return composer
    return {
      lines: [...above, ...composer.lines],
      cursor: { row: composer.cursor.row + above.length, column: composer.cursor.column },
    }
  }

  #render(): void {
    this.#screen.show(this.#frame())
    this.#announce()
  }

  /** Tell the host what the agent is doing and which session this is. */
  #announce(): void {
    if (this.#title === undefined || this.#closed) return
    const { binding, cwd, deps } = this.#options
    const named = deps.sessions().find(row => row.id === binding.sessionId)?.title?.trim() ?? ''
    const activity = this.#approvals.length > 0 ? 'waiting' : this.#running ? 'working' : 'idle'
    this.#title.update(activity, named === '' ? basename(cwd) : named)
  }
}

/**
 * Register the approval listener on the client tree for one session.
 * @param services - the client services.
 * @param sessionId - the session this terminal shows.
 * @param current - the terminal session that asks the person; read at each request.
 * @returns a disposer that withdraws the listener.
 */
export function listenForApprovals(
  services: { readonly sessions: SessionsPort; readonly remote: RemotePort },
  sessionId: string,
  current: () => Pick<TerminalSession, 'requestApproval'> | undefined,
): () => void {
  const { sessions } = services
  return services.remote.$on('approval/request', function (request, next) {
    const terminal = current()
    if (terminal === undefined || sessions.scopeOf(this) !== sessionId) return next()
    return terminal.requestApproval(request)
  })
}
