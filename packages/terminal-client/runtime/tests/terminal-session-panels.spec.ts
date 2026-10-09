import { describe, expect, it, vi } from 'vitest'
import { TerminalSession } from '../src/terminal-session.ts'
import type { TerminalSessionOptions } from '../src/terminal-session.ts'
import { fakeBinding, fakeDeps, fakeIo, plain, visible } from './fakes.ts'

const ENTER = '\r'
const ESC = '\u001B'
const TAB = '\t'
const BACKSPACE = '\u007F'
const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))
type Mocked = ReturnType<typeof vi.fn>
const ok = <T>(value: T) => Promise.resolve({ ok: true as const, value })
const text = (value: string) => ({ type: 'text', text: value })

function open(overrides: Partial<TerminalSessionOptions> = {}) {
  const parts = fakeBinding()
  const io = fakeIo()
  const switches: unknown[] = []
  const deps = overrides.deps ?? fakeDeps()
  const terminal = new TerminalSession({
    binding: parts.binding, io, style: plain, cwd: '/work/app', home: '/home/me', resumed: false, deps,
    onExit: () => {}, onSwitch: target => switches.push(target), ...overrides,
  })
  terminal.start()
  return { ...parts, io, switches, deps: deps as ReturnType<typeof fakeDeps>, terminal }
}

const queued = { 'next-turn': [{ id: 'm1', content: [text('fix the build')], source: { kind: 'user' } }], 'next-step': [] }

describe('TerminalSession panels', () => {
  it('shows how many messages wait and lets the person edit one with /queue', async () => {
    const { terminal, io, session } = open()
    session.project('inbox', queued)
    expect(visible(io.text)).toContain('1 queued · /queue edits them')
    terminal.handleInput(`/queue${ENTER}`)
    await flush()
    expect(visible(io.text)).toContain('Queue')
    terminal.handleInput(ENTER)
    await flush()
    terminal.handleInput(ENTER)
    await flush()
    terminal.handleInput(`${BACKSPACE.repeat('fix the build'.length)}fix the tests${ENTER}`)
    await flush()
    expect(session.updateQueue).toHaveBeenCalledWith('m1', { kind: 'edit', content: [{ type: 'text', text: 'fix the tests' }] })
    const before = io.text.length
    session.project('inbox', { 'next-turn': [], 'next-step': [] })
    expect(visible(io.text.slice(before))).not.toContain('queued')
  })

  it('prints a report above the composer with /status', async () => {
    const { terminal, io, session } = open()
    session.project('title', 'Fix the login')
    session.setRunning(true)
    terminal.handleInput(`/status${ENTER}`)
    await flush()
    const report = visible(io.text)
    expect(report).toContain('Fix the login')
    expect(report).toContain('Session     3f9a0c1e')
    expect(report).toContain('State       working')
  })

  it('reads the events of the session and the projections for /deliverables and /plan show', async () => {
    const { terminal, io } = open()
    terminal.handleInput(`/deliverables${ENTER}`)
    await flush()
    expect(visible(io.text)).toContain('No turn has changed or presented files yet.')
    terminal.handleInput(`/plan show${ENTER}`)
    await flush()
    expect(visible(io.text)).toContain('The agent has not submitted a plan in the loaded history.')
  })

  it('runs a skill from /skills as a message', async () => {
    const deps = fakeDeps()
    ;(deps.client.skills.list as Mocked).mockImplementation(() => ok({ skills: [{ name: 'review', description: 'Review changes' }] }))
    const { terminal, session } = open({ deps })
    terminal.handleInput(`/skills${ENTER}`)
    await flush()
    terminal.handleInput(ENTER)
    await flush()
    terminal.handleInput(`src/${ENTER}`)
    await flush()
    expect(session.prompt).toHaveBeenCalledWith([{ type: 'text', text: '/review src/' }], 'queue')
  })

  it('puts a command from /commands in the composer', async () => {
    const deps = fakeDeps()
    ;(deps.client.commands.list as Mocked).mockImplementation(() => ok([{ name: 'review', description: 'Review changes' }]))
    const { terminal, io } = open({ deps })
    terminal.handleInput(`/commands${ENTER}`)
    await flush()
    terminal.handleInput(ENTER)
    await flush()
    expect(visible(io.text.slice(io.text.lastIndexOf('›')))).toContain('/review ')
  })

  it('leaves for the copy a panel opens', async () => {
    const { terminal, switches } = open()
    terminal.handleInput(`/fork${ENTER}`)
    await flush()
    terminal.handleInput(ENTER)
    await flush()
    expect(switches).toEqual([{ kind: 'resume', sessionId: 'session-forked' }])
  })

  it('draws nothing more once a panel finishes after the session closed', async () => {
    const { terminal, io, deps } = open()
    let release: () => void = () => {}
    ;(deps.client.spendBudget.summary as Mocked).mockImplementation(() => new Promise((resolve) => {
      release = () => { resolve({ ok: true, value: { session: { spentUsd: 0, unpricedCalls: 0 }, month: '2026-10', monthly: { spentUsd: 0, unpricedCalls: 0 } } }) }
    }))
    terminal.handleInput(`/budget${ENTER}`)
    terminal.dispose()
    const before = io.text
    release()
    await flush()
    expect(io.text).toBe(before)
  })
})

describe('TerminalSession references', () => {
  const rig = (files: { path: string; kind: 'file' | 'directory' }[] = [{ path: 'src/app.ts', kind: 'file' }]) => {
    const deps = fakeDeps()
    ;(deps.client.fileReferences.list as Mocked).mockImplementation(() => ok(files))
    return open({ deps })
  }

  it('completes the file after @ with Tab', async () => {
    const { terminal, io, deps } = rig()
    terminal.handleInput('look at @sr')
    terminal.handleInput(TAB)
    await flush()
    expect(deps.client.fileReferences.list).toHaveBeenCalledWith('session-3f9a0c1e-0000', 'sr')
    expect(visible(io.text)).toContain('Reference')
    terminal.handleInput(ENTER)
    expect(visible(io.text.slice(io.text.lastIndexOf('›')))).toContain('look at @src/app.ts ')
  })

  it('lists sessions beside files and leaves a directory open', async () => {
    const { terminal, io, deps } = rig([{ path: 'src', kind: 'directory' }])
    ;(deps.client.sessionReferenceResolver.candidates as Mocked).mockImplementation(() => ok([
      { sessionId: 'session-other', label: 'Other work', mention: '@session-other' },
    ]))
    terminal.handleInput('@')
    terminal.handleInput(TAB)
    await flush()
    expect(visible(io.text)).toContain('Other work')
    terminal.handleInput(ENTER)
    expect(visible(io.text.slice(io.text.lastIndexOf('›')))).toContain('@src/')
    expect(visible(io.text.slice(io.text.lastIndexOf('›')))).not.toContain('@src/ ')
  })

  it('says when nothing matches and when the list cannot be read', async () => {
    const empty = rig([])
    empty.terminal.handleInput('@zz')
    empty.terminal.handleInput(TAB)
    await flush()
    expect(visible(empty.io.text)).toContain('Nothing matches @zz.')
    const broken = rig()
    ;(broken.deps.client.fileReferences.list as Mocked).mockImplementation(() => Promise.resolve({ ok: false, error: { code: 'x', message: 'offline' } }))
    broken.terminal.handleInput('@a')
    broken.terminal.handleInput(TAB)
    await flush()
    expect(visible(broken.io.text)).toContain('Could not list references: offline')
    const thrown = rig()
    ;(thrown.deps.client.fileReferences.list as Mocked).mockImplementation(() => Promise.reject(new Error('gone')))
    ;(thrown.deps.client.sessionReferenceResolver.candidates as Mocked).mockImplementation(() => Promise.reject(new Error('plain')))
    thrown.terminal.handleInput('@a')
    thrown.terminal.handleInput(TAB)
    await flush()
    expect(visible(thrown.io.text)).toContain('Could not list references: gone')
  })

  it('still offers files when the session lookup fails', async () => {
    const { terminal, io, deps } = rig()
    ;(deps.client.sessionReferenceResolver.candidates as Mocked).mockImplementation(() => Promise.resolve({ ok: false, error: { code: 'x', message: 'no' } }))
    terminal.handleInput('@a')
    terminal.handleInput(TAB)
    await flush()
    expect(visible(io.text)).toContain('src/app.ts')
  })

  it('refuses a name that cannot be written as a reference', async () => {
    const { terminal, io } = rig([{ path: 'bad"name', kind: 'file' }])
    terminal.handleInput('@b')
    terminal.handleInput(TAB)
    await flush()
    terminal.handleInput(ENTER)
    expect(visible(io.text)).toContain('That name cannot be written as a reference.')
  })

  it('shows nothing when the answer arrives after another screen opened or the session closed', async () => {
    const { terminal, io, deps } = rig()
    let release: () => void = () => {}
    ;(deps.client.fileReferences.list as Mocked).mockImplementation(() => new Promise((resolve) => {
      release = () => { resolve({ ok: true, value: [{ path: 'src/app.ts', kind: 'file' }] }) }
    }))
    terminal.handleInput('@a')
    terminal.handleInput(TAB)
    terminal.handleInput(`${BACKSPACE}${BACKSPACE}/sessions${ENTER}`)
    release()
    await flush()
    expect(visible(io.text)).not.toContain('Reference')
    terminal.handleInput(ESC)
    terminal.handleInput(TAB)
    terminal.dispose()
    release()
    await flush()
    expect(visible(io.text)).not.toContain('Reference')
  })
})

describe('TerminalSession files', () => {
  const pdf = { kind: 'file' as const, file: { name: 'report.pdf', data: Uint8Array.from([1, 2, 3]) } }

  it('uploads a file and sends its receipt with the next message', async () => {
    const deps = fakeDeps()
    deps.files.readAttachment.mockResolvedValueOnce(pdf)
    const { terminal, io, session } = open({ deps })
    terminal.handleInput(`/attach docs/report.pdf${ENTER}`)
    await flush()
    expect(deps.services.fileUpload.upload).toHaveBeenCalledWith('session-3f9a0c1e-0000', pdf.file.data, 'report.pdf')
    expect(visible(io.text)).toContain('Attached report.pdf. It goes with your next message (1 waiting).')
    terminal.handleInput(`summarise${ENTER}`)
    await flush()
    expect(session.prompt.mock.calls[0]![0]).toEqual([{ type: 'text', text: 'summarise' }, { type: 'file', receiptId: 'receipt-1' }])
  })

  it('says why an upload failed and attaches nothing', async () => {
    const deps = fakeDeps()
    deps.files.readAttachment.mockResolvedValueOnce(pdf)
    deps.services.fileUpload.upload.mockResolvedValueOnce({ ok: false, error: { code: 'x', message: 'too big for the host' } })
    const { terminal, io } = open({ deps })
    terminal.handleInput(`/attach report.pdf${ENTER}`)
    await flush()
    expect(visible(io.text)).toContain('Could not upload report.pdf: too big for the host')
    terminal.handleInput(`/detach${ENTER}`)
    expect(visible(io.text)).toContain('Nothing is attached.')
  })
})

describe('TerminalSession unknown commands', () => {
  const unmatched = { ok: true as const, value: { matched: false } }

  it('sends a name that matches a skill as a message', async () => {
    const deps = fakeDeps()
    ;(deps.client.skills.list as Mocked).mockImplementation(() => ok({ skills: [{ name: 'review', description: 'Review' }] }))
    const { terminal, session } = open({ deps })
    session.command.mockResolvedValueOnce(unmatched)
    terminal.handleInput(`/review src/${ENTER}`)
    await flush()
    expect(session.prompt).toHaveBeenCalledWith([{ type: 'text', text: '/review src/' }], 'queue')
  })

  it('says so for a name that is no command and no skill, and when skills cannot be listed', async () => {
    const deps = fakeDeps()
    ;(deps.client.skills.list as Mocked).mockImplementation(() => ok({ skills: [{ name: 'review', description: 'Review' }] }))
    const { terminal, io, session } = open({ deps })
    session.command.mockResolvedValue(unmatched)
    terminal.handleInput(`/nope${ENTER}`)
    await flush()
    expect(visible(io.text)).toContain('There is no /nope command. Type /help for the commands.')
    ;(deps.client.skills.list as Mocked).mockImplementation(() => Promise.reject(new Error('offline')))
    terminal.handleInput(`/review${ENTER}`)
    await flush()
    expect(visible(io.text)).toContain('There is no /review command.')
    expect(session.prompt).not.toHaveBeenCalled()
  })
})
