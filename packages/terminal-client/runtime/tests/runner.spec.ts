import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { runTerminal } from '../src/runner.ts'
import type { RunnerEnvironment, RunnerInput, RunnerOutput } from '../src/runner.ts'
import type { ClientServicesPort, SessionBindingPort, SessionListPort } from '../src/ports.ts'
import { Cell, fakeBinding, fakeFiles, fakeRemote, fakeServices, fakeSessions, visible } from './fakes.ts'

class FakeInput extends EventEmitter implements RunnerInput {
  isTTY: boolean | undefined = true
  rawModes: boolean[] = []
  paused = false
  encoding: string | undefined
  setRawMode?: (enabled: boolean) => unknown = (enabled: boolean) => { this.rawModes.push(enabled) }
  setEncoding(encoding: 'utf8'): void { this.encoding = encoding }
  resume(): void { this.paused = false }
  pause(): void { this.paused = true }
}

class FakeOutput extends EventEmitter implements RunnerOutput {
  isTTY: boolean | undefined = true
  columns: number | undefined = 100
  text = ''
  write(chunk: string): void { this.text += chunk }
}

interface Rig {
  readonly stdin: FakeInput
  readonly stdout: FakeOutput
  readonly env: RunnerEnvironment
  readonly exits: number[]
}

function rig(overrides: Partial<RunnerEnvironment> = {}): Rig {
  const stdin = new FakeInput()
  const stdout = new FakeOutput()
  const exits: number[] = []
  return { stdin, stdout, exits, env: { stdin, stdout, cwd: '/work/app', home: '/home/me', color: false, exit: code => exits.push(code), files: fakeFiles(), imageProtocol: 'none', now: () => 10_000_000, ...overrides } }
}

const row = (id: string, extra: Partial<SessionListPort['byId'][string]> = {}) => ({ id, cwd: '/work/app', blank: false, updatedAt: 1, ...extra })

function listOf(...rows: ReturnType<typeof row>[]): SessionListPort {
  return { phase: 'ready', ids: rows.map(item => item.id), byId: Object.fromEntries(rows.map(item => [item.id, item])) }
}

function services(list: SessionListPort | Cell<SessionListPort>, binding: SessionBindingPort) {
  const released: string[] = []
  const retained: [string, string][] = []
  const create = vi.fn((_options: { cwd?: string }) => Promise.resolve(binding.sessionId))
  const cell = list instanceof Cell ? list : new Cell(list)
  const remote = fakeRemote()
  const ports: ClientServicesPort = {
    ...remote,
    ...fakeServices(),
    sessions: fakeSessions({
      list: cell,
      create,
      retain: (target, options) => {
        retained.push([target, options.source])
        return { sessionId: target, ready: Promise.resolve(binding), release: () => { released.push(target) } }
      },
    }),
  }
  return { ports, released, retained, create, remote, jobs: ports.jobs as unknown as ReturnType<typeof fakeServices>['jobs'] }
}

describe('runTerminal', () => {
  it('refuses to start without an interactive terminal and writes nothing', async () => {
    const { binding } = fakeBinding()
    for (const change of [
      (r: Rig) => { r.stdin.isTTY = false },
      (r: Rig) => { r.stdout.isTTY = undefined },
      (r: Rig) => { delete r.stdin.setRawMode },
    ]) {
      const r = rig()
      change(r)
      await expect(runTerminal(services(listOf(), binding).ports, r.env, { continueLatest: false })).rejects.toThrow('needs an interactive terminal')
      expect(r.stdout.text).toBe('')
    }
  })

  it('opens a new session in the working directory, edits in raw mode and restores the terminal on exit', async () => {
    const { binding, session } = fakeBinding()
    const s = services(listOf(), binding)
    const r = rig()
    const run = await runTerminal(s.ports, r.env, { continueLatest: false })
    expect(s.create).toHaveBeenCalledWith({ cwd: '/work/app' })
    expect(s.retained).toEqual([[binding.sessionId, 'terminal']])
    expect(r.stdin.rawModes).toEqual([true])
    expect(r.stdin.encoding).toBe('utf8')
    expect(r.stdout.text).toContain('\u001B[?2004h')
    expect(visible(r.stdout.text)).toContain('New session 3f9a0c1e in ~/../work/app'.replace('~/../work/app', '/work/app'))
    r.stdin.emit('data', 'hello\r')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(session.prompt).toHaveBeenCalledOnce()
    r.stdout.columns = 40
    r.stdout.emit('resize')
    r.stdin.emit('data', '\u0004')
    expect(r.exits).toEqual([0])
    expect(r.stdin.rawModes).toEqual([true, false])
    expect(r.stdin.paused).toBe(true)
    expect(r.stdout.text).toContain('\u001B[?2004l')
    expect(s.released).toEqual([binding.sessionId])
    expect(r.stdin.listenerCount('data')).toBe(0)
    expect(r.stdout.listenerCount('resize')).toBe(0)
    expect(s.remote.disposed).toBe(1)
    expect(s.remote.questionsDisposed).toBe(1)
    expect(s.jobs.watchRows).toHaveBeenCalledWith(binding.sessionId)
    expect(s.jobs.stopWatching).toHaveBeenCalledOnce()
    run.stop()
    expect(s.released).toHaveLength(1)
  })

  it('waits for the first session list and falls back to 80 columns', async () => {
    const { binding } = fakeBinding()
    const list = new Cell<SessionListPort>({ phase: 'pending', ids: [], byId: {} })
    const s = services(list, binding)
    const r = rig()
    r.stdout.columns = undefined
    const running = runTerminal(s.ports, r.env, { continueLatest: false })
    await new Promise(resolve => setTimeout(resolve, 0))
    list.set({ phase: 'pending', ids: [], byId: {} })
    expect(s.retained).toEqual([])
    list.set(listOf())
    const run = await running
    expect(s.retained).toHaveLength(1)
    run.stop()
  })

  it('reopens a session named by prefix or the latest of the directory without creating one', async () => {
    const { binding } = fakeBinding('session-3f9a0c1e-0000')
    const list = listOf(row('session-3f9a0c1e-0000'), row('session-77aa0000-0000', { cwd: '/other' }), row('session-9999', { updatedAt: 0, blank: true }))
    const byPrefix = services(list, binding)
    const first = await runTerminal(byPrefix.ports, rig().env, { resume: '3f9a', continueLatest: false })
    expect(byPrefix.create).not.toHaveBeenCalled()
    expect(byPrefix.retained[0]![0]).toBe('session-3f9a0c1e-0000')
    first.stop()
    const latest = services(list, binding)
    const r = rig()
    const second = await runTerminal(latest.ports, r.env, { continueLatest: true })
    expect(visible(r.stdout.text)).toContain('Resumed session 3f9a0c1e')
    second.stop()
  })

  it('fails with the reason when no session matches, before touching the terminal', async () => {
    const { binding } = fakeBinding()
    const r = rig()
    await expect(runTerminal(services(listOf(), binding).ports, r.env, { resume: 'zz', continueLatest: false })).rejects.toThrow('No session matches "zz"')
    await expect(runTerminal(services(listOf(), binding).ports, r.env, { continueLatest: true })).rejects.toThrow('No earlier session was found in /work/app')
    expect(r.stdin.rawModes).toEqual([])
    expect(r.stdout.text).toBe('')
  })

  it('releases the session when it cannot be opened', async () => {
    const { binding } = fakeBinding()
    const s = services(listOf(), binding)
    const released: string[] = []
    s.ports.sessions.retain = target => ({ sessionId: target, ready: Promise.reject(new Error('cannot open')), release: () => { released.push(target) } })
    await expect(runTerminal(s.ports, rig().env, { continueLatest: false })).rejects.toThrow('cannot open')
    expect(released).toEqual([binding.sessionId])
  })

  it('routes an approval request of its own session to the person', async () => {
    const { binding } = fakeBinding()
    const s = services(listOf(), binding)
    s.ports.sessions.scopeOf = context => (context as { scope: string }).scope
    const r = rig()
    const run = await runTerminal(s.ports, r.env, { continueLatest: false })
    const answer = s.remote.listeners[0]!.call({ scope: binding.sessionId }, { toolName: 'bash', reason: 'run the tests' }, () => Promise.resolve('rejected'))
    expect(visible(r.stdout.text)).toContain('run the tests')
    r.stdin.emit('data', 'y')
    await expect(answer).resolves.toBe('allowed-once')
    run.stop()
  })

  it('routes a question of its own session to the person', async () => {
    const { binding } = fakeBinding()
    const s = services(listOf(), binding)
    s.ports.sessions.scopeOf = context => (context as { scope: string }).scope
    const r = rig()
    const run = await runTerminal(s.ports, r.env, { continueLatest: false })
    const answer = s.remote.questionListeners[0]!.call(
      { scope: binding.sessionId },
      { questions: [{ id: 'mode', question: 'Which mode?', options: [{ label: 'Fast' }] }] },
      () => Promise.reject(new Error('delegated')),
    )
    expect(visible(r.stdout.text)).toContain('Which mode?')
    r.stdin.emit('data', '\r')
    await expect(answer).resolves.toEqual({ answers: [{ id: 'mode', selected: ['Fast'] }] })
    run.stop()
  })

  it('shows nothing from input that arrives before the session is retained', async () => {
    const { binding } = fakeBinding()
    const r = rig()
    const run = await runTerminal(services(listOf(), binding).ports, r.env, { continueLatest: false })
    run.stop()
    r.stdin.emit('data', 'late')
    expect(r.exits).toEqual([])
  })

  describe('moving between sessions', () => {
    const idA = 'session-aaaa0000-0000'
    const idB = 'session-bbbb1111-0000'
    const idC = 'session-cccc2222-0000'

    /** Two sessions in the list; retaining either yields its own binding. */
    function twoSessions() {
      const a = fakeBinding(idA)
      const b = fakeBinding(idB)
      const c = fakeBinding(idC)
      const bindings: Record<string, SessionBindingPort> = { [idA]: a.binding, [idB]: b.binding, [idC]: c.binding }
      const list = listOf(
        row(idA, { title: 'First', updatedAt: 5 }),
        row(idB, { title: 'Second', cwd: '/other', updatedAt: 9 }),
        row(idC, { title: 'Third', cwd: undefined, updatedAt: 7 }),
      )
      const s = services(list, a.binding)
      const retain = vi.fn((target: string, options: { source: string }) => {
        s.retained.push([target, options.source])
        return {
          sessionId: target,
          ready: Promise.resolve(bindings[target] as SessionBindingPort),
          release: () => { s.released.push(target) },
        }
      })
      s.ports.sessions.retain = retain
      return { ...s, a, b, c, retain }
    }

    const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

    it('opens the chosen stored session in its own directory and releases the one it leaves', async () => {
      const t = twoSessions()
      const r = rig()
      const run = await runTerminal(t.ports, r.env, { resume: 'aaaa', continueLatest: false })
      r.stdin.emit('data', '/sessions\r')
      r.stdin.emit('data', 'Second')
      r.stdin.emit('data', '\r')
      await settle()
      expect(t.released).toEqual([idA])
      expect(t.retained.map(([target]) => target)).toEqual([idA, idB])
      expect(visible(r.stdout.text)).toContain('Resumed session bbbb1111 in /other')
      expect(t.remote.disposed).toBe(1)
      r.stdin.emit('data', 'hello\r')
      await settle()
      expect(t.b.session.prompt).toHaveBeenCalledOnce()
      expect(t.a.session.prompt).not.toHaveBeenCalled()
      r.stdout.emit('resize')
      r.stdin.emit('data', '\u0004')
      expect(r.exits).toEqual([0])
      expect(t.released).toEqual([idA, idB])
      expect(t.remote.disposed).toBe(2)
      expect(t.remote.questionsDisposed).toBe(2)
      run.stop()
    })

    it('shows a session that has no recorded directory in the working directory', async () => {
      const t = twoSessions()
      const r = rig()
      const run = await runTerminal(t.ports, r.env, { resume: 'cccc', continueLatest: false })
      expect(visible(r.stdout.text)).toContain('Resumed session cccc2222 in /work/app')
      run.stop()
      const again = rig()
      await runTerminal(t.ports, again.env, { resume: 'aaaa', continueLatest: false })
      again.stdin.emit('data', '/sessions\r')
      again.stdin.emit('data', 'Third')
      again.stdin.emit('data', '\r')
      await settle()
      expect(visible(again.stdout.text)).toContain('Resumed session cccc2222 in /work/app')
    })

    it('starts a new session in the typed directory', async () => {
      const t = twoSessions()
      const r = rig()
      await runTerminal(t.ports, r.env, { resume: 'aaaa', continueLatest: false })
      t.create.mockResolvedValueOnce(idB)
      r.stdin.emit('data', '/new /srv/site\r')
      await settle()
      expect(t.create).toHaveBeenCalledWith({ cwd: '/srv/site' })
      expect(visible(r.stdout.text)).toContain('New session bbbb1111 in /srv/site')
    })

    it('goes back to the session it left when the other cannot be opened, and says why', async () => {
      const t = twoSessions()
      const r = rig()
      await runTerminal(t.ports, r.env, { resume: 'aaaa', continueLatest: false })
      const retain = t.ports.sessions.retain
      t.ports.sessions.retain = (target, options) => (target === idB
        ? { sessionId: target, ready: Promise.reject(new Error('cannot open')), release: () => { t.released.push(target) } }
        : retain(target, options))
      r.stdin.emit('data', '/sessions\r')
      r.stdin.emit('data', 'Second')
      r.stdin.emit('data', '\r')
      await settle()
      expect(visible(r.stdout.text)).toContain('Could not open that session: cannot open')
      expect(t.retained.map(([target]) => target)).toEqual([idA, idA])
      r.stdin.emit('data', 'still here\r')
      await settle()
      expect(t.a.session.prompt).toHaveBeenCalledOnce()
      expect(r.exits).toEqual([])
    })

    it.each([
      ['first', new Error('second'), 'Could not open that session: first', 'Lost the connection to the agent: second'],
      [new Error('first'), 'second', 'Could not open that session: first', 'Lost the connection to the agent: second'],
    ])('leaves when neither the other session nor the previous one can be opened (%s, %s)', async (firstFailure, secondFailure, firstText, secondText) => {
      const t = twoSessions()
      const r = rig()
      await runTerminal(t.ports, r.env, { resume: 'aaaa', continueLatest: false })
      t.ports.sessions.retain = target => ({
        sessionId: target,
        // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- a non-Error rejection is a scenario.
        ready: Promise.reject(target === idB ? firstFailure : secondFailure),
        release: () => {},
      })
      r.stdin.emit('data', '/sessions\r')
      r.stdin.emit('data', 'Second')
      r.stdin.emit('data', '\r')
      await settle()
      expect(visible(r.stdout.text)).toContain(firstText)
      expect(visible(r.stdout.text)).toContain(secondText)
      expect(r.exits).toEqual([1])
      expect(r.stdin.rawModes).toEqual([true, false])
    })

    it('leaves on Ctrl+C while another session is opening, and releases that session when it arrives', async () => {
      const t = twoSessions()
      const r = rig()
      await runTerminal(t.ports, r.env, { resume: 'aaaa', continueLatest: false })
      let open: (binding: SessionBindingPort) => void = () => {}
      t.ports.sessions.retain = target => ({
        sessionId: target,
        ready: new Promise<SessionBindingPort>((resolve) => { open = resolve }),
        release: () => { t.released.push(`late-${target}`) },
      })
      r.stdin.emit('data', '/sessions\r')
      r.stdin.emit('data', 'Second')
      r.stdin.emit('data', '\r')
      await settle()
      r.stdin.emit('data', 'typed while waiting')
      expect(r.exits).toEqual([])
      r.stdin.emit('data', '\u0003')
      expect(r.exits).toEqual([0])
      open(t.b.binding)
      await settle()
      expect(t.released).toContain(`late-${idB}`)
      expect(r.stdin.listenerCount('data')).toBe(0)
    })
  })
})
