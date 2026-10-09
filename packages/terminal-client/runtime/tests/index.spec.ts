import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply, Config, inject, name } from '../src/index.ts'
import type { ClientTree } from '../src/client-tree.ts'
import type { TerminalRun } from '../src/runner.ts'

const hoisted = vi.hoisted(() => ({
  boot: vi.fn(),
  sources: vi.fn(),
  run: vi.fn(),
  transport: vi.fn(),
}))

vi.mock('../src/client-tree.ts', () => ({ bootClientTree: hoisted.boot, installedSources: hoisted.sources }))
vi.mock('../src/runner.ts', () => ({ runTerminal: hoisted.run }))
vi.mock('../src/carrier.ts', () => ({ createInProcessTransport: hoisted.transport }))

interface Fake {
  readonly ctx: Parameters<typeof apply>[0]
  readonly exits: number[]
  readonly disposers: (() => unknown)[]
  readonly handler: { fetch: unknown }
  readonly wire: unknown
}

function fakeContext(provideExit = true): Fake {
  const exits: number[] = []
  const disposers: (() => unknown)[] = []
  const handler = { fetch: vi.fn() }
  const wire = { open: vi.fn() }
  const services: Record<string, unknown> = {
    connection: { createSharedFetchHandler: (path: string) => (path === '/api' ? handler : undefined) },
    typertGateway: { wireStream: wire },
    ...provideExit ? { appExit: (code: number) => exits.push(code) } : {},
  }
  const ctx = {
    get: (service: string) => services[service],
    effect: (setup: () => () => unknown) => { disposers.push(setup()) },
  } as Parameters<typeof apply>[0]
  return { ctx, exits, disposers, handler, wire }
}

/** A complete plugin config; the schema fills these defaults in production. */
const config = (over: Partial<Parameters<typeof apply>[1]> = {}): Parameters<typeof apply>[1] =>
  ({ continueLatest: false, images: 'auto', imageMaxBytes: 1024, fileMaxBytes: 2048, title: 'auto', titleFrameMs: 500, ...over })

/** Lets the start-up chain, which includes a directory check on the real file system, run to its end. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 25))

afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

function tree(): ClientTree & { disposed: number } {
  const state = { disposed: 0, services: { sessions: {}, remote: {} } as ClientTree['services'] }
  return {
    services: state.services,
    dispose: () => { state.disposed += 1; return Promise.resolve() },
    get disposed() { return state.disposed },
  }
}

describe('terminal-client plugin', () => {
  it('declares the services it connects to and a config with defaults', () => {
    expect(name).toBe('terminal-client')
    expect(inject).toEqual(['connection', 'typertGateway'])
    expect(Config({ continueLatest: true } as never)).toEqual({
      continueLatest: true, images: 'auto', imageMaxBytes: 20 * 1024 * 1024, fileMaxBytes: 20 * 1024 * 1024, title: 'auto', titleFrameMs: 500,
    })
    expect(Config({ cwd: '~/app', images: 'off' } as never)).toMatchObject({ cwd: '~/app', images: 'off', continueLatest: false })
    expect(() => Config({ images: 'sixel' } as never)).toThrow()
    expect(() => Config({ title: 'always' } as never)).toThrow()
    expect(() => Config({ titleFrameMs: 10 } as never)).toThrow()
  })

  it('requires the launcher exit request', () => {
    expect(() => apply(fakeContext(false).ctx, config())).toThrow('must provide ctx.appExit')
  })

  it('connects over the Host halves, runs the terminal and stops both on disposal', async () => {
    const fake = fakeContext()
    const started = tree()
    const run: TerminalRun = { stop: vi.fn() }
    hoisted.sources.mockResolvedValue('sources')
    hoisted.boot.mockResolvedValue(started)
    hoisted.run.mockResolvedValue(run)
    vi.stubEnv('NO_COLOR', '1')
    apply(fake.ctx, config({ resume: '3f9a', continueLatest: false }))
    await settle()
    expect(hoisted.transport).toHaveBeenCalledWith(fake.handler, fake.wire)
    expect(hoisted.boot).toHaveBeenCalledWith(undefined, 'sources')
    const [services, env, request] = hoisted.run.mock.calls[0]!
    expect(services).toBe(started.services)
    expect(env).toMatchObject({
      stdin: process.stdin, stdout: process.stdout, cwd: process.cwd(), color: false, exit: expect.any(Function), imageProtocol: 'none',
      files: { readAttachment: expect.any(Function), isDirectory: expect.any(Function) }, now: Date.now,
    })
    expect(request).toEqual({ resume: '3f9a', continueLatest: false })
    await fake.disposers[0]!()
    expect(run.stop).toHaveBeenCalledOnce()
    expect(started.disposed).toBe(1)
  })

  it('starts in the --cwd directory, expanding ~ and resolving it against the working directory', async () => {
    const home = process.env['HOME'] ?? ''
    hoisted.boot.mockResolvedValue(tree())
    hoisted.run.mockResolvedValue({ stop: vi.fn() })
    apply(fakeContext().ctx, config({ cwd: '..' }))
    await settle()
    expect(hoisted.run.mock.calls[0]![1]).toMatchObject({ cwd: resolve(process.cwd(), '..') })
    apply(fakeContext().ctx, config({ cwd: '~' }))
    await settle()
    expect(hoisted.run.mock.calls[1]![1]).toMatchObject({ cwd: home })
  })

  it('fails before booting when --cwd is not a directory', async () => {
    const fake = fakeContext()
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    apply(fake.ctx, config({ cwd: '/definitely/not/here' }))
    await settle()
    expect(write).toHaveBeenCalledWith('No directory at /definitely/not/here.\n')
    expect(fake.exits).toEqual([1])
    expect(hoisted.boot).not.toHaveBeenCalled()
    write.mockRestore()
  })

  it('draws images with the protocol the setting names or the environment shows', async () => {
    hoisted.boot.mockResolvedValue(tree())
    hoisted.run.mockResolvedValue({ stop: vi.fn() })
    vi.stubEnv('TERM_PROGRAM', 'iTerm.app')
    apply(fakeContext().ctx, config())
    apply(fakeContext().ctx, config({ images: 'off' }))
    apply(fakeContext().ctx, config({ images: 'kitty' }))
    await settle()
    expect(hoisted.run.mock.calls.map(call => (call[1] as { imageProtocol: string }).imageProtocol)).toEqual(['iterm2', 'none', 'kitty'])
  })

  it('keeps the window title in step with the session, with the Orca marker only inside an Orca pane', async () => {
    hoisted.boot.mockResolvedValue(tree())
    hoisted.run.mockResolvedValue({ stop: vi.fn() })
    vi.stubEnv('ORCA_PANE_KEY', '')
    apply(fakeContext().ctx, config({ titleFrameMs: 250 }))
    await settle()
    vi.stubEnv('ORCA_PANE_KEY', 'tab-1:0')
    apply(fakeContext().ctx, config())
    await settle()
    apply(fakeContext().ctx, config({ title: 'off' }))
    await settle()
    expect(hoisted.run.mock.calls.map(call => (call[1] as { hostTitle: unknown }).hostTitle)).toEqual([
      { marker: false, frameIntervalMs: 250 },
      { marker: true, frameIntervalMs: 500 },
      undefined,
    ])
  })

  it('enables color only on a color terminal without NO_COLOR', async () => {
    const fake = fakeContext()
    hoisted.boot.mockResolvedValue(tree())
    hoisted.run.mockResolvedValue({ stop: vi.fn() })
    vi.stubEnv('NO_COLOR', '')
    delete process.env['NO_COLOR']
    Object.defineProperty(process.stdout, 'hasColors', { value: () => true, configurable: true })
    try {
      apply(fake.ctx, config({ continueLatest: true }))
      await settle()
      expect(hoisted.run.mock.calls[0]![1]).toMatchObject({ color: true })
    } finally {
      Reflect.deleteProperty(process.stdout, 'hasColors')
    }
  })

  it('reports a failed start on standard error and exits with 1', async () => {
    const fake = fakeContext()
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    hoisted.boot.mockRejectedValueOnce(new Error('no connection'))
    apply(fake.ctx, config())
    await settle()
    hoisted.boot.mockRejectedValueOnce('plain failure')
    apply(fakeContext().ctx, config())
    await settle()
    expect(write).toHaveBeenCalledWith('no connection\n')
    expect(write).toHaveBeenCalledWith('plain failure\n')
    expect(fake.exits).toEqual([1])
    write.mockRestore()
  })

  it('tears the client tree down when the Host stops before the terminal starts', async () => {
    const fake = fakeContext()
    const started = tree()
    let release: (value: ClientTree) => void = () => {}
    hoisted.boot.mockReturnValue(new Promise<ClientTree>((resolve) => { release = resolve }))
    apply(fake.ctx, config())
    await vi.waitFor(() => { expect(hoisted.boot).toHaveBeenCalled() })
    await fake.disposers[0]!()
    release(started)
    await settle()
    expect(started.disposed).toBe(1)
    expect(hoisted.run).not.toHaveBeenCalled()
  })

  it('does not boot when the Host stops while the directory is checked', async () => {
    const fake = fakeContext()
    apply(fake.ctx, config())
    await fake.disposers[0]!()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(hoisted.boot).not.toHaveBeenCalled()
    expect(hoisted.run).not.toHaveBeenCalled()
  })

  it('stops a terminal that finished starting after the Host stopped', async () => {
    const fake = fakeContext()
    const started = tree()
    const run: TerminalRun = { stop: vi.fn() }
    let release: (value: TerminalRun) => void = () => {}
    hoisted.boot.mockResolvedValue(started)
    hoisted.run.mockReturnValue(new Promise<TerminalRun>((resolve) => { release = resolve }))
    apply(fake.ctx, config())
    await settle()
    await fake.disposers[0]!()
    release(run)
    await settle()
    expect(run.stop).toHaveBeenCalledOnce()
  })
})
