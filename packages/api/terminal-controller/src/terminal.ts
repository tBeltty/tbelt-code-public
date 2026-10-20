/** One PTY, a bounded terminal emulator and its detachable browser followers. */
import { assertNever } from '@deepseek-ai/dsh-util-values'
import { RemoteError, remoteErrorOf, type RemoteUplinkWindow } from '@deepseek-ai/dsh-typert-protocol'
import type { Terminal as HeadlessTerminal } from '@xterm/headless'
import type { SerializeAddon as Serializer } from '@xterm/addon-serialize'
import type { SubprocessTerminalHandle } from '@deepseek-ai/dsh-subprocess'
import { createLazyRequire } from '@deepseek-ai/dsh-lazy-require'
import { TerminalFollower } from './stream.ts'
import { TerminalRetention, type TerminalRetentionPolicy } from './retention.ts'
import type {
  TerminalCommandResult, TerminalEnvironment, TerminalInput, TerminalFrame, TerminalRetentionFrame, WebTerminalInfo,
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
  /** Provider completion precedes output drainage and the published exit state. */
  private exited = false
  private closing: Promise<void> | undefined
  private retention: TerminalRetention | undefined
  private controller: TerminalFollower | undefined
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
   * Attach with exclusive input control; older attachments keep receiving output.
   * @param input - Gateway-decoded commands; returning its iterator must interrupt pending reads.
   * @param limits - input byte and PTY dimension limits validated at the Remote boundary.
   * @param signal - attachment cancellation; never terminates the process.
   * @param inputWindow - carrier frame capacity; absent for a carrier without an encoded-frame inbox limit.
   * @returns a screen baseline, output, per-attachment state and ordered command acknowledgements.
   */
  async *attach(input: AsyncIterable<TerminalInput>, limits: Pick<TerminalEnvironment, 'maxInputBytes' | 'maxCols' | 'maxRows'>, signal: AbortSignal, inputWindow?: RemoteUplinkWindow): AsyncIterable<TerminalFrame> {
    signal.throwIfAborted()
    const follower = new TerminalFollower(this.maxBufferedBytes)
    const baseline = await this.enqueue(() => {
      signal.throwIfAborted()
      this.controller = follower
      this.broadcastState()
      const snapshot: TerminalFrame = { type: 'snapshot', sequence: this.sequence, screen: this.serializer.serialize(), info: this.info, writable: this.writable(follower), ...inputWindow === undefined ? {} : { inputWindow } }
      this.followers.add(follower)
      return snapshot
    })
    const uplink = input[Symbol.asyncIterator]()
    const commands = this.consumeInput(uplink, follower, limits, signal).catch((error: unknown) => {
      follower.fail(error instanceof Error ? error : new Error(String(error)))
    })
    try {
      yield baseline
      yield* follower.read(signal)
    } finally {
      this.followers.delete(follower)
      follower.close()
      if (this.controller === follower) {
        this.controller = undefined
        this.broadcastState()
      }
      // Gateway's uplink return wakes pending reads before attachment cleanup joins the input pump.
      await uplink.return?.()
      await commands
    }
  }

  private async consumeInput(input: AsyncIterator<TerminalInput>, follower: TerminalFollower, limits: Pick<TerminalEnvironment, 'maxInputBytes' | 'maxCols' | 'maxRows'>, signal: AbortSignal): Promise<void> {
    let sequence = 0
    while (true) {
      const next = await input.next()
      if (next.done === true || signal.aborted || !follower.active) return
      const command = next.value
      if (!Number.isSafeInteger(command.sequence) || command.sequence !== ++sequence) throw new Error('Terminal input sequence has a gap')
      try {
        await this.enqueue(async () => {
          signal.throwIfAborted()
          this.requireController(follower)
          switch (command.type) {
            case 'write':
              if (Buffer.byteLength(command.data, 'utf8') > limits.maxInputBytes) throw new Error('Terminal input exceeds the configured limit')
              this.retention?.invalidate()
              await this.handle.write(command.data)
              break
            case 'resize':
              if (!Number.isSafeInteger(command.cols) || command.cols < 2 || command.cols > limits.maxCols
                || !Number.isSafeInteger(command.rows) || command.rows < 1 || command.rows > limits.maxRows) throw new Error('Terminal dimensions exceed the configured limits')
              await this.handle.resize(command.cols, command.rows)
              this.screen.resize(command.cols, command.rows)
              this.info = { ...this.info, cols: command.cols, rows: command.rows }
              this.broadcastState()
              break
            /* v8 ignore next -- the Gateway codec validates this closed union. */
            default: assertNever(command)
          }
        })
        follower.push({ type: 'ack', sequence })
      } catch (error) {
        const failure = remoteErrorOf(error)
        if (failure?.code === 'terminal/control-unavailable') {
          follower.push({ type: 'ack', sequence, refusal: failure.details.reason })
        } else if (this.exited) {
          follower.push({ type: 'ack', sequence, refusal: 'not-running' })
        } else throw error
      }
    }
  }

  private writable(follower: TerminalFollower): boolean {
    return !this.exited && this.closing === undefined && this.info.state === 'running' && this.controller === follower
  }

  private broadcastState(): void {
    for (const follower of this.followers) follower.push({ type: 'state', info: this.info, writable: this.writable(follower) })
  }

  /**
   * Publish a display name to every attached view.
   * @param title - validated user title.
   */
  rename(title: string): void {
    this.info = { ...this.info, title }
    this.broadcastState()
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

  private requireController(follower: TerminalFollower): void {
    if (this.exited || this.closing !== undefined || this.info.state !== 'running') throw new RemoteError('terminal/control-unavailable', 'Terminal is not running', { reason: 'not-running' })
    if (this.controller !== follower || !follower.active) throw new RemoteError('terminal/control-unavailable', 'Terminal input is controlled by another attachment', { reason: 'read-only' })
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
    const outcome = this.handle.done.then((value) => { this.exited = true; return { value } }, (error: unknown) => ({ error }))
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
    this.broadcastState()
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
