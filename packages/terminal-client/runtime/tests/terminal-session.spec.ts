import { describe, expect, it, vi } from 'vitest'
import { listenForApprovals, listenForQuestions, TerminalSession } from '../src/terminal-session.ts'
import type { TerminalSessionOptions } from '../src/terminal-session.ts'
import type { ApprovalOutcomePort, ApprovalRequestPort, QuestionAnswerPort, QuestionRequestPort } from '../src/ports.ts'
import {
  assistantEvent, callEvent, deltaEvent, fakeBinding, fakeDeps, fakeIo, fakeRemote, fakeSessions, plain, turnEnd, userEvent, visible,
} from './fakes.ts'

function open(overrides: Partial<TerminalSessionOptions> = {}) {
  const parts = fakeBinding()
  const io = fakeIo()
  const exits: number[] = []
  const switches: unknown[] = []
  const deps = fakeDeps()
  const terminal = new TerminalSession({
    binding: parts.binding, io, style: plain, cwd: '/work/app', home: '/home/me', resumed: false, deps,
    onExit: code => exits.push(code), onSwitch: target => switches.push(target), ...overrides,
  })
  terminal.start()
  return { ...parts, io, exits, switches, deps, terminal }
}

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

describe('TerminalSession', () => {
  it('prints the banner and the history of a reopened session, then waits for input', () => {
    const parts = fakeBinding()
    parts.events.push({ kind: 'replace', entries: [{ type: 'event', event: userEvent('earlier question') }, { type: 'event', event: assistantEvent('earlier answer') }] })
    const io = fakeIo()
    new TerminalSession({ binding: parts.binding, io, style: plain, cwd: '/work/app', resumed: true, deps: fakeDeps(), onExit: () => {}, onSwitch: () => {} }).start()
    const text = visible(io.text)
    expect(text).toContain('Resumed session 3f9a0c1e in /work/app')
    expect(text).toContain('› earlier question')
    expect(text).toContain('earlier answer')
    expect(text).toContain('Message the agent')
  })

  it('queues a typed message as a prompt and shows the working line while the turn runs', async () => {
    const { session, events, io, terminal } = open()
    terminal.handleInput('fix the build\r')
    await flush()
    expect(session.prompt).toHaveBeenCalledWith([{ type: 'text', text: 'fix the build' }], 'queue')
    session.setRunning(true)
    expect(visible(io.text)).toContain('Working… Ctrl+C stops the turn')
    events.append(userEvent('fix the build'), deltaEvent('Looking'), deltaEvent(' at it.\n'), assistantEvent('Looking at it.\n'), turnEnd())
    session.setRunning(false)
    const text = visible(io.text)
    expect(text).toContain('› fix the build')
    expect(text).toContain('Looking at it.')
    expect(text.match(/Looking at it\./gu)).toHaveLength(1)
  })

  it('prints each tool call and ignores a window change that carries nothing new', () => {
    const { events, io } = open()
    events.append(callEvent('c1', 'bash', { command: 'pnpm test' }))
    expect(visible(io.text)).toContain('pnpm test')
    const before = io.text
    events.push({ kind: 'prepend', entries: [] })
    events.push({ kind: 'settle-assistant' })
    expect(io.text).toBe(before + io.text.slice(before.length))
    events.set(events.getSnapshot())
    expect(visible(io.text.slice(before.length))).not.toContain('pnpm test')
  })

  it('settles an assistant reply from its durable entry', () => {
    const { events, io } = open()
    events.push({ kind: 'settle-assistant', entry: { type: 'event', event: assistantEvent('Done.') } })
    expect(visible(io.text)).toContain('Done.')
  })

  it('keeps a reply in one piece when an update repeats a revision', () => {
    const { events, io } = open()
    events.append(assistantEvent('Once.'))
    const length = io.text.length
    events.set({ ...events.getSnapshot() })
    expect(io.text.length).toBe(length)
  })

  it('shows help, runs slash commands, and exits on /exit', async () => {
    const { session, io, exits, terminal } = open()
    terminal.handleInput('/help\r')
    expect(visible(io.text)).toContain('tBelt Code in the terminal')
    terminal.handleInput('/compact now\r')
    await flush()
    expect(session.command).toHaveBeenCalledWith('/compact now')
    terminal.handleInput('/exit\r')
    expect(exits).toEqual([0])
    expect(visible(io.text)).toContain('Resume it with: dsh terminal --resume 3f9a0c1e')
  })

  it('reports a rejected or failed send without leaving the session', async () => {
    const { session, io, terminal } = open()
    session.prompt.mockResolvedValueOnce({ ok: false, error: { code: 'x', message: 'queue full' } })
    terminal.handleInput('one\r')
    await flush()
    expect(visible(io.text)).toContain('The message was not sent: queue full')
    session.prompt.mockRejectedValueOnce(new Error('offline'))
    terminal.handleInput('two\r')
    await flush()
    expect(visible(io.text)).toContain('The message was not sent: offline')
    session.prompt.mockRejectedValueOnce('plain failure')
    terminal.handleInput('three\r')
    await flush()
    expect(visible(io.text)).toContain('The message was not sent: plain failure')
    session.command.mockResolvedValueOnce({ ok: false, error: { code: 'x', message: 'unknown command' } })
    terminal.handleInput('/nope\r')
    await flush()
    expect(visible(io.text)).toContain('The command failed: unknown command')
    session.command.mockResolvedValueOnce({ ok: true, value: { matched: false } })
    terminal.handleInput('/nope now\r')
    await flush()
    expect(visible(io.text)).toContain('There is no /nope command. Type /help for the commands.')
    session.command.mockRejectedValueOnce(new Error('offline'))
    terminal.handleInput('/later\r')
    await flush()
    expect(visible(io.text)).toContain('The command failed: offline')
    session.command.mockRejectedValueOnce('plain failure')
    terminal.handleInput('/again\r')
    await flush()
    expect(visible(io.text)).toContain('The command failed: plain failure')
    let fail: (error: Error) => void = () => {}
    session.prompt.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject }))
    terminal.handleInput('four\r')
    terminal.dispose()
    fail(new Error('late'))
    await flush()
    expect(visible(io.text)).not.toContain('late')
  })

  it('cancels a running turn on the first Ctrl+C, once, then clears a draft, then leaves', async () => {
    const { session, io, exits, terminal } = open()
    terminal.handleInput('draft')
    session.setRunning(true)
    terminal.handleInput('\u0003')
    await flush()
    expect(visible(io.text)).toContain('Stopping…')
    terminal.handleInput('\u0003')
    await flush()
    expect(session.cancel).toHaveBeenCalledTimes(1)
    expect(exits).toEqual([])
    const afterClear = io.text.length
    terminal.handleInput('\u0003')
    expect(exits).toEqual([0])
    expect(io.text.length).toBeGreaterThan(afterClear)
    terminal.handleInput('x')
    terminal.resize()
  })

  it('leaves on Ctrl+D with an empty composer and clears the screen on Ctrl+L', () => {
    const { io, exits, terminal } = open()
    terminal.handleInput('\u000C')
    expect(io.text).toContain('\u001B[2J')
    terminal.handleInput('\u0004')
    expect(exits).toEqual([0])
  })

  it('keeps working when the session changes without changing whether a turn runs', () => {
    const { session, io } = open()
    const before = io.text.length
    session.state.set({ ...session.state.getSnapshot(), openState: 'loading' })
    expect(io.text.length).toBeGreaterThanOrEqual(before)
  })

  it('redraws at the new width', () => {
    const { io, terminal } = open()
    io.width = 30
    const before = io.text.length
    terminal.resize()
    expect(io.text.length).toBeGreaterThan(before)
  })

  it('does nothing when the session is unsubscribed before a late change arrives', () => {
    const { session, events, terminal } = open()
    terminal.dispose()
    expect(events.listeners).toBe(0)
    session.setRunning(true)
  })

  describe('window title', () => {
    const SET = (title: string): string => `\u001B]0;${title}\u0007`
    const titles = (text: string): string[] => [...text.matchAll(/\u001B\]0;([^\u0007]*)\u0007/gu)].map(match => match[1] as string)
    const settings = { marker: true, frameIntervalMs: 500 }

    it('leaves the title alone when no settings are given', () => {
      const { io } = open()
      expect(io.text).not.toContain('\u001B]0;')
    })

    it('names the session after its directory until it has a title, then after the title', () => {
      const rows = [{ id: 'session-3f9a0c1e-0000', title: 'fix the build', blank: false, updatedAt: 1 }]
      let titled = false
      const { io, terminal } = open({ hostTitle: settings, deps: fakeDeps({ sessions: () => titled ? rows : [] }) })
      expect(titles(io.text)).toEqual(['\u2726 \u{1F40B} app'])
      titled = true
      terminal.resize()
      expect(titles(io.text)).toEqual(['\u2726 \u{1F40B} app', '\u2726 \u{1F40B} fix the build'])
    })

    it('follows a running turn, a pending permission and the end of the turn', async () => {
      const { io, session, terminal } = open({ hostTitle: settings })
      session.setRunning(true)
      expect(titles(io.text).at(-1)).toBe('\u2802 \u{1F40B} app')
      const answer = terminal.requestApproval({ toolName: 'bash', callId: 'c1', reason: 'run the tests' })
      expect(titles(io.text).at(-1)).toBe('! \u{1F40B} app')
      terminal.handleInput('y')
      await answer
      expect(titles(io.text).at(-1)).toBe('\u2802 \u{1F40B} app')
      session.setRunning(false)
      expect(titles(io.text).at(-1)).toBe('\u2726 \u{1F40B} app')
    })

    it('hands the title back when the person leaves', () => {
      const { io, terminal } = open({ hostTitle: settings })
      terminal.handleInput('/exit\r')
      expect(io.text.endsWith(SET(''))).toBe(true)
    })

    it('does not touch the title after the session closed', () => {
      const { io, session, terminal } = open({ hostTitle: settings })
      terminal.dispose()
      const length = io.text.length
      session.setRunning(true)
      expect(io.text).toHaveLength(length)
    })
  })

  describe('approvals', () => {
    const request = (extra: Partial<ApprovalRequestPort> = {}): ApprovalRequestPort => ({ toolName: 'bash', callId: 'c1', reason: 'run the tests', ...extra })

    it('asks in plain words and answers allow once on y', async () => {
      const { io, terminal } = open()
      const answer = terminal.requestApproval(request())
      expect(visible(io.text)).toContain('? ')
      expect(visible(io.text)).toContain('run the tests')
      terminal.handleInput('y')
      await expect(answer).resolves.toBe('allowed-once')
    })

    it('rejects on n and on Esc, and ignores other keys while a question is open', async () => {
      const { terminal } = open()
      const first = terminal.requestApproval(request())
      terminal.handleInput('q')
      terminal.handleInput('n')
      await expect(first).resolves.toBe('rejected')
      const second = terminal.requestApproval(request({ toolName: 'write' }))
      terminal.handleInput('\u001B')
      await expect(second).resolves.toBe('rejected')
    })

    it('answers the same permission itself after Allow for this session', async () => {
      const { io, terminal } = open()
      const first = terminal.requestApproval(request())
      terminal.handleInput('s')
      await expect(first).resolves.toBe('allowed-once')
      const length = io.text.length
      await expect(terminal.requestApproval(request())).resolves.toBe('allowed-once')
      expect(io.text.length).toBe(length)
    })

    it('queues questions and shows them one at a time', async () => {
      const { io, terminal } = open()
      const first = terminal.requestApproval(request({ toolName: 'bash' }))
      const second = terminal.requestApproval(request({ toolName: 'str_replace_editor', reason: undefined, callId: undefined }))
      terminal.handleInput('\r')
      await expect(first).resolves.toBe('allowed-once')
      expect(visible(io.text)).toContain('str_replace_editor')
      terminal.handleInput('y')
      await expect(second).resolves.toBe('allowed-once')
    })

    it('rejects every open question when Ctrl+C interrupts', async () => {
      const { session, terminal } = open()
      const answer = terminal.requestApproval(request())
      session.setRunning(true)
      terminal.handleInput('\u0003')
      await expect(answer).resolves.toBe('rejected')
      await flush()
      expect(session.cancel).toHaveBeenCalledTimes(1)
    })

    it('withdraws a question whose request was aborted by the Host', async () => {
      const { terminal } = open()
      const controller = new AbortController()
      const answer = terminal.requestApproval(request({ signal: controller.signal }))
      controller.abort()
      await expect(answer).resolves.toBe('rejected')
      controller.abort()
      await expect(terminal.requestApproval(request({ signal: controller.signal }))).resolves.toBe('rejected')
    })

    it('does not withdraw a question the person already answered', async () => {
      const { terminal } = open()
      const controller = new AbortController()
      const answer = terminal.requestApproval(request({ signal: controller.signal }))
      terminal.handleInput('y')
      await answer
      controller.abort()
    })

    it('rejects open questions when the terminal closes', async () => {
      const { terminal } = open()
      const answer = terminal.requestApproval(request())
      terminal.dispose()
      terminal.dispose()
      await expect(answer).resolves.toBe('rejected')
      await expect(terminal.requestApproval(request())).resolves.toBe('rejected')
    })
  })
})

describe('listenForApprovals', () => {
  it('answers requests of its own session and delegates every other', async () => {
    const { remote, listeners } = fakeRemote()
    const terminalRequests: ApprovalRequestPort[] = []
    const terminal = {
      requestApproval: vi.fn((request: ApprovalRequestPort): Promise<ApprovalOutcomePort> => {
        terminalRequests.push(request)
        return Promise.resolve('allowed-once')
      }),
    }
    const shown: { terminal?: typeof terminal } = {}
    const sessions = fakeSessions({ scopeOf: context => (context as { scope?: string }).scope })
    const stop = listenForApprovals({ sessions, remote }, 'session-a', () => shown.terminal)
    const listener = listeners[0]!
    const next = vi.fn(() => Promise.resolve<ApprovalOutcomePort>('rejected'))
    const request: ApprovalRequestPort = { toolName: 'bash' }

    await expect(listener.call({ scope: 'session-a' }, request, next)).resolves.toBe('rejected')
    await expect(listener.call({ scope: 'session-b' }, request, next)).resolves.toBe('rejected')
    shown.terminal = terminal
    await expect(listener.call({ scope: 'session-a' }, request, next)).resolves.toBe('allowed-once')
    expect(terminalRequests).toEqual([request])
    stop()
  })
})

describe('TerminalSession questions', () => {
  const mode: QuestionRequestPort = {
    questions: [{ id: 'mode', question: 'Which mode?', options: [{ label: 'Fast', description: 'Skip the checks' }, { label: 'Careful' }] }],
  }
  const codeOf = (error: unknown): unknown => (error as { code?: string }).code

  it('prints the question, takes the chosen option and returns the answers', async () => {
    const { terminal, io } = open()
    const answer = terminal.requestQuestions(mode)
    const shown = visible(io.text)
    expect(shown).toContain('? The agent has a question')
    expect(shown).toContain('Which mode?')
    expect(shown).toContain('Fast  Skip the checks')
    terminal.handleInput('\u001B[B')
    terminal.handleInput('\r')
    await expect(answer).resolves.toEqual({ answers: [{ id: 'mode', selected: ['Careful'] }] })
    expect(visible(io.text)).toContain('→ Careful')
    expect(visible(io.text.slice(io.text.lastIndexOf('→ Careful')))).toContain('Message the agent')
  })

  it('asks a batch one question at a time and keeps typed text as the custom answer', async () => {
    const { terminal, io } = open()
    const answer = terminal.requestQuestions({
      questions: [...mode.questions, { id: 'name', question: 'What name?' }],
    })
    terminal.handleInput('\r')
    expect(visible(io.text)).toContain('(question 2 of 2)')
    terminal.handleInput('Ana\r')
    await expect(answer).resolves.toEqual({
      answers: [{ id: 'mode', selected: ['Fast'] }, { id: 'name', selected: [], custom: 'Ana' }],
    })
  })

  it('shows the plan under review above the decision', async () => {
    const { terminal, io } = open()
    const answer = terminal.requestQuestions({
      questions: [{
        id: 'plan-review', question: 'Approve this plan?', header: 'Plan review', detail: '# Plan\n\n- step one',
        options: [{ label: 'Approve' }, { label: 'Keep planning' }], intent: { kind: 'plan-review' },
      }],
    })
    expect(visible(io.text)).toContain('? Plan review')
    expect(visible(io.text)).toContain('# Plan')
    terminal.handleInput('\r')
    await expect(answer).resolves.toEqual({ answers: [{ id: 'plan-review', selected: ['Approve'] }] })
  })

  it('rejects with a cancellation when the person leaves the question', async () => {
    const { terminal, io } = open()
    const answer = terminal.requestQuestions(mode)
    terminal.handleInput('\u001B')
    await expect(answer).rejects.toMatchObject({ name: 'UserQuestionError', code: 'ASK_CANCELLED' })
    expect(visible(io.text)).toContain('You left the question unanswered.')
  })

  it('cancels the question and stops the turn on Ctrl+C', async () => {
    const { terminal, session } = open()
    session.setRunning(true)
    const answer = terminal.requestQuestions(mode)
    terminal.handleInput('\u0003')
    await expect(answer).rejects.toMatchObject({ code: 'ASK_CANCELLED' })
    expect(session.cancel).toHaveBeenCalledOnce()
  })

  it('withdraws a question the Host aborts, and shows the next waiting one', async () => {
    const { terminal, io } = open()
    const controller = new AbortController()
    const first = terminal.requestQuestions({ ...mode, signal: controller.signal })
    const second = terminal.requestQuestions({ questions: [{ id: 'next', question: 'Second question?', options: [{ label: 'Yes' }] }] })
    expect(visible(io.text)).not.toContain('Second question?')
    controller.abort()
    await expect(first).rejects.toMatchObject({ code: 'ASK_ABORTED' })
    expect(visible(io.text)).toContain('Second question?')
    terminal.handleInput('\r')
    await expect(second).resolves.toEqual({ answers: [{ id: 'next', selected: ['Yes'] }] })
    controller.abort()
  })

  it('ignores an abort that arrives after the question was answered', async () => {
    const { terminal } = open()
    const controller = new AbortController()
    const answer = terminal.requestQuestions({ ...mode, signal: controller.signal })
    terminal.handleInput('\r')
    await expect(answer).resolves.toEqual({ answers: [{ id: 'mode', selected: ['Fast'] }] })
    controller.abort()
  })

  it('refuses a request whose signal already aborted', async () => {
    const { terminal } = open()
    const answer = terminal.requestQuestions({ ...mode, signal: AbortSignal.abort() })
    await expect(answer).rejects.toMatchObject({ code: 'ASK_ABORTED' })
  })

  it('cancels open questions when the terminal closes and refuses new ones', async () => {
    const { terminal } = open()
    const answer = terminal.requestQuestions(mode)
    terminal.dispose()
    await expect(answer).rejects.toMatchObject({ code: 'ASK_CANCELLED' })
    await expect(terminal.requestQuestions(mode)).rejects.toSatisfy(error => codeOf(error) === 'ASK_CANCELLED')
  })

  it('tells the host window the session waits while a question is open', async () => {
    const { terminal, io } = open({ hostTitle: { marker: true, frameIntervalMs: 500 } })
    const answer = terminal.requestQuestions(mode)
    expect(io.text).toContain('\u001B]0;! \u{1F40B} app')
    terminal.handleInput('\r')
    await answer
    expect(io.text.lastIndexOf('\u001B]0;')).toBeGreaterThan(io.text.indexOf('\u001B]0;! '))
  })

  it('puts an approval before a question', async () => {
    const { terminal, io } = open()
    const question = terminal.requestQuestions(mode)
    const approval = terminal.requestApproval({ toolName: 'bash', reason: 'run the tests' })
    expect(visible(io.text.slice(io.text.lastIndexOf('I need permission')))).toContain('I need permission')
    terminal.handleInput('y')
    await expect(approval).resolves.toBe('allowed-once')
    terminal.handleInput('\r')
    await expect(question).resolves.toEqual({ answers: [{ id: 'mode', selected: ['Fast'] }] })
  })
})

describe('listenForQuestions', () => {
  it('answers requests of its own session and delegates every other', async () => {
    const { remote, questionListeners } = fakeRemote()
    const asked: QuestionRequestPort[] = []
    const answer: QuestionAnswerPort = { answers: [{ id: 'q', selected: ['Yes'] }] }
    const terminal = {
      requestQuestions: vi.fn((request: QuestionRequestPort): Promise<QuestionAnswerPort> => {
        asked.push(request)
        return Promise.resolve(answer)
      }),
    }
    const shown: { terminal?: typeof terminal } = {}
    const sessions = fakeSessions({ scopeOf: context => (context as { scope?: string }).scope })
    const stop = listenForQuestions({ sessions, remote }, 'session-a', () => shown.terminal)
    const listener = questionListeners[0]!
    const fallback: QuestionAnswerPort = { answers: [] }
    const next = vi.fn(() => Promise.resolve(fallback))
    const request: QuestionRequestPort = { questions: [{ id: 'q', question: 'Sure?' }] }

    await expect(listener.call({ scope: 'session-a' }, request, next)).resolves.toBe(fallback)
    shown.terminal = terminal
    await expect(listener.call({ scope: 'session-b' }, request, next)).resolves.toBe(fallback)
    await expect(listener.call({ scope: 'session-a' }, { ...request, wait: { callId: 'c1', timed: true } }, next)).resolves.toBe(fallback)
    await expect(listener.call({ scope: 'session-a' }, { ...request, wait: { callId: 'c1' } }, next)).resolves.toBe(answer)
    expect(asked).toHaveLength(1)
    stop()
  })
})

describe('TerminalSession pickers', () => {
  const rows = [
    { id: 'session-aaaa1111-0', title: 'Fix the build', cwd: '/work/app', blank: false, updatedAt: 9_000_000 },
    { id: 'session-3f9a0c1e-0000', cwd: '/work/app', blank: true, updatedAt: 9_500_000 },
    { id: 'session-bbbb2222-0', title: 'Write docs', cwd: '/work/site', blank: false, updatedAt: 8_000_000 },
  ]

  it('lists stored sessions, filters them and switches to the chosen one', () => {
    const { terminal, io, switches, exits } = open({ deps: fakeDeps({ sessions: () => rows }) })
    terminal.handleInput('/sessions\r')
    const shown = visible(io.text)
    expect(shown).toContain('Choose a session')
    expect(shown).toContain('Fix the build')
    expect(shown).toContain('Write docs')
    terminal.handleInput('docs')
    terminal.handleInput('\r')
    expect(switches).toEqual([{ kind: 'resume', sessionId: 'session-bbbb2222-0' }])
    expect(exits).toEqual([])
    expect(visible(io.text)).toContain('Session 3f9a0c1e ends here')
  })

  it('stays when the open session is chosen again and leaves the picker on Escape or Ctrl+C', () => {
    const { terminal, switches, io } = open({ deps: fakeDeps({ sessions: () => rows }) })
    terminal.handleInput('/sessions\r')
    terminal.handleInput('\r')
    expect(switches).toEqual([])
    terminal.handleInput('/sessions\r')
    terminal.handleInput('\u001B')
    terminal.handleInput('/sessions\r')
    terminal.handleInput('\u0003')
    expect(visible(io.text.slice(io.text.lastIndexOf('Choose a session'))).includes('Choose a session')).toBe(true)
    terminal.handleInput('hello\r')
    expect(switches).toEqual([])
  })

  it('lists the models, marks the default, selects the chosen one for this session and remembers it', async () => {
    const { terminal, io, deps } = open()
    terminal.handleInput('/model\r')
    await flush()
    expect(visible(io.text)).toContain('Choose a model')
    expect(visible(io.text)).toContain('Model One')
    terminal.handleInput('\u001B[B')
    terminal.handleInput('\r')
    await flush()
    expect(deps.remote.selectModel).toHaveBeenCalledWith({ sessionId: 'session-3f9a0c1e-0000', provider: 'p1', model: 'm2' })
    expect(visible(io.text)).toContain('Model for the next message: m2 (p1).')
    terminal.handleInput('/model\r')
    await flush()
    expect(visible(io.text.slice(io.text.lastIndexOf('Choose a model')))).toContain('* Model Two')
  })

  it('shows nothing when the model list arrives after the session was left', async () => {
    const deps = fakeDeps()
    const { terminal, io } = open({ deps })
    terminal.handleInput('/model\r')
    terminal.dispose()
    await flush()
    expect(visible(io.text)).not.toContain('Choose a model')
    const failing = fakeDeps()
    failing.remote.modelCatalog.mockResolvedValueOnce({ ok: false, error: { code: 'x', message: 'late failure' } })
    const second = open({ deps: failing })
    second.terminal.handleInput('/model\r')
    second.terminal.dispose()
    await flush()
    expect(visible(second.io.text)).not.toContain('late failure')
  })

  it('reports a model list or selection that fails, including a call that throws', async () => {
    const deps = fakeDeps()
    deps.remote.modelCatalog.mockResolvedValueOnce({ ok: false, error: { code: 'x', message: 'no providers' } })
    const { terminal, io } = open({ deps })
    terminal.handleInput('/model\r')
    await flush()
    expect(visible(io.text)).toContain('Could not load the list: no providers')
    deps.remote.modelCatalog.mockRejectedValueOnce(new Error('offline'))
    terminal.handleInput('/model\r')
    await flush()
    expect(visible(io.text)).toContain('Could not load the list: offline')
    deps.remote.selectModel.mockResolvedValueOnce({ ok: false, error: { code: 'session/model-unavailable', message: 'gone' } })
    terminal.handleInput('/model\r')
    await flush()
    terminal.handleInput('\r')
    await flush()
    expect(visible(io.text)).toContain('Could not select the model: gone')
    deps.remote.selectModel.mockRejectedValueOnce('boom')
    terminal.handleInput('/model\r')
    await flush()
    terminal.handleInput('\r')
    await flush()
    expect(visible(io.text)).toContain('Could not select the model: boom')
  })
})

describe('TerminalSession commands', () => {
  it('renames the session, asks for a title, and reports a refusal or a throw', async () => {
    const { terminal, io, session } = open()
    terminal.handleInput('/rename\r')
    expect(visible(io.text)).toContain('Usage: /rename <new title>')
    terminal.handleInput('/rename Fix the build\r')
    await flush()
    expect(session.rename).toHaveBeenCalledWith('Fix the build')
    expect(visible(io.text)).toContain('Session renamed to "Fix the build".')
    session.rename.mockResolvedValueOnce({ ok: false, error: { code: 'x', message: 'too long' } })
    terminal.handleInput('/rename x\r')
    await flush()
    expect(visible(io.text)).toContain('Could not rename the session: too long')
    session.rename.mockRejectedValueOnce(new Error('offline'))
    terminal.handleInput('/rename y\r')
    await flush()
    expect(visible(io.text)).toContain('Could not rename the session: offline')
  })

  it('starts a new session in the current or a typed directory', async () => {
    const here = open()
    here.terminal.handleInput('/new\r')
    await flush()
    expect(here.switches).toEqual([{ kind: 'new', cwd: '/work/app' }])
    const elsewhere = open()
    elsewhere.terminal.handleInput('/new ~/code/site\r')
    await flush()
    expect(elsewhere.switches).toEqual([{ kind: 'new', cwd: '/home/me/code/site' }])
    expect(elsewhere.deps.files.isDirectory).toHaveBeenCalledWith('/home/me/code/site')
  })

  it('refuses a directory that does not exist and reports a check that fails', async () => {
    const deps = fakeDeps()
    const { terminal, io, switches } = open({ deps })
    deps.files.isDirectory.mockResolvedValueOnce(false)
    terminal.handleInput('/new nowhere\r')
    await flush()
    expect(visible(io.text)).toContain('No directory at /work/app/nowhere.')
    deps.files.isDirectory.mockRejectedValueOnce(new Error('permission denied'))
    terminal.handleInput('/new locked\r')
    await flush()
    deps.files.isDirectory.mockRejectedValueOnce('odd')
    terminal.handleInput('/new odd\r')
    await flush()
    expect(visible(io.text)).toContain('Could not start a session: permission denied')
    expect(visible(io.text)).toContain('Could not start a session: odd')
    expect(switches).toEqual([])
  })

  it('attaches images to the next message only, and returns them when the Host refuses it', async () => {
    const { terminal, io, session, deps } = open()
    terminal.handleInput('/attach\r')
    expect(visible(io.text)).toContain('Usage: /attach')
    terminal.handleInput('/attach ~/pics/a.png\r')
    await flush()
    terminal.handleInput('/attach "shots/b b.png"\r')
    await flush()
    expect(deps.files.readAttachment).toHaveBeenNthCalledWith(1, '/home/me/pics/a.png')
    expect(deps.files.readAttachment).toHaveBeenNthCalledWith(2, '/work/app/shots/b b.png')
    expect(visible(io.text)).toContain('Attached a.png. It goes with your next message (1 waiting).')
    expect(visible(io.text)).toContain('2 attached')
    session.prompt.mockResolvedValueOnce({ ok: false, error: { code: 'x', message: 'too big' } })
    terminal.handleInput('look\r')
    await flush()
    expect(session.prompt.mock.calls[0]![0]).toEqual([
      { type: 'text', text: 'look' },
      { type: 'image', mediaType: 'image/png', data: 'QUJD', name: 'a.png' },
      { type: 'image', mediaType: 'image/png', data: 'QUJD', name: 'b b.png' },
    ])
    expect(visible(io.text)).toContain('The message was not sent: too big')
    terminal.handleInput('again\r')
    await flush()
    expect((session.prompt.mock.calls[1]![0] as unknown[]).length).toBe(3)
    terminal.handleInput('third\r')
    await flush()
    expect(session.prompt.mock.calls[2]![0]).toEqual([{ type: 'text', text: 'third' }])
  })

  it('removes attached images and says when there are none', async () => {
    const { terminal, io, session } = open()
    terminal.handleInput('/detach\r')
    expect(visible(io.text)).toContain('Nothing is attached.')
    terminal.handleInput('/attach a.png\r')
    await flush()
    terminal.handleInput('/detach\r')
    expect(visible(io.text)).toContain('Removed 1 attached files.')
    terminal.handleInput('plain\r')
    await flush()
    expect(session.prompt.mock.calls[0]![0]).toEqual([{ type: 'text', text: 'plain' }])
  })

  it('explains why a file cannot be attached', async () => {
    const deps = fakeDeps()
    const { terminal, io } = open({ deps })
    deps.files.readAttachment.mockRejectedValueOnce(new Error('only PNG, JPEG, WebP and GIF images can be attached'))
    terminal.handleInput('/attach notes.txt\r')
    await flush()
    expect(visible(io.text)).toContain('Could not attach /work/app/notes.txt: only PNG')
    deps.files.readAttachment.mockRejectedValueOnce('odd')
    terminal.handleInput('/attach odd\r')
    await flush()
    expect(visible(io.text)).toContain('Could not attach /work/app/odd: odd')
  })

  it('says nothing after the session was left', async () => {
    const { terminal, io } = open()
    terminal.handleInput('/rename late\r')
    terminal.dispose()
    const before = io.text
    await flush()
    expect(io.text).toBe(before)
  })
})

describe('TerminalSession images', () => {
  const png = (id: string) => ({
    type: 'image', attachment: { attachmentId: id, mediaType: 'image/png', bytes: 3, width: 1, height: 1, name: 'shot.png' },
  }) as never

  const userWithImage = (id: string) => {
    const event = userEvent('look')
    return { ...event, data: { ...event.data, content: [...event.data.content, png(id)] } }
  }

  it('fetches the bytes of an image that arrives and draws it where the message prints', async () => {
    const { events, io, session } = open({ deps: fakeDeps({ imageProtocol: 'iterm2' }) })
    events.append(userWithImage('a1'), assistantEvent('Nice.\n'))
    expect(io.text).not.toContain('1337')
    await flush()
    expect(session.readAttachment).toHaveBeenCalledWith('a1')
    expect(io.text).toContain('\u001B]1337;File=inline=1;size=3;')
    expect(io.text).toContain('QUJD')
    const shown = visible(io.text)
    expect(shown.indexOf('› look')).toBeLessThan(shown.indexOf('Nice.'))
  })

  it('keeps later output behind an image that is still loading, and fetches each image once', async () => {
    const { events, io, session } = open({ deps: fakeDeps({ imageProtocol: 'iterm2' }) })
    events.append(userWithImage('a1'))
    events.append(assistantEvent('After.\n'))
    expect(visible(io.text)).not.toContain('After.')
    await flush()
    expect(visible(io.text)).toContain('After.')
    events.append(userWithImage('a1'))
    await flush()
    expect(session.readAttachment).toHaveBeenCalledTimes(1)
  })

  it('shows the marker when the bytes cannot be read, and never fetches without a protocol or for history', async () => {
    const failing = open({ deps: fakeDeps({ imageProtocol: 'kitty' }) })
    failing.session.readAttachment.mockResolvedValueOnce({ ok: false, error: { code: 'x', message: 'gone' } })
    failing.events.append(userWithImage('a1'))
    await flush()
    expect(visible(failing.io.text)).toContain('[image shot.png · 1×1 · 3 B]')
    expect(failing.io.text).not.toContain('_G')
    failing.session.readAttachment.mockRejectedValueOnce(new Error('offline'))
    failing.events.append(userWithImage('a2'))
    await flush()

    const plainTerminal = open()
    plainTerminal.events.append(userWithImage('a1'))
    expect(plainTerminal.session.readAttachment).not.toHaveBeenCalled()
    expect(visible(plainTerminal.io.text)).toContain('[image shot.png')

    const resumed = open({ deps: fakeDeps({ imageProtocol: 'iterm2' }) })
    resumed.events.push({ kind: 'replace', entries: [{ type: 'event', event: userWithImage('h1') }] })
    await flush()
    expect(resumed.session.readAttachment).not.toHaveBeenCalled()
    expect(visible(resumed.io.text)).toContain('[image shot.png')
  })

  it('does not print a queued message after the session was left', async () => {
    const { events, io, terminal } = open({ deps: fakeDeps({ imageProtocol: 'iterm2' }) })
    events.append(userWithImage('a1'))
    terminal.dispose()
    const before = io.text
    await flush()
    expect(io.text).toBe(before)
  })
})

describe('TerminalSession configuration screens', () => {
  const ENTER = '\r'
  const ESC = '\u001B'
  const DOWN = '\u001B[B'
  const UP = '\u001B[A'
  const ok = <T>(value: T) => Promise.resolve({ ok: true as const, value })

  function screens(extra: (client: ReturnType<typeof fakeRemote>['remote']) => void = () => {}) {
    const { remote } = fakeRemote()
    ;(remote.web.searchProviders as ReturnType<typeof vi.fn>).mockImplementation(() => ok([{ id: 'brave', credentialRef: 'BRAVE' }]))
    ;(remote.settings.describe as ReturnType<typeof vi.fn>).mockImplementation(() => ok({
      writable: true,
      namespaces: [
        { ns: 'web', schema: {}, value: {}, secrets: [], revision: 1 },
        { ns: 'llm-pi-ai', schema: {}, value: {}, user: {}, base: {}, secrets: [], revision: 1 },
      ],
    }))
    extra(remote)
    const deps = fakeDeps({ client: remote })
    return { remote, ...open({ deps }) }
  }

  it('asks for a key without echoing it, and leaves the question with Escape', async () => {
    const { terminal, io, remote } = screens()
    terminal.handleInput(`/web-search${ENTER}`)
    await flush()
    expect(visible(io.text)).toContain('Choose the web search provider')
    terminal.handleInput(DOWN)
    terminal.handleInput(ENTER)
    await flush()
    terminal.handleInput('sk-secret')
    expect(visible(io.text)).toContain('API key')
    expect(visible(io.text)).toContain('*********')
    expect(visible(io.text)).not.toContain('sk-secret')
    terminal.handleInput(ESC)
    await flush()
    expect(remote.credentials.set).not.toHaveBeenCalled()
    expect(visible(io.text.slice(io.text.lastIndexOf('›')))).toContain('›')
  })

  it('stores a typed key through the Host and runs one screen at a time', async () => {
    let release: () => void = () => {}
    const { terminal, io, remote } = screens((client) => {
      ;(client.web.searchProviders as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise((resolve) => {
        release = () => { resolve({ ok: true, value: [{ id: 'brave', credentialRef: 'BRAVE' }] }) }
      }))
    })
    terminal.handleInput(`/web-search${ENTER}`)
    terminal.handleInput(`/settings${ENTER}`)
    expect(visible(io.text)).toContain('Another screen is open')
    release()
    await flush()
    terminal.handleInput(DOWN)
    terminal.handleInput(ENTER)
    await flush()
    terminal.handleInput(`sk-live${ENTER}`)
    await flush()
    expect(remote.credentials.set).toHaveBeenCalledWith('BRAVE', 'sk-live')
    terminal.handleInput(`/web-search${ENTER}`)
    await flush()
    expect(visible(io.text.slice(io.text.lastIndexOf('Choose the web search provider')))).toContain('brave')
  })

  it('opens the default model list for /model default', async () => {
    const { terminal, io, remote, deps } = screens()
    ;(remote.session.modelCatalog as ReturnType<typeof vi.fn>).mockImplementation(() => deps.remote.modelCatalog())
    terminal.handleInput(`/model default${ENTER}`)
    await flush()
    expect(visible(io.text)).toContain('Choose the default model for new sessions')
    terminal.handleInput(DOWN)
    terminal.handleInput(ENTER)
    await flush()
    expect(remote.session.setDefaultModel).toHaveBeenCalledWith({ provider: 'p1', model: 'm2' })
  })

  it('ticks models in a list and continues with the ticked ones', async () => {
    const { terminal, io, remote } = screens((client) => {
      ;(client.llm.listProviders as ReturnType<typeof vi.fn>).mockImplementation(() => ok([{ id: 'acme', name: 'Acme' }]))
      ;(client.llm.listConfigurableProviders as ReturnType<typeof vi.fn>).mockImplementation(() => ok([
        { provider: 'acme', displayName: 'Acme', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'acme'] },
      ]))
      ;(client.llm.discoverModels as ReturnType<typeof vi.fn>).mockImplementation(() => ok([{ id: 'm1' }, { id: 'm2' }]))
    })
    terminal.handleInput(`/providers${ENTER}`)
    await flush()
    terminal.handleInput(ENTER)
    await flush()
    terminal.handleInput(ENTER)
    await flush()
    terminal.handleInput(`sk-acme${ENTER}`)
    await flush()
    expect(visible(io.text)).toContain('Continue with 0 ticked')
    terminal.handleInput(DOWN)
    terminal.handleInput(ENTER)
    terminal.handleInput(UP)
    expect(visible(io.text)).toContain('Continue with 1 ticked')
    terminal.handleInput(ENTER)
    await flush()
    expect(remote.settings.mutate).toHaveBeenCalled()
    expect(remote.credentials.set).toHaveBeenCalledWith('ACME_API_KEY', 'sk-acme')
  })

  it('leaves a multiple choice with Escape', async () => {
    const { terminal, remote } = screens((client) => {
      ;(client.llm.listProviders as ReturnType<typeof vi.fn>).mockImplementation(() => ok([{ id: 'acme', name: 'Acme' }]))
      ;(client.llm.listConfigurableProviders as ReturnType<typeof vi.fn>).mockImplementation(() => ok([
        { provider: 'acme', displayName: 'Acme', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'acme'] },
      ]))
      ;(client.llm.discoverModels as ReturnType<typeof vi.fn>).mockImplementation(() => ok([{ id: 'm1' }]))
    })
    terminal.handleInput(`/providers${ENTER}`)
    await flush()
    terminal.handleInput(ENTER)
    await flush()
    terminal.handleInput(ENTER)
    await flush()
    terminal.handleInput(`sk-acme${ENTER}`)
    await flush()
    terminal.handleInput(ESC)
    await flush()
    expect(remote.settings.mutate).not.toHaveBeenCalled()
  })

  it('picks a row of a single-choice list the flow marked, then confirms with Enter on the first row of a multiple choice', async () => {
    const { terminal, io } = screens()
    terminal.handleInput(`/providers${ENTER}`)
    await flush()
    terminal.handleInput(ENTER)
    await flush()
    expect(visible(io.text)).toContain('Another server')
    terminal.handleInput(UP)
    terminal.handleInput(ENTER)
    await flush()
    expect(visible(io.text)).toContain('Name for the provider')
    terminal.handleInput(ESC)
    await flush()
  })

  it('switches the permission preset of the open session through its command', async () => {
    const { terminal, session, remote } = screens((client) => {
      ;(client.permissionPresets.catalog as ReturnType<typeof vi.fn>).mockImplementation(() => ok({
        options: [{ value: 'default', name: 'Default' }], defaultOptions: [], defaultPreset: 'default',
      }))
    })
    session.command.mockResolvedValue({ ok: true, value: { matched: true } })
    terminal.handleInput(`/permissions${ENTER}`)
    await flush()
    terminal.handleInput(ENTER)
    await flush()
    expect(session.command).toHaveBeenCalledWith('/permission default')
    expect(remote.settings.mutate).not.toHaveBeenCalled()
  })

  it('prints a failure of the Host in red above the composer', async () => {
    const { terminal, io } = screens((client) => {
      ;(client.web.searchProviders as ReturnType<typeof vi.fn>).mockImplementation(() => Promise.resolve({ ok: false, error: { code: 'x', message: 'host is down' } }))
    })
    terminal.handleInput(`/web-search${ENTER}`)
    await flush()
    expect(visible(io.text)).toContain('host is down')
    terminal.dispose()
  })

  it('reports a screen that stops with a thrown text', async () => {
    const { terminal, io } = screens((client) => {
      ;(client.session.modelCatalog as ReturnType<typeof vi.fn>).mockImplementation(() => { throw 'plain text' })
    })
    terminal.handleInput(`/providers${ENTER}`)
    await flush()
    expect(visible(io.text)).toContain('The screen stopped: plain text')
  })

  it('reports a screen that stops with an error', async () => {
    const { terminal, io } = screens((client) => {
      ;(client.session.modelCatalog as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error('boom') })
    })
    terminal.handleInput(`/providers${ENTER}`)
    await flush()
    expect(visible(io.text)).toContain('The screen stopped: boom')
  })

  it('stops a screen waiting on the person when the session closes, and ignores answers that arrive later', async () => {
    const opened = screens()
    opened.terminal.handleInput(`/web-search${ENTER}`)
    await flush()
    opened.terminal.handleInput(DOWN)
    opened.terminal.handleInput(ENTER)
    await flush()
    opened.terminal.dispose()
    await flush()
    expect(opened.remote.credentials.set).not.toHaveBeenCalled()

    const picker = screens()
    picker.terminal.handleInput(`/web-search${ENTER}`)
    await flush()
    picker.terminal.dispose()
    await flush()

    let finish: (models: { id: string }[]) => void = () => {}
    const late = screens((client) => {
      ;(client.llm.discoverModels as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise((resolve) => {
        finish = (models) => { resolve({ ok: true, value: models }) }
      }))
    })
    late.terminal.handleInput(`/providers${ENTER}`)
    await flush()
    late.terminal.handleInput(ENTER)
    await flush()
    late.terminal.handleInput(UP)
    late.terminal.handleInput(ENTER)
    await flush()
    for (const answer of ['gw', 'GW', 'http://x/v1', '', '']) {
      late.terminal.handleInput(`${answer}${ENTER}`)
      await flush()
    }
    late.terminal.dispose()
    finish([{ id: 'm1' }])
    await flush()
    expect(late.remote.settings.mutate).not.toHaveBeenCalled()

    let finishEmpty: (models: { id: string }[]) => void = () => {}
    const lateTyped = screens((client) => {
      ;(client.llm.discoverModels as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise((resolve) => {
        finishEmpty = (models) => { resolve({ ok: true, value: models }) }
      }))
    })
    lateTyped.terminal.handleInput(`/providers${ENTER}`)
    await flush()
    lateTyped.terminal.handleInput(ENTER)
    await flush()
    lateTyped.terminal.handleInput(UP)
    lateTyped.terminal.handleInput(ENTER)
    await flush()
    for (const answer of ['gw', 'GW', 'http://x/v1', '', '']) {
      lateTyped.terminal.handleInput(`${answer}${ENTER}`)
      await flush()
    }
    lateTyped.terminal.dispose()
    finishEmpty([])
    await flush()
    expect(lateTyped.remote.settings.mutate).not.toHaveBeenCalled()
  })

  it('draws a single-choice question that arrives after the session closed as no answer', async () => {
    let release: () => void = () => {}
    const { terminal, remote } = screens((client) => {
      ;(client.web.searchProviders as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise((resolve) => {
        release = () => { resolve({ ok: false, error: { code: 'x', message: 'late failure' } }) }
      }))
    })
    terminal.handleInput(`/web-search${ENTER}`)
    terminal.dispose()
    release()
    await flush()
    expect(remote.settings.mutate).not.toHaveBeenCalled()
  })

  it('ignores a list the flow opens after the session closed', async () => {
    let release: () => void = () => {}
    const { terminal, remote } = screens((client) => {
      ;(client.web.searchProviders as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise((resolve) => {
        release = () => { resolve({ ok: true, value: [{ id: 'brave', credentialRef: 'BRAVE' }] }) }
      }))
    })
    terminal.handleInput(`/web-search${ENTER}`)
    terminal.dispose()
    release()
    await flush()
    expect(remote.settings.mutate).not.toHaveBeenCalled()
  })
})
