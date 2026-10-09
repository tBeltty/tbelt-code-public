/**
 * The terminal's carrier against the GUI's. One scenario drives a real client
 * (Connection, Gateway, Remote proxies, Session controller) through the Remote
 * methods the terminal uses, once over the decoded logical carrier the GUI's
 * whole-client specs use and once over the in-process carrier, which encodes
 * every call through the real Host Connection. The scenario asserts the same
 * Host-side calls and the same client-side results on both.
 *
 * The client test runtime and the Remote mock reach Client sources whose Context
 * declarations cannot share a TypeScript program with Host code, so both load
 * through computed specifiers and are typed by the structural interfaces below.
 */
import { Context } from '@deepseek-ai/cordis'
import { apply as connectionApply, inject as connectionInject } from '@deepseek-ai/dsh-client-connection'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session/types'
import { describe, expect, onTestFinished, type Mock, type TestAPI, vi } from 'vitest'
import { createInProcessTransport } from '../src/carrier.ts'
import type { InProcessTransport } from '../src/carrier.ts'
import type { ApprovalOutcomePort, ClientServicesPort, SessionBindingPort } from '../src/ports.ts'
import { assistantEvent, userEvent } from './fakes.ts'

/** What a Host Connection interceptor returns. */
type InterceptResult = ReturnType<Parameters<HostConnectionHandle['rpc']['intercept']>[2]>

/** What the scenario reads of the Remote mock. */
interface RemoteMock {
  readonly rpc: {
    call(path: string, endpoint: string, payload: unknown, signal?: AbortSignal): InterceptResult
    open?(
      path: string, endpoint: string, payload: unknown, signal: AbortSignal | undefined, uplink: AsyncIterable<unknown>,
    ): AsyncIterable<unknown>
  }
  readonly remote: Record<string, Record<string, Mock>>
  readonly streams: { push(endpoint: string, value: unknown): void; drained(endpoint: string): Promise<void> }
  unary(endpoint: string, result: unknown): void
  stream(endpoint: string, script: (args: unknown[], stream: { push(value: unknown): void }) => void): void
}

/** What the scenario reads of the client test runtime. */
interface ClientRuntime {
  readonly createClientTest: (plan: unknown, options?: unknown) => TestAPI<{ mock: RemoteMock; start: () => Promise<TestClient> }>
  readonly webApp: { closure(names: string[]): unknown }
}

interface TestClient {
  readonly ctx: {
    readonly sessions: ClientServicesPort['sessions']
    readonly remote: ClientServicesPort['remote']
    readonly jobs: ClientServicesPort['jobs']
    readonly workspaces: ClientServicesPort['workspaces']
    readonly fileUpload: ClientServicesPort['fileUpload']
  }
}

const RUNTIME_SPECIFIER: string = '@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts'
const MOCK_SPECIFIER: string = '@deepseek-ai/dsh-remote-mock'
const { ok } = await import(MOCK_SPECIFIER) as { ok: (value: unknown) => unknown }
const { createClientTest, webApp } = await import(RUNTIME_SPECIFIER) as ClientRuntime
const roster = webApp.closure([
  '@deepseek-ai/dsh-api-session-controller',
  '@deepseek-ai/dsh-api-job-controller',
  '@deepseek-ai/dsh-api-workspace-controller',
  '@deepseek-ai/dsh-client-file-upload',
])

/** Carrier hooks of the in-process transport over the real Host Connection, answering from the same mock. */
function terminalCarrier(mock: RemoteMock): InProcessTransport {
  const mounted = (async () => {
    const ctx = new Context()
    ctx.provide('credentials', {
      readRecord: () => Promise.resolve(undefined),
      modifyRecord: async (_key: unknown, mutate: (current: undefined) => Promise<unknown>) => await mutate(undefined),
      deleteRecord: () => Promise.resolve(),
    })
    const fiber = ctx.plugin({ inject: [...connectionInject], apply: connectionApply })
    await fiber.await()
    onTestFinished(() => fiber.dispose())
    const connection = ctx.get('connection') as HostConnectionHandle
    connection.rpc.intercept('/api', () => true, (endpoint, payload, signal) => mock.rpc.call('/api', endpoint, payload, signal))
    return connection.createSharedFetchHandler('/api')
  })()
  return createInProcessTransport(
    { fetch: async request => (await mounted).fetch(request) },
    {
      open: (endpoint, payload, uplink, _peer, signal) => Promise.resolve(mock.rpc.open!('/api', endpoint, payload, signal, uplink)),
      failure: error => ({ code: 'internal', message: error instanceof Error ? error.message : String(error), details: {} }),
    },
  )
}

const namespace = { ns: 'llm-pi-ai', schema: { type: 'object', dict: {} }, value: {}, secrets: [], revision: 2 }
const change = { changed: true, application: 'applied', target: 'web' }

const OLD = 'session-old'
const history = [userEvent('earlier question'), assistantEvent('earlier answer')]
const wire = (event: unknown) => ({ type: 'event', event })

/** Script the Host side of the session methods the terminal uses. */
function scriptHost(mock: RemoteMock): void {
  mock.unary('session/list', ok({ items: [{ sessionId: OLD, updatedAt: 5, running: false, blank: false, agentAvailable: true, cwd: '/work/app' }] }))
  mock.unary('session/create', ok({ sessionId: 'session-new' }))
  mock.unary('session/prompt', ok({ accepted: true }))
  mock.unary('session/cancel', ok({ accepted: true }))
  mock.unary('session/attachment', ok({
    attachment: { attachmentId: 'att-1', mediaType: 'image/png', bytes: 3, width: 1, height: 1 },
    data: 'QUJD',
  }))
  mock.unary('session/rename', ok({ title: 'Fix the build', seq: 9 }))
  mock.unary('session/modelCatalog', ok({
    default: { provider: 'p1', model: 'm1' },
    routableProviders: ['p1'],
    groups: [{ id: 'p1', name: 'Provider One', models: [{ id: 'm1', name: 'Model One' }, { id: 'm2', name: 'Model Two' }] }],
    failures: [],
  }))
  mock.unary('session/selectModel', ok({ selected: { provider: 'p1', model: 'm2' } }))
  mock.unary('session/setDefaultModel', ok({ selected: { provider: 'p1', model: 'm2' } }))
  mock.unary('llm/listProviders', ok([{ id: 'acme', name: 'Acme' }]))
  mock.unary('llm/listConfigurableProviders', ok([{ provider: 'acme', displayName: 'Acme', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'acme'] }]))
  mock.unary('llm/discoverModels', ok([{ id: 'm1' }]))
  mock.unary('credentials/describe', ok({ ACME_API_KEY: { configured: true, writable: true } }))
  mock.unary('credentials/set', ok({}))
  mock.unary('credentials/unset', ok({}))
  mock.unary('settings/describe', ok({ writable: true, namespaces: [namespace] }))
  mock.unary('settings/update', ok(namespace))
  mock.unary('settings/mutate', ok(namespace))
  mock.unary('settings/openSettingsDocument', ok({ opened: true }))
  mock.unary('web/searchProviders', ok([{ id: 'brave', credentialRef: 'BRAVE' }]))
  mock.unary('web/checkSearchKey', ok({ ok: true }))
  mock.unary('pluginManager/listBundles', ok([{ name: 'web', enabled: true, installed: true, optional: false, removable: true }]))
  mock.unary('pluginManager/listPlugins', ok([{ entryId: 'e1', moduleName: 'mod', enabled: true }]))
  mock.unary('pluginManager/inspect', ok({ status: 'refused', problem: 'p', reason: 'r' }))
  mock.unary('pluginManager/setBundleEnabled', ok(change))
  mock.unary('pluginManager/setPluginEnabled', ok(change))
  mock.unary('pluginManager/installBundle', ok(change))
  mock.unary('pluginManager/removeBundle', ok(change))
  mock.unary('agentPresets/list', ok({ presets: [{ id: 'build', isDefault: true }] }))
  mock.unary('agentPresets/read', ok({ content: 'prompt' }))
  mock.unary('agentPresets/select', ok({}))
  mock.unary('permissionPresets/catalog', ok({ options: [{ value: 'default', name: 'Default' }], defaultOptions: [], defaultPreset: 'default' }))
  mock.unary('session/projections', ok({ asOfSeq: -1, values: { subagentCatalog: [] } }))
  mock.unary('session/page', ok({ records: history.map(wire), hasMore: false }))
  mock.unary('$events/result', ok(undefined))
  mock.unary('commands/execute', ok(undefined))
  mock.unary('skills/list', ok({ skills: [{ name: 'review', description: 'Review changes' }] }))
  mock.unary('commands/list', ok([{ name: 'review', description: 'Review changes' }]))
  mock.unary('schedule/catalog', ok([]))
  mock.unary('goals/get', ok(undefined))
  mock.unary('fileReferences/list', ok([{ path: 'src/app.ts', kind: 'file' }]))
  mock.unary('sessionReferenceResolver/candidates', ok([]))
  mock.unary('messageFeedback/list', ok({ ok: true, value: { items: [] } }))
  mock.unary('sessionFeedback/record', ok({ ok: true }))
  mock.unary('session/fork', ok({ sessionId: 'session-forked' }))
  mock.unary('session/canOpenWorkspacePath', ok(true))
  mock.stream('session/follow', ([request], stream) => {
    const id = (request as { address: { sessionId: string } }).address.sessionId
    stream.push({
      type: 'snapshot',
      header: { version: SESSION_FORMAT_VERSION, id, createdAt: 0, isSeeded: false },
      cursor: history.at(-1)!.seq,
      records: history.map(wire),
      hasMore: false,
      projections: { asOfSeq: history.at(-1)!.seq, values: {} },
      assistantStream: { revision: 0 },
    })
  })
}

/** What each carrier must show the client and the Host. */
async function exercise(client: TestClient, mock: RemoteMock): Promise<void> {
  const { sessions, remote } = client.ctx
  await vi.waitFor(() => { expect(sessions.list.getSnapshot().phase).toBe('ready') })
  expect(sessions.list.getSnapshot().byId[OLD]).toMatchObject({ cwd: '/work/app', blank: false })

  await expect(sessions.create({ cwd: '/work/app' })).resolves.toBe('session-new')
  expect(mock.remote['session']!['create']).toHaveBeenCalledWith({ cwd: '/work/app' })

  const reference = sessions.retain(OLD, { source: 'contract' })
  const binding: SessionBindingPort = await reference.ready
  await vi.waitFor(() => { expect(binding.eventSource.getSnapshot().entries.length).toBe(history.length) })
  expect(binding.eventSource.getSnapshot().entries.map(entry => entry.event.type)).toEqual(['user/message', 'assistant/message'])

  const live = assistantEvent('a live reply', 2, 1)
  mock.streams.push('session/follow', wire(live))
  await mock.streams.drained('session/follow')
  await vi.waitFor(() => { expect(binding.eventSource.getSnapshot().entries.at(-1)?.event).toMatchObject({ type: 'assistant/message' }) })

  await expect(binding.session.prompt([{ type: 'text', text: 'run the tests' }], 'queue')).resolves.toMatchObject({ ok: true })
  expect(mock.remote['session']!['prompt']).toHaveBeenCalledOnce()
  expect(JSON.stringify(vi.mocked(mock.remote['session']!['prompt']!).mock.calls[0])).toContain('run the tests')

  const picture = { type: 'image', mediaType: 'image/png', data: 'QUJD', name: 'shot.png' } as const
  await expect(binding.session.prompt([{ type: 'text', text: 'what is this' }, picture], 'queue')).resolves.toMatchObject({ ok: true })
  expect(vi.mocked(mock.remote['session']!['prompt']!).mock.calls[1]![0]).toMatchObject({ content: [{ type: 'text' }, picture] })

  await expect(binding.session.readAttachment('att-1')).resolves.toMatchObject({
    ok: true, value: { attachment: { mediaType: 'image/png' }, data: Uint8Array.from([65, 66, 67]) },
  })
  expect(mock.remote['session']!['attachment']).toHaveBeenCalledWith({ sessionId: OLD, attachmentId: 'att-1' })

  await expect(binding.session.rename('Fix the build')).resolves.toMatchObject({ ok: true, value: { title: 'Fix the build' } })
  expect(mock.remote['session']!['rename']).toHaveBeenCalledWith({ sessionId: OLD, title: 'Fix the build' })
  await vi.waitFor(() => { expect(sessions.list.getSnapshot().byId[OLD]?.title).toBe('Fix the build') })

  const catalog = await remote.session.modelCatalog()
  expect(catalog).toMatchObject({ ok: true, value: { default: { provider: 'p1', model: 'm1' } } })
  await expect(remote.session.selectModel({ sessionId: OLD, provider: 'p1', model: 'm2' })).resolves.toMatchObject({
    ok: true, value: { selected: { provider: 'p1', model: 'm2' } },
  })
  expect(mock.remote['session']!['selectModel']).toHaveBeenCalledWith({ sessionId: OLD, provider: 'p1', model: 'm2' })

  await expect(binding.session.cancel()).resolves.toMatchObject({ ok: true })
  expect(mock.remote['session']!['cancel']).toHaveBeenCalledOnce()

  await expect(binding.session.command('/compact')).resolves.toMatchObject({ ok: true, value: { matched: false } })

  const outcomes: ApprovalOutcomePort[] = []
  const stop = remote.$on('approval/request', async function (request, next) {
    if (sessions.scopeOf(this) !== OLD) return await next()
    expect(request).toMatchObject({ toolName: 'bash', reason: 'run the tests' })
    outcomes.push('allowed-once')
    return 'allowed-once'
  })
  mock.streams.push('$events', { type: 'waterfall', event: 'approval/request', eventId: 'event-1', agentId: OLD, request: { toolName: 'bash', callId: 'c1', reason: 'run the tests' } })
  await vi.waitFor(() => { expect(mock.remote['$events']!['result']).toHaveBeenCalledOnce() })
  expect(vi.mocked(mock.remote['$events']!['result']!).mock.calls[0]![0]).toMatchObject({ eventId: 'event-1', outcome: { kind: 'result', value: 'allowed-once' } })
  expect(outcomes).toEqual(['allowed-once'])
  stop()

  const asked: unknown[] = []
  const stopQuestions = remote.$on('user-questions/request', async function (request, next) {
    if (sessions.scopeOf(this) !== OLD) return await next()
    asked.push(request.questions)
    return { answers: [{ id: 'mode', selected: ['Careful'] }] }
  })
  mock.streams.push('$events', {
    type: 'waterfall', event: 'user-questions/request', eventId: 'event-2', agentId: OLD,
    request: { questions: [{ id: 'mode', question: 'Which mode?', options: [{ label: 'Fast' }, { label: 'Careful' }] }], wait: { callId: 'c2' } },
  })
  await vi.waitFor(() => { expect(mock.remote['$events']!['result']).toHaveBeenCalledTimes(2) })
  expect(vi.mocked(mock.remote['$events']!['result']!).mock.calls[1]![0]).toMatchObject({
    eventId: 'event-2', outcome: { kind: 'result', value: { answers: [{ id: 'mode', selected: ['Careful'] }] } },
  })
  expect(asked).toEqual([[{ id: 'mode', question: 'Which mode?', options: [{ label: 'Fast' }, { label: 'Careful' }] }]])
  stopQuestions()
  reference.release()
}

/** The configuration methods of phase 4: each reaches the Host with its arguments and returns the Host's answer. */
async function exerciseConfig(client: TestClient, mock: RemoteMock): Promise<void> {
  const { remote } = client.ctx
  const calls = (path: string, endpoint: string): unknown[][] => vi.mocked(mock.remote[path]![endpoint]!).mock.calls

  await expect(remote.session.setDefaultModel({ provider: 'p1', model: 'm2' })).resolves.toMatchObject({ ok: true })
  expect(calls('session', 'setDefaultModel')[0]![0]).toEqual({ provider: 'p1', model: 'm2' })

  await expect(remote.llm.listProviders()).resolves.toMatchObject({ ok: true, value: [{ id: 'acme' }] })
  await expect(remote.llm.listConfigurableProviders()).resolves.toMatchObject({ ok: true, value: [{ provider: 'acme', settingsNs: 'llm-pi-ai' }] })
  await expect(remote.llm.discoverModels('llm-pi-ai', { provider: 'acme', apiKey: 'sk-1', live: true })).resolves.toMatchObject({ ok: true, value: [{ id: 'm1' }] })
  expect(JSON.stringify(calls('llm', 'discoverModels')[0])).toContain('"live":true')

  await expect(remote.credentials.describe(['ACME_API_KEY'])).resolves.toMatchObject({ ok: true, value: { ACME_API_KEY: { configured: true } } })
  await expect(remote.credentials.set('ACME_API_KEY', 'sk-1')).resolves.toMatchObject({ ok: true })
  await expect(remote.credentials.unset('ACME_API_KEY')).resolves.toMatchObject({ ok: true })
  expect(calls('credentials', 'set')[0]).toEqual(['ACME_API_KEY', 'sk-1'])
  expect(calls('credentials', 'unset')[0]).toEqual(['ACME_API_KEY'])

  await expect(remote.settings.describe()).resolves.toMatchObject({ ok: true, value: { writable: true, namespaces: [{ ns: 'llm-pi-ai' }] } })
  await expect(remote.settings.update('llm-pi-ai', { x: 1 }, undefined)).resolves.toMatchObject({ ok: true })
  await expect(remote.settings.mutate('llm-pi-ai', [{ op: 'unset', path: ['providers', 'acme'] }], 2)).resolves.toMatchObject({ ok: true, value: { revision: 2 } })
  expect(JSON.stringify(calls('settings', 'mutate')[0])).toContain('"providers"')
  await expect(remote.settings.openSettingsDocument()).resolves.toMatchObject({ ok: true, value: { opened: true } })

  await expect(remote.web.searchProviders()).resolves.toMatchObject({ ok: true, value: [{ id: 'brave' }] })
  await expect(remote.web.checkSearchKey('brave', 'key')).resolves.toMatchObject({ ok: true, value: { ok: true } })

  await expect(remote.pluginManager.listBundles()).resolves.toMatchObject({ ok: true, value: [{ name: 'web' }] })
  await expect(remote.pluginManager.listPlugins()).resolves.toMatchObject({ ok: true, value: [{ entryId: 'e1' }] })
  await expect(remote.pluginManager.inspect('pkg')).resolves.toMatchObject({ ok: true, value: { status: 'refused' } })
  await expect(remote.pluginManager.setBundleEnabled('web', false)).resolves.toMatchObject({ ok: true, value: { application: 'applied' } })
  await expect(remote.pluginManager.setPluginEnabled('e1', false)).resolves.toMatchObject({ ok: true })
  await expect(remote.pluginManager.installBundle('pkg')).resolves.toMatchObject({ ok: true })
  await expect(remote.pluginManager.removeBundle('web')).resolves.toMatchObject({ ok: true })
  expect(calls('pluginManager', 'setBundleEnabled')[0]).toEqual(['web', false])

  await expect(remote.agentPresets.list()).resolves.toMatchObject({ ok: true, value: { presets: [{ id: 'build' }] } })
  await expect(remote.agentPresets.read('build')).resolves.toMatchObject({ ok: true, value: { content: 'prompt' } })
  await expect(remote.agentPresets.select(OLD, 'build')).resolves.toMatchObject({ ok: true })
  expect(calls('agentPresets', 'select')[0]).toEqual([OLD, 'build'])

  await expect(remote.permissionPresets.catalog()).resolves.toMatchObject({ ok: true, value: { defaultPreset: 'default' } })
}

/** The namespaces and services of the panels: each reaches the Host with its arguments and returns the Host's answer. */
async function exercisePanels(client: TestClient, mock: RemoteMock): Promise<void> {
  const { remote, jobs, workspaces, fileUpload } = client.ctx
  const calls = (path: string, endpoint: string): unknown[][] => vi.mocked(mock.remote[path]![endpoint]!).mock.calls

  await expect(remote.skills.list({ sessionId: OLD })).resolves.toMatchObject({ ok: true, value: { skills: [{ name: 'review' }] } })
  expect(calls('skills', 'list')[0]).toEqual([{ sessionId: OLD }])
  await expect(remote.commands.list(OLD)).resolves.toMatchObject({ ok: true, value: [{ name: 'review' }] })
  expect(calls('commands', 'list')[0]).toEqual([OLD])
  await expect(remote.schedule.catalog()).resolves.toMatchObject({ ok: true, value: [] })
  await expect(remote.goals.get(OLD)).resolves.toMatchObject({ ok: true })
  expect(calls('goals', 'get')[0]).toEqual([OLD])
  await expect(remote.fileReferences.list(OLD, 'sr')).resolves.toMatchObject({ ok: true, value: [{ path: 'src/app.ts', kind: 'file' }] })
  expect(calls('fileReferences', 'list')[0]).toEqual([OLD, 'sr'])
  await expect(remote.sessionReferenceResolver.candidates(OLD, 'sr')).resolves.toMatchObject({ ok: true, value: [] })
  await expect(remote.messageFeedback.list({ sessionId: OLD })).resolves.toMatchObject({ ok: true, value: { ok: true } })
  await expect(remote.sessionFeedback.record({ sessionId: OLD, text: 'good' })).resolves.toMatchObject({ ok: true, value: { ok: true } })
  expect(calls('sessionFeedback', 'record')[0]).toEqual([{ sessionId: OLD, text: 'good' }])
  await expect(remote.session.fork({ sessionId: OLD, atSeq: 4 })).resolves.toMatchObject({ ok: true, value: { sessionId: 'session-forked' } })
  expect(calls('session', 'fork')[0]).toEqual([{ sessionId: OLD, atSeq: 4 }])
  await expect(remote.session.canOpenWorkspacePath()).resolves.toMatchObject({ ok: true, value: true })

  expect(jobs.state.getSnapshot()).toMatchObject({ rows: {}, observed: {} })
  expect(workspaces.list.getSnapshot()).toMatchObject({ items: [], phase: 'ready' })
  expect(typeof jobs.watchRows).toBe('function')
  expect(typeof fileUpload.upload).toBe('function')
}

describe('Remote carriers, phase 2 to 4 methods', () => {
  const gui = createClientTest({ roster })
  gui('over the decoded logical carrier of the GUI', async ({ mock, start }) => {
    scriptHost(mock)
    const client = await start()
    await exercise(client, mock)
    await exerciseConfig(client, mock)
    await exercisePanels(client, mock)
  }, 60_000)

  const terminal = createClientTest({ roster }, { carrier: terminalCarrier })
  terminal('over the in-process carrier of the terminal', async ({ mock, start }) => {
    scriptHost(mock)
    const client = await start()
    await exercise(client, mock)
    await exerciseConfig(client, mock)
    await exercisePanels(client, mock)
  }, 60_000)
})
