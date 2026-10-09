import { vi } from 'vitest'
import { MessageId, ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import { SessionSeq } from '@deepseek-ai/dsh-session/types'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { createStyle } from '@deepseek-ai/dsh-terminal-views'
import type { PickerItem, TranscriptEvent } from '@deepseek-ai/dsh-terminal-views'
import type {
  ApprovalListenerPort, ChangeResultPort, EventChangePort, EventEntryPort, EventWindowPort, ModelCatalogPort, ObservablePort,
  RemotePort, RemoteResultPort, SessionBindingPort, SessionFacePort, SessionRemotePort, SessionSnapshotPort, SessionsPort,
  SettingsNamespacePort, SettingsOpPort, StoredImagePort,
} from '../src/ports.ts'
import type { FlowUi } from '../src/config/index.ts'
import type { TerminalFiles } from '../src/files.ts'
import type { TerminalDeps, TerminalIo } from '../src/terminal-session.ts'

/** An observable value a test changes by hand. */
export class Cell<T> implements ObservablePort<T> {
  #value: T
  readonly #listeners = new Set<() => void>()

  constructor(value: T) { this.#value = value }

  getSnapshot(): T { return this.#value }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  set(value: T): void {
    this.#value = value
    for (const listener of [...this.#listeners]) listener()
  }

  get listeners(): number { return this.#listeners.size }
}

const accepted: RemoteResultPort<{ readonly accepted: true }> = { ok: true, value: { accepted: true } }

/** A Session face that records calls. */
export class FakeSession implements SessionFacePort {
  readonly state = new Cell<SessionSnapshotPort>({ running: false, openState: 'open', openError: null })
  readonly prompt = vi.fn(
    (_content: unknown, _mode: unknown): Promise<RemoteResultPort<{ readonly accepted: true }>> => Promise.resolve(accepted),
  )
  readonly cancel = vi.fn((): Promise<RemoteResultPort<{ readonly accepted: true }>> => Promise.resolve(accepted))
  readonly command = vi.fn(
    (_line: string): Promise<RemoteResultPort<{ readonly matched: boolean }>> => Promise.resolve({ ok: true, value: { matched: true } }),
  )

  readonly rename = vi.fn(
    (title: string): Promise<RemoteResultPort<{ readonly title: string }>> => Promise.resolve({ ok: true, value: { title } }),
  )

  readonly readAttachment = vi.fn(
    (_id: string): Promise<RemoteResultPort<StoredImagePort>> => Promise.resolve({
      ok: true,
      value: { attachment: { mediaType: 'image/png', bytes: 3, width: 1, height: 1 }, data: Uint8Array.from([65, 66, 67]) },
    }),
  )

  getSnapshot(): SessionSnapshotPort { return this.state.getSnapshot() }

  subscribe(listener: () => void): () => void { return this.state.subscribe(listener) }

  setRunning(running: boolean): void { this.state.set({ ...this.state.getSnapshot(), running }) }
}

/** An event window a test appends to. */
export class FakeEvents extends Cell<EventWindowPort> {
  constructor() {
    super({ entries: [], revision: 0, change: { kind: 'replace', entries: [] } })
  }

  push(change: EventChangePort): void {
    const previous = this.getSnapshot()
    const added = change.kind === 'settle-assistant' ? (change.entry === undefined ? [] : [change.entry]) : change.entries
    this.set({ entries: [...previous.entries, ...added], revision: previous.revision + 1, change })
  }

  append(...events: TranscriptEvent[]): void {
    this.push({ kind: 'append', entries: events.map((event): EventEntryPort => ({ type: 'event', event })) })
  }
}

/** A retained session over fakes. */
export function fakeBinding(sessionId = 'session-3f9a0c1e-0000'): { binding: SessionBindingPort; session: FakeSession; events: FakeEvents } {
  const session = new FakeSession()
  const events = new FakeEvents()
  return { binding: { sessionId, session, eventSource: events }, session, events }
}

/** Terminal output collected as text; the width is mutable. */
export function fakeIo(columns = 80): TerminalIo & { text: string; width: number } {
  const io = {
    text: '',
    width: columns,
    write(chunk: string): void { io.text += chunk },
    columns: (): number => io.width,
  }
  return io
}

export const plain = createStyle(false)

/** Remove cursor movement and erase sequences so assertions read the visible text. */
export function visible(text: string): string {
  return text.replace(/\u001B\[[0-9;?]*[A-Za-z]/gu, '').replace(/\r/gu, '')
}

export const CATALOG: ModelCatalogPort = {
  default: { provider: 'p1', model: 'm1' },
  groups: [{ id: 'p1', name: 'Provider One', models: [{ id: 'm1', name: 'Model One' }, { id: 'm2', name: 'Model Two' }] }],
}

/** The `session` Remote namespace over mocks. */
export function fakeSessionRemote(): SessionRemotePort & {
  modelCatalog: ReturnType<typeof vi.fn>
  selectModel: ReturnType<typeof vi.fn>
  setDefaultModel: ReturnType<typeof vi.fn>
} {
  return {
    setDefaultModel: vi.fn((): ReturnType<SessionRemotePort['setDefaultModel']> => Promise.resolve({ ok: true, value: {} })),
    modelCatalog: vi.fn((): ReturnType<SessionRemotePort['modelCatalog']> => Promise.resolve({ ok: true, value: CATALOG })),
    selectModel: vi.fn((request: { provider: string; model: string }): ReturnType<SessionRemotePort['selectModel']> => Promise.resolve({
      ok: true,
      value: { selected: { provider: request.provider, model: request.model } },
    })),
  }
}

/** File access over mocks: every path is a directory and every file a small PNG. */
export function fakeFiles(): TerminalFiles & { readImage: ReturnType<typeof vi.fn>; isDirectory: ReturnType<typeof vi.fn> } {
  return {
    readImage: vi.fn((path: string) => Promise.resolve({ mediaType: 'image/png' as const, base64: 'QUJD', name: path.split('/').at(-1) ?? 'x', bytes: 3 })),
    isDirectory: vi.fn(() => Promise.resolve(true)),
  }
}

/** Everything a session reads from outside itself, with scripted defaults. */
export function fakeDeps(
  overrides: Partial<TerminalDeps> = {},
): TerminalDeps & { remote: ReturnType<typeof fakeSessionRemote>; files: ReturnType<typeof fakeFiles> } {
  return {
    sessions: () => [],
    remote: fakeSessionRemote(),
    client: fakeRemote().remote,
    files: fakeFiles(),
    imageProtocol: 'none',
    now: () => 10_000_000,
    ...overrides,
  } as ReturnType<typeof fakeDeps>
}

/** A Remote with the approval listener slot. */
export function fakeRemote(): { remote: RemotePort; listeners: ApprovalListenerPort[]; disposed: number } {
  const state = { listeners: [] as ApprovalListenerPort[], disposed: 0 }
  return {
    remote: {
      ...fakeNamespaces(),
      session: fakeSessionRemote(),
      $on: (_event, listener) => {
        state.listeners.push(listener)
        return () => { state.disposed += 1 }
      },
    },
    get listeners() { return state.listeners },
    get disposed() { return state.disposed },
  }
}

/** Sessions double: only the parts the runner reads. */
export function fakeSessions(overrides: Partial<SessionsPort> = {}): SessionsPort {
  return {
    list: new Cell({ phase: 'ready', ids: [], byId: {} }),
    create: () => Promise.resolve('session-new'),
    retain: () => { throw new Error('retain not scripted') },
    scopeOf: () => undefined,
    ...overrides,
  }
}

let sequence = 0

function stamp(): { seq: SessionEvent['seq']; time: number } {
  sequence += 1
  return { seq: SessionSeq(sequence), time: 1_000 + sequence }
}

/** A user message event. */
export function userEvent(text: string): SessionEvent<'user/message'> {
  return {
    type: 'user/message',
    ...stamp(),
    surfaceOp: 'append',
    data: { id: MessageId(`m${sequence}`), role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } },
  }
}

/** A durable assistant reply. */
export function assistantEvent(text: string, turn = 1, step = 1): SessionEvent<'assistant/message'> {
  return {
    type: 'assistant/message',
    ...stamp(),
    surfaceOp: 'append',
    data: {
      turn,
      step,
      message: { id: MessageId(`a${sequence}`), role: 'assistant', content: [{ type: 'text', text }], source: { kind: 'model', provider: 'test', model: 'test-model' } },
      stream: [],
    },
  }
}

/** A streamed text delta. */
export function deltaEvent(text: string, turn = 1, step = 1): TranscriptEvent {
  return { type: 'assistant/live-chunk', ...stamp(), data: { turn, step, chunk: { index: 0, type: 'text-delta', text } } }
}

/** A tool call event. */
export function callEvent(callId: string, name: string, args: unknown): SessionEvent<'tool/call'> {
  return { type: 'tool/call', ...stamp(), data: { turn: 1, step: 1, callId: ToolCallId(callId), name, arguments: JSON.stringify(args) } }
}

/** The end of a turn that completed. */
export function turnEnd(): SessionEvent<'turn/end'> {
  return { type: 'turn/end', ...stamp(), data: { turn: 1, reason: { kind: 'completed' } } }
}

const ok = <T>(value: T): Promise<{ readonly ok: true; readonly value: T }> => Promise.resolve({ ok: true as const, value })

/** Every Remote namespace except `session`, answering empty successes the tests override. */
export function fakeNamespaces() {
  return {
    llm: {
      listProviders: vi.fn((): ReturnType<RemotePort['llm']['listProviders']> => ok([])),
      listConfigurableProviders: vi.fn((): ReturnType<RemotePort['llm']['listConfigurableProviders']> => ok([])),
      discoverModels: vi.fn((_ns: string, _request: object): ReturnType<RemotePort['llm']['discoverModels']> => ok([])),
    },
    credentials: {
      describe: vi.fn((_refs?: readonly string[]): ReturnType<RemotePort['credentials']['describe']> => ok({})),
      set: vi.fn((_ref: string, _value: string): ReturnType<RemotePort['credentials']['set']> => ok({})),
      unset: vi.fn((_ref: string): ReturnType<RemotePort['credentials']['unset']> => ok({})),
    },
    settings: {
      describe: vi.fn((): ReturnType<RemotePort['settings']['describe']> => ok({ writable: true, namespaces: [] })),
      update: vi.fn((_ns: string, _patch: object, _revision: number | undefined): ReturnType<RemotePort['settings']['update']> => ok(namespaceStub)),
      mutate: vi.fn((_ns: string, _ops: readonly SettingsOpPort[], _revision: number | undefined): ReturnType<RemotePort['settings']['mutate']> => ok(namespaceStub)),
      openSettingsDocument: vi.fn((): ReturnType<RemotePort['settings']['openSettingsDocument']> => ok({ opened: true })),
    },
    web: {
      searchProviders: vi.fn((): ReturnType<RemotePort['web']['searchProviders']> => ok([])),
      checkSearchKey: vi.fn((_id: string, _key: string): ReturnType<RemotePort['web']['checkSearchKey']> => ok({ ok: true })),
    },
    pluginManager: {
      listBundles: vi.fn((): ReturnType<RemotePort['pluginManager']['listBundles']> => ok([])),
      listPlugins: vi.fn((): ReturnType<RemotePort['pluginManager']['listPlugins']> => ok([])),
      inspect: vi.fn((_spec: string): ReturnType<RemotePort['pluginManager']['inspect']> => ok({ status: 'refused', problem: 'p', reason: 'r' })),
      setBundleEnabled: vi.fn((_name: string, _enabled: boolean): ReturnType<RemotePort['pluginManager']['setBundleEnabled']> => ok(changed)),
      setPluginEnabled: vi.fn((_id: string, _enabled: boolean): ReturnType<RemotePort['pluginManager']['setPluginEnabled']> => ok(changed)),
      installBundle: vi.fn((_spec: string): ReturnType<RemotePort['pluginManager']['installBundle']> => ok(changed)),
      removeBundle: vi.fn((_name: string): ReturnType<RemotePort['pluginManager']['removeBundle']> => ok(changed)),
    },
    agentPresets: {
      list: vi.fn((): ReturnType<RemotePort['agentPresets']['list']> => ok({ presets: [] })),
      read: vi.fn((_id: string): ReturnType<RemotePort['agentPresets']['read']> => ok({ content: '' })),
      select: vi.fn((_session: string, _preset: string): ReturnType<RemotePort['agentPresets']['select']> => ok({})),
    },
    permissionPresets: {
      catalog: vi.fn((): ReturnType<RemotePort['permissionPresets']['catalog']> => ok({ options: [], defaultOptions: [], defaultPreset: 'default' })),
    },
  }
}

const namespaceStub: SettingsNamespacePort = { ns: 'x', schema: {}, value: {}, secrets: [], revision: 1 }
const changed: ChangeResultPort = { changed: true, application: 'applied', target: 't' }

/** A configuration flow's questions answered from a script; unanswered questions leave the screen. */
export function scriptedUi(answers: readonly unknown[]) {
  const queue = [...answers]
  const log: { kind: string; text: string; items?: readonly PickerItem[] }[] = []
  const next = (): unknown => queue.shift()
  const ui: FlowUi = {
    pick: (title, items) => { log.push({ kind: 'pick', text: title, items }); return Promise.resolve(resolveItem(next(), items)) },
    pickMany: (title, items) => { log.push({ kind: 'pickMany', text: title, items }); return Promise.resolve(next() as string[] | undefined) },
    ask: (label) => { log.push({ kind: 'ask', text: label }); return Promise.resolve(next() as string | undefined) },
    info: (text) => { log.push({ kind: 'info', text }) },
    warn: (text) => { log.push({ kind: 'warn', text }) },
  }
  return { ui, log, remaining: () => queue.length }
}

/** An answer to a choice: the item value (a string), or undefined to leave. */
function resolveItem(answer: unknown, items: readonly PickerItem[]): PickerItem | undefined {
  if (answer === undefined) return undefined
  const item = items.find(entry => entry.value === answer)
  if (item === undefined) {
    throw new Error(`scripted answer ${JSON.stringify(answer)} is not offered: ${items.map(entry => entry.value).join(', ')}`)
  }
  return item
}
