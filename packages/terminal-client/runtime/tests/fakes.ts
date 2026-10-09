import { vi } from 'vitest'
import type { Mocked } from 'vitest'
import { MessageId, ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import { SessionSeq } from '@deepseek-ai/dsh-session/types'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { createStyle } from '@deepseek-ai/dsh-terminal-views'
import type { PickerItem, PromptOptions, TranscriptEvent } from '@deepseek-ai/dsh-terminal-views'
import type {
  ApprovalListenerPort, ChangeResultPort, ClientServicesPort, EventChangePort, EventEntryPort, EventWindowPort, ModelCatalogPort,
  ObservablePort, QueueActionPort, QuestionListenerPort, RemotePort, RemoteResultPort, SessionBindingPort, SessionFacePort,
  SessionRemotePort, SessionSnapshotPort, SessionsPort, SettingsNamespacePort, SettingsOpPort, StoredImagePort,
} from '../src/ports.ts'
import type { PanelContext, PanelServices } from '../src/panels/index.ts'
import type { FlowUi } from '../src/config/index.ts'
import type { LoadedAttachment, TerminalFiles } from '../src/files.ts'
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

  readonly updateQueue = vi.fn(
    (_itemId: string, _action: QueueActionPort): Promise<RemoteResultPort<{ readonly accepted: true }>> => Promise.resolve(accepted),
  )

  /** Projection values by key; a test changes one with `faces.get(key).set(value)` or {@link project}. */
  readonly faces = new Map<string, Cell<unknown>>()

  readonly projections = {
    faceOf: (key: string): ObservablePort<unknown> => this.#face(key),
  }

  #face(key: string): Cell<unknown> {
    let face = this.faces.get(key)
    if (face === undefined) {
      face = new Cell<unknown>(undefined)
      this.faces.set(key, face)
    }
    return face
  }

  /** Set the value of one projection and notify its subscribers. */
  project(key: string, value: unknown): void { this.#face(key).set(value) }

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
  fork: ReturnType<typeof vi.fn>
  canOpenWorkspacePath: ReturnType<typeof vi.fn>
  openWorkspacePath: ReturnType<typeof vi.fn>
  workspacePathApplications: ReturnType<typeof vi.fn>
} {
  return {
    setDefaultModel: vi.fn((): ReturnType<SessionRemotePort['setDefaultModel']> => Promise.resolve({ ok: true, value: {} })),
    modelCatalog: vi.fn((): ReturnType<SessionRemotePort['modelCatalog']> => Promise.resolve({ ok: true, value: CATALOG })),
    selectModel: vi.fn((request: { provider: string; model: string }): ReturnType<SessionRemotePort['selectModel']> => Promise.resolve({
      ok: true,
      value: { selected: { provider: request.provider, model: request.model } },
    })),
    fork: vi.fn((_request: object): ReturnType<SessionRemotePort['fork']> => Promise.resolve({ ok: true, value: { sessionId: 'session-forked' } })),
    canOpenWorkspacePath: vi.fn((): ReturnType<SessionRemotePort['canOpenWorkspacePath']> => Promise.resolve({ ok: true, value: true })),
    openWorkspacePath: vi.fn((_request: object): ReturnType<SessionRemotePort['openWorkspacePath']> => Promise.resolve({ ok: true, value: { opened: true as const } })),
    workspacePathApplications: vi.fn((_request: object): ReturnType<SessionRemotePort['workspacePathApplications']> => Promise.resolve({ ok: true, value: [] })),
  }
}

/** File access over mocks: every path is a directory and every file a small PNG. */
export function fakeFiles(): TerminalFiles & { readAttachment: ReturnType<typeof vi.fn>; isDirectory: ReturnType<typeof vi.fn> } {
  return {
    readAttachment: vi.fn((path: string): Promise<LoadedAttachment> => Promise.resolve({
      kind: 'image',
      image: { mediaType: 'image/png', base64: 'QUJD', name: path.split('/').at(-1) ?? 'x', bytes: 3 },
    })),
    isDirectory: vi.fn(() => Promise.resolve(true)),
  }
}

/** Everything a session reads from outside itself, with scripted defaults. */
export function fakeDeps(
  overrides: Partial<TerminalDeps> = {},
): TerminalDeps & {
  remote: ReturnType<typeof fakeSessionRemote>
  files: ReturnType<typeof fakeFiles>
  services: ReturnType<typeof fakeServices>
} {
  return {
    sessions: () => [],
    remote: fakeSessionRemote(),
    client: fakeRemote().remote,
    services: fakeServices(),
    files: fakeFiles(),
    imageProtocol: 'none',
    now: () => 10_000_000,
    ...overrides,
  } as ReturnType<typeof fakeDeps>
}

/** A Remote with the approval and question listener slots. */
export function fakeRemote(): {
  remote: RemotePort
  listeners: ApprovalListenerPort[]
  questionListeners: QuestionListenerPort[]
  disposed: number
  questionsDisposed: number
} {
  const state = {
    listeners: [] as ApprovalListenerPort[], questionListeners: [] as QuestionListenerPort[], disposed: 0, questionsDisposed: 0,
  }
  const on: RemotePort['$on'] = (event: string, listener: ApprovalListenerPort | QuestionListenerPort) => {
    if (event === 'approval/request') {
      state.listeners.push(listener as ApprovalListenerPort)
      return () => { state.disposed += 1 }
    }
    state.questionListeners.push(listener as QuestionListenerPort)
    return () => { state.questionsDisposed += 1 }
  }
  return {
    remote: { ...fakeNamespaces(), session: fakeSessionRemote(), $on: on },
    get listeners() { return state.listeners },
    get questionListeners() { return state.questionListeners },
    get disposed() { return state.disposed },
    get questionsDisposed() { return state.questionsDisposed },
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
export function callEvent(callId: string, name: string, args: unknown, turn = 1): SessionEvent<'tool/call'> {
  return { type: 'tool/call', ...stamp(), data: { turn, step: 1, callId: ToolCallId(callId), name, arguments: JSON.stringify(args) } }
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
    skills: {
      list: vi.fn((_request: { sessionId: string }): ReturnType<RemotePort['skills']['list']> => ok({ skills: [] })),
    },
    schedule: {
      catalog: vi.fn((): ReturnType<RemotePort['schedule']['catalog']> => ok([])),
      history: vi.fn((_request: object): ReturnType<RemotePort['schedule']['history']> => ok({ records: [] })),
      update: vi.fn((_request: object): ReturnType<RemotePort['schedule']['update']> => ok({ updated: true })),
      delete: vi.fn((_request: object): ReturnType<RemotePort['schedule']['delete']> => ok({ deleted: true })),
    },
    goals: {
      get: vi.fn((_sessionId: string): ReturnType<RemotePort['goals']['get']> => ok(undefined)),
      create: vi.fn((_sessionId: string, _request: object): ReturnType<RemotePort['goals']['create']> => ok({ ref: { id: 'g1', revision: 1 } })),
      edit: vi.fn((_sessionId: string, _ref: object, _request: object): ReturnType<RemotePort['goals']['edit']> => ok(goalStub)),
      pause: vi.fn((_sessionId: string, _ref: object): ReturnType<RemotePort['goals']['pause']> => ok(goalStub)),
      resume: vi.fn((_sessionId: string, _ref: object): ReturnType<RemotePort['goals']['resume']> => ok(goalStub)),
      complete: vi.fn((_sessionId: string, _ref: object): ReturnType<RemotePort['goals']['complete']> => ok(goalStub)),
      clear: vi.fn((_sessionId: string, _ref: object): ReturnType<RemotePort['goals']['clear']> => ok({ id: 'g1', revision: 2 })),
    },
    subagents: {
      prompt: vi.fn((_request: object): ReturnType<RemotePort['subagents']['prompt']> => ok({ messageId: 'm1' })),
      interruptByParent: vi.fn((_child: string, _parent: string, _mode: 'continuable'): ReturnType<RemotePort['subagents']['interruptByParent']> => ok({ accepted: true as const })),
    },
    commands: {
      list: vi.fn((_sessionId: string): ReturnType<RemotePort['commands']['list']> => ok([])),
    },
    fileReferences: {
      list: vi.fn((_sessionId: string, _query: string): ReturnType<RemotePort['fileReferences']['list']> => ok([])),
    },
    sessionReferenceResolver: {
      candidates: vi.fn((_sessionId: string, _query: string): ReturnType<RemotePort['sessionReferenceResolver']['candidates']> => ok([])),
    },
    messageFeedback: {
      list: vi.fn((_request: object): ReturnType<RemotePort['messageFeedback']['list']> => ok({ ok: true as const, value: { items: [] } })),
      put: vi.fn((_request: object): ReturnType<RemotePort['messageFeedback']['put']> => ok({
        ok: true as const, value: { messageId: 'a1', rating: 'positive' as const, version: 'v1' },
      })),
      delete: vi.fn((_request: object): ReturnType<RemotePort['messageFeedback']['delete']> => ok({ ok: true as const })),
    },
    sessionFeedback: {
      record: vi.fn((_request: object): ReturnType<RemotePort['sessionFeedback']['record']> => ok({ ok: true as const })),
    },
    spendBudget: {
      summary: vi.fn((_sessionId: string): ReturnType<RemotePort['spendBudget']['summary']> => ok({
        session: { spentUsd: 0, unpricedCalls: 0 }, month: '2026-10', monthly: { spentUsd: 0, unpricedCalls: 0 },
      })),
    },
    userQuestions: {
      attachWait: vi.fn((_sessionId: string, _callId: string, _signal: AbortSignal): ReturnType<RemotePort['userQuestions']['attachWait']> => {
        const frames = (async function* () { /* no frames: the wait ended */ })()
        return frames as ReturnType<RemotePort['userQuestions']['attachWait']>
      }),
    },
  }
}

const goalStub = {
  id: 'g1', revision: 2, objective: 'Ship it', phase: 'active' as const, maxGoalRounds: 5, roundsStarted: 1, activation: 'armed' as const,
}

/** The client services the panels call, over mocks. */
export function fakeServices(): PanelServices & {
  jobs: Mocked<Omit<ClientServicesPort['jobs'], 'state'>> & {
    state: Cell<ReturnType<ClientServicesPort['jobs']['state']['getSnapshot']>>
    stopWatching: ReturnType<typeof vi.fn>
    stopObserving: ReturnType<typeof vi.fn>
  }
  workspaces: Mocked<Omit<ClientServicesPort['workspaces'], 'list'>> & { list: Cell<ReturnType<ClientServicesPort['workspaces']['list']['getSnapshot']>> }
  fileUpload: Mocked<ClientServicesPort['fileUpload']>
} {
  const workspaceView = (id: string, path: string): { workspaceId: string; path: string; title: string; sessionIds: string[] } => ({
    workspaceId: id, path, title: path.split('/').at(-1) ?? id, sessionIds: [],
  })
  const stopWatching = vi.fn()
  const stopObserving = vi.fn()
  const list = new Cell<ReturnType<ClientServicesPort['workspaces']['list']['getSnapshot']>>({
    items: [], archivedSessionIds: [], pinnedSessionIds: [], phase: 'ready',
  })
  return {
    jobs: {
      state: new Cell({ rows: {}, observed: {} }),
      stopWatching,
      watchRows: vi.fn((_sessionId: string) => stopWatching),
      stopObserving,
      observe: vi.fn((_sessionId: string | undefined, _id: string) => stopObserving),
      kill: vi.fn((_sessionId: string, _id: string) => ok({ outcome: 'requested' as const })),
    },
    workspaces: {
      list,
      create: vi.fn((input: { path: string }) => Promise.resolve(workspaceView('w-new', input.path))),
      rename: vi.fn((id: string, title: string) => Promise.resolve({ ...workspaceView(id, '/w'), title })),
      delete: vi.fn((_id: string) => Promise.resolve()),
      insertBefore: vi.fn((_id: string, _before?: string) => Promise.resolve()),
      createWorktree: vi.fn((_id: string, _options?: object) => Promise.resolve({
        workspace: workspaceView('w-tree', '/w-tree'), worktree: { branch: 'feature', baseRef: 'main', warnings: [] },
      })),
      listWorktrees: vi.fn((_id: string) => Promise.resolve({ worktrees: [] })),
      inspectWorktree: vi.fn((_id: string) => Promise.resolve({ linked: true, branch: 'feature', uncommitted: [] })),
      removeWorktree: vi.fn((_id: string, _options?: object) => Promise.resolve({ deleted: true as const, branch: 'feature', branchDeleted: true })),
      archiveSession: vi.fn((_id: string, _options?: object) => Promise.resolve()),
      unarchiveSession: vi.fn((_id: string) => Promise.resolve()),
      pinSession: vi.fn((_id: string) => Promise.resolve()),
      unpinSession: vi.fn((_id: string) => Promise.resolve()),
      insertSessionBefore: vi.fn((id: string, _session: string, _before?: string) => Promise.resolve(workspaceView(id, '/w'))),
    },
    fileUpload: {
      upload: vi.fn((_sessionId: string, _data: Uint8Array, name?: string) => ok({
        receiptId: 'receipt-1', file: { name: name ?? 'file', bytes: 3 },
      })),
    },
  }
}

/** A panel context over mocks; `overrides` replace whole members. */
export function fakePanelContext(overrides: Partial<PanelContext> = {}): PanelContext & {
  services: ReturnType<typeof fakeServices>
  session: PanelContext['session'] & { prompt: ReturnType<typeof vi.fn>; updateQueue: ReturnType<typeof vi.fn>; insertText: ReturnType<typeof vi.fn> }
  files: ReturnType<typeof fakeFiles>
  leave: ReturnType<typeof vi.fn>
  remote: ReturnType<typeof fakeNamespaces> & { session: ReturnType<typeof fakeSessionRemote> }
} {
  const projections = new Map<string, unknown>()
  const session = {
    sessionId: 'session-3f9a0c1e-0000',
    cwd: '/work/app',
    home: '/home/me' as string | undefined,
    running: () => false,
    events: () => [] as TranscriptEvent[],
    projection: (key: string) => projections.get(key),
    prompt: vi.fn((_content: unknown, _mode: unknown) => Promise.resolve(accepted)),
    updateQueue: vi.fn((_itemId: string, _action: QueueActionPort) => Promise.resolve(accepted)),
    insertText: vi.fn((_text: string) => {}),
    ...overrides.session,
  }
  return {
    remote: { ...fakeNamespaces(), session: fakeSessionRemote() } as never,
    services: fakeServices(),
    files: fakeFiles(),
    style: plain,
    now: () => 10_000_000,
    timeZone: 'UTC',
    sessions: () => [],
    leave: vi.fn(),
    ...overrides,
    session,
  } as never
}

/** A panel context whose session shows the given events. */
export function withEvents(events: readonly TranscriptEvent[]): ReturnType<typeof fakePanelContext> {
  const ctx = fakePanelContext()
  Object.assign(ctx.session, { events: () => events })
  return ctx
}

/** The projection values of a context from {@link fakePanelContext}, set by key. */
export function withProjection(context: { session: { projection: (key: string) => unknown } }, values: Record<string, unknown>): void {
  Object.assign(context.session, { projection: (key: string) => values[key] })
}

const namespaceStub: SettingsNamespacePort = { ns: 'x', schema: {}, value: {}, secrets: [], revision: 1 }
const changed: ChangeResultPort = { changed: true, application: 'applied', target: 't' }

/** A configuration flow's questions answered from a script; unanswered questions leave the screen. */
export function scriptedUi(answers: readonly unknown[]) {
  const queue = [...answers]
  const log: { kind: string; text: string; items?: readonly PickerItem[]; options?: PromptOptions | undefined }[] = []
  const next = (): unknown => queue.shift()
  const ui: FlowUi = {
    pick: (title, items) => { log.push({ kind: 'pick', text: title, items }); return Promise.resolve(resolveItem(next(), items)) },
    pickMany: (title, items) => { log.push({ kind: 'pickMany', text: title, items }); return Promise.resolve(next() as string[] | undefined) },
    ask: (label, options) => { log.push({ kind: 'ask', text: label, options }); return Promise.resolve(next() as string | undefined) },
    info: (text) => { log.push({ kind: 'info', text }) },
    show: (lines) => { log.push({ kind: 'show', text: lines.join('\n') }) },
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
