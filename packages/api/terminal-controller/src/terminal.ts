/** One PTY, a bounded terminal emulator and its detachable browser followers. */
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { Terminal as HeadlessTerminal } from '@xterm/headless'
import type { SerializeAddon as Serializer } from '@xterm/addon-serialize'
import type { SubprocessTerminalHandle } from '@deepseek-ai/dsh-subprocess'
import { createLazyRequire } from '@deepseek-ai/dsh-lazy-require'
import { TerminalFollower } from './stream.ts'
import { TerminalRetention, type TerminalRetentionPolicy } from './retention.ts'
import type {
  TerminalAttachmentId, TerminalCommandResult, TerminalFrame, TerminalRetentionFrame, WebTerminalInfo,
} from './types.ts'

const requireHeadless = createLazyRequire<typeof import('@xterm/headless')>('@xterm/headless', import.meta.url)
const requireSerialize = createLazyRequire<typeof import('@xterm/addon-serialize')>('@xterm/addon-serialize', import.meta.url)

/** Process lifetime is independent of follower and component lifetimes. */
export class BrowserTerminal {
  private readonly screen: HeadlessTerminal
  private readonly serializer: Serializer
  private readonly followers = new Set<TerminalFollower>()
  private sequence = 0
  private operations: Promise<unknown> = Promise.resolve()
  private readonly drained: Promise<void>
  private closing: Promise<void> | undefined
  private retention: TerminalRetention | undefined
  private controller: { id: TerminalAttachmentId; follower: TerminalFollower } | undefined
  private readonly completion = Promise.withResolvers<TerminalCommandResult>()

  /**
   * @param handle - allocated terminal process range.
   * @param info - initial metadata.
   * @param scrollback - maximum retained scrollback rows.
   * @param maxBufferedBytes - per-follower queue cap.
   * @param maxOutputChars - final text retained for {@link result} when `info.command` is set.
   */
  constructor(
    private readonly handle: SubprocessTerminalHandle,
    public info: WebTerminalInfo,
    private readonly scrollback: number,
    private readonly maxBufferedBytes: number,
    private readonly maxOutputChars: number,
  ) {
    const { Terminal } = requireHeadless()
    const { SerializeAddon } = requireSerialize()
    this.screen = new Terminal({ cols: info.cols, rows: info.rows, scrollback, allowProposedApi: true })
    this.serializer = new SerializeAddon()
    this.screen.loadAddon(this.serializer)
    this.drained = this.consume()
  }

  /**
   * Start monitoring after this allocation is committed to its Session owner.
   * @param policy - validated Host timing policy.
   * @param closing - closes the id before any asynchronous termination.
   * @param closed - removes the exact successfully terminated owner record.
   * @param failed - diagnostic sink for background cleanup failure.
   */
  monitor(policy: TerminalRetentionPolicy, closing: () => void, closed: () => void, failed: (error: unknown) => void): void {
    this.retention = new TerminalRetention(policy, () => this.handle.inspectActivity(), async () => {
      closing()
      await this.closeProcess()
      closed()
    }, failed)
  }

  /**
   * Retain this committed process independently of output attachment.
   * @param signal - physical window stream lifetime.
   * @returns its hold acknowledgement and lifetime.
   */
  retain(signal: AbortSignal): AsyncIterable<TerminalRetentionFrame> {
    if (this.retention === undefined) throw new Error('Terminal has not been committed')
    return this.retention.retain(signal)
  }

  /**
   * Attach with exclusive input control; an older attachment becomes read-only.
   * @param id - browser attachment identity.
   * @param signal - attachment cancellation; never terminates the process.
   * @returns a consistent screen followed by ordered output and state changes.
   */
  async *follow(id: TerminalAttachmentId, signal: AbortSignal): AsyncIterable<TerminalFrame> {
    signal.throwIfAborted()
    const follower = new TerminalFollower(this.maxBufferedBytes)
    const baseline = await this.enqueue(() => {
      signal.throwIfAborted()
      this.controller = { id, follower }
      this.info = { ...this.info, controllerId: id }
      this.broadcast({ type: 'state', info: this.info })
      const snapshot: TerminalFrame = { type: 'snapshot', sequence: this.sequence, screen: this.serializer.serialize(), info: this.info }
      this.followers.add(follower)
      return snapshot
    })
    try {
      yield baseline
      yield* follower.read(signal)
    } finally {
      this.followers.delete(follower)
      follower.close()
      if (this.controller?.follower === follower) {
        this.controller = undefined
        const { controllerId: _controllerId, ...info } = this.info
        this.info = info
        this.broadcast({ type: 'state', info })
      }
    }
  }

  /**
   * Wait for a command terminal's process to end, including termination by close.
   * @param signal - wait cancellation; never terminates the process.
   * @returns exit state and the final screen text, which stays available after close.
   */
  async result(signal: AbortSignal): Promise<TerminalCommandResult> {
    if (this.info.command === undefined) throw new Error('Terminal does not run a command')
    signal.throwIfAborted()
    const aborted = Promise.withResolvers<never>()
    const abort = (): void => { aborted.reject(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
    try { return await Promise.race([this.completion.promise, aborted.promise]) }
    finally { signal.removeEventListener('abort', abort) }
  }

  /**
   * Send raw terminal input without command interpretation.
   * @param id - current writable attachment.
   * @param data - UTF-8 input, including shell completion/control keys.
   * @returns when the provider accepts the input.
   */
  write(id: TerminalAttachmentId, data: string): Promise<void> {
    this.retention?.invalidate()
    return this.enqueue(async () => { this.requireController(id); await this.handle.write(data) })
  }

  /**
   * Resize the PTY and recovery screen in the same operation order as output.
   * @param id - current writable attachment.
   * @param cols - validated column count.
   * @param rows - validated row count.
   * @returns when the provider and emulator use the new dimensions.
   */
  resize(id: TerminalAttachmentId, cols: number, rows: number): Promise<void> {
    return this.enqueue(async () => {
      this.requireController(id)
      await this.handle.resize(cols, rows)
      this.screen.resize(cols, rows)
      this.info = { ...this.info, cols, rows }
      this.broadcast({ type: 'state', info: this.info })
    })
  }

  /**
   * Publish a display name to every attached view.
   * @param title - validated user title.
   */
  rename(title: string): void {
    this.info = { ...this.info, title }
    this.broadcast({ type: 'state', info: this.info })
  }

  /**
   * Terminate the complete provider-owned process range before releasing its screen.
   * @returns after process cleanup and final output drainage; failures remain retryable.
   */
  close(): Promise<void> {
    return this.retention?.close() ?? this.closeProcess()
  }

  /**
   * Stop unattended cleanup scheduling and await final process cleanup.
   * @returns after terminal and monitor quiescence.
   */
  dispose(): Promise<void> { return this.retention?.dispose() ?? this.closeProcess() }

  private closeProcess(): Promise<void> {
    if (this.closing !== undefined) return this.closing
    this.closing = (async () => {
      await this.handle.terminate()
      await this.drained
      for (const follower of this.followers) follower.finish()
      this.followers.clear()
      this.screen.dispose()
    })().catch((error: unknown) => { this.closing = undefined; throw error })
    return this.closing
  }

  private requireController(id: TerminalAttachmentId): void {
    if (this.closing !== undefined || this.info.state !== 'running') throw new RemoteError('terminal/control-unavailable', 'Terminal is not running', { reason: 'not-running' })
    if (this.controller?.id !== id) throw new RemoteError('terminal/control-unavailable', 'Terminal input is controlled by another attachment', { reason: 'read-only' })
  }

  private broadcast(frame: TerminalFrame): void {
    for (const follower of this.followers) follower.push(frame)
  }

  private enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    const pending = this.operations.then(operation)
    this.operations = pending.catch(() => { /* The caller owns this operation's failure; later cleanup must still run. */ })
    return pending
  }

  private async consume(): Promise<void> {
    const decoder = new TextDecoder('utf-8', { ignoreBOM: true })
    const outcome = this.handle.done.then(value => ({ value }), (error: unknown) => ({ error }))
    try {
      for await (const chunk of this.handle.output) {
        // Node Readable's iterator is untyped; this provider explicitly emits Buffer chunks.
        const data = decoder.decode(chunk as Buffer, { stream: true })
        await this.output(data)
      }
      await this.output(decoder.decode())
      const result = await outcome
      if ('error' in result) throw result.error
      this.info = { ...this.info, state: 'exited', exitCode: result.value.exitCode }
    } catch (error) {
      this.info = { ...this.info, state: 'failed', error: error instanceof Error ? error.message : String(error) }
    }
    if (this.info.command !== undefined) {
      const { state, exitCode, error } = this.info
      const text = await this.enqueue(() => this.text())
      this.completion.resolve({ state: state === 'failed' ? 'failed' : 'exited', exitCode, ...error === undefined ? {} : { error }, ...text })
    }
    this.broadcast({ type: 'state', info: this.info })
  }

  private text(): Pick<TerminalCommandResult, 'output' | 'truncated'> {
    const buffer = this.screen.buffer.active
    let output = ''
    for (let index = 0; index < buffer.length; index++) {
      const line = buffer.getLine(index)
      /* v8 ignore next -- indexes below buffer.length always address a retained line. */
      if (line === undefined) break
      // Soft-wrapped rows continue the previous line; history trimming can leave one first.
      if (index > 0 && !line.isWrapped) output += '\n'
      output += line.translateToString(true)
    }
    output = output.trimEnd()
    const full = buffer.length >= this.scrollback + this.screen.rows
    if (output.length <= this.maxOutputChars) return { output, truncated: full }
    return { output: output.slice(output.length - this.maxOutputChars), truncated: true }
  }

  private async output(data: string): Promise<void> {
    if (data.length === 0) return
    await this.enqueue(async () => {
      await new Promise<void>((resolve) => { this.screen.write(data, resolve) })
      this.broadcast({ type: 'output', sequence: ++this.sequence, data })
    })
  }
}
