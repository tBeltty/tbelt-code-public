import { describe, expect, it } from 'vitest'
import type { TranscriptEvent } from '@deepseek-ai/dsh-terminal-views'
import { runBudget } from '../../src/panels/budget.ts'
import { runCommands } from '../../src/panels/commands.ts'
import { runFork } from '../../src/panels/fork.ts'
import { runOpen } from '../../src/panels/open.ts'
import { runOrganize } from '../../src/panels/organize.ts'
import { runPlan } from '../../src/panels/plan.ts'
import { runStatus } from '../../src/panels/status.ts'
import { callEvent, fakePanelContext, scriptedUi, turnEnd, userEvent, withProjection } from '../fakes.ts'

const texts = (log: { kind: string; text: string }[], kind: string) => log.filter(entry => entry.kind === kind).map(entry => entry.text)
const failure = { ok: false as const, error: { code: 'x', message: 'refused' } }
const SESSION = 'session-3f9a0c1e-0000'

describe('fork panel', () => {
  const start = (turn: number) => ({ type: 'turn/start', seq: turn * 100, time: 1, data: { turn } }) as unknown as TranscriptEvent
  const rig = () => {
    const events: TranscriptEvent[] = [start(1), userEvent('Fix the build'), turnEnd()]
    const ctx = fakePanelContext()
    Object.assign(ctx.session, { events: () => events })
    return { ctx, endSeq: String(events[2]!.seq) }
  }

  it('forks at the end of the conversation and opens the copy', async () => {
    const { ctx } = rig()
    const { ui, log } = scriptedUi(['end'])
    await runFork(ctx, ui)
    expect(ctx.remote.session.fork).toHaveBeenCalledWith({ sessionId: SESSION })
    expect(texts(log, 'info')).toEqual(['Forked. Opening the copy.'])
    expect(ctx.leave).toHaveBeenCalledWith({ kind: 'resume', sessionId: 'session-forked' })
  })

  it('forks after a chosen turn', async () => {
    const { ctx, endSeq } = rig()
    const { ui, log } = scriptedUi([endSeq])
    await runFork(ctx, ui)
    expect(log[0]!.items!.map(item => item.label)).toEqual(['The end of the conversation', 'After turn 1: Fix the build'])
    expect(ctx.remote.session.fork).toHaveBeenCalledWith({ sessionId: SESSION, atSeq: Number(endSeq) })
  })

  it('leaves without a choice and reports a refusal', async () => {
    const { ctx } = rig()
    await runFork(ctx, scriptedUi([undefined]).ui)
    expect(ctx.remote.session.fork).not.toHaveBeenCalled()
    ctx.remote.session.fork.mockResolvedValueOnce(failure)
    const refused = scriptedUi(['end'])
    await runFork(ctx, refused.ui)
    expect(texts(refused.log, 'warn')).toEqual(['Could not fork the session: refused'])
    expect(ctx.leave).not.toHaveBeenCalled()
  })
})

describe('organize panel', () => {
  const choices = [
    { id: 'session-a', title: 'Alpha', cwd: '/work/app', blank: false, updatedAt: 9_999_000 },
    { id: SESSION, title: 'Current', cwd: '/work/app', blank: false, updatedAt: 9_000_000 },
  ]
  const rig = (state: { archived?: string[]; pinned?: string[]; running?: boolean } = {}) => {
    const ctx = fakePanelContext({ sessions: () => choices })
    ctx.services.workspaces.list.set({ items: [], archivedSessionIds: state.archived ?? [], pinnedSessionIds: state.pinned ?? [], phase: 'ready' })
    Object.assign(ctx.session, { running: () => state.running === true })
    return ctx
  }

  it('leaves at either choice', async () => {
    const ctx = rig()
    await runOrganize(ctx, scriptedUi([undefined]).ui)
    await runOrganize(ctx, scriptedUi(['session-a', undefined]).ui)
    expect(ctx.services.workspaces.archiveSession).not.toHaveBeenCalled()
  })

  it('archives another session, pins it and says so', async () => {
    const ctx = rig()
    const archive = scriptedUi(['session-a', 'archive'])
    await runOrganize(ctx, archive.ui)
    expect(ctx.services.workspaces.archiveSession).toHaveBeenCalledWith('session-a', undefined)
    expect(texts(archive.log, 'info')).toEqual(['Archived.'])
    await runOrganize(ctx, scriptedUi(['session-a', 'pin']).ui)
    expect(ctx.services.workspaces.pinSession).toHaveBeenCalledWith('session-a')
  })

  it('offers the inverse of what already holds', async () => {
    const ctx = rig({ archived: ['session-a'], pinned: ['session-a'] })
    const archived = scriptedUi(['session-a', 'unarchive'])
    await runOrganize(ctx, archived.ui)
    expect(archived.log[1]!.items!.map(item => item.value)).toEqual(['unarchive', 'unpin'])
    expect(texts(archived.log, 'info')).toEqual(['Brought back.'])
    const unpinned = scriptedUi(['session-a', 'unpin'])
    await runOrganize(ctx, unpinned.ui)
    expect(texts(unpinned.log, 'info')).toEqual(['Unpinned.'])
    expect(ctx.services.workspaces.unarchiveSession).toHaveBeenCalledWith('session-a')
    expect(ctx.services.workspaces.unpinSession).toHaveBeenCalledWith('session-a')
  })

  it('asks before stopping the running session it archives', async () => {
    const ctx = rig({ running: true })
    await runOrganize(ctx, scriptedUi([SESSION, 'archive', 'no']).ui)
    expect(ctx.services.workspaces.archiveSession).not.toHaveBeenCalled()
    await runOrganize(ctx, scriptedUi([SESSION, 'archive', undefined]).ui)
    expect(ctx.services.workspaces.archiveSession).not.toHaveBeenCalled()
    await runOrganize(ctx, scriptedUi([SESSION, 'archive', 'yes']).ui)
    expect(ctx.services.workspaces.archiveSession).toHaveBeenCalledWith(SESSION, { stopActivity: true })
  })

  it('does not ask about a session that is idle or another one', async () => {
    const ctx = rig({ running: true })
    await runOrganize(ctx, scriptedUi(['session-a', 'archive']).ui)
    expect(ctx.services.workspaces.archiveSession).toHaveBeenCalledWith('session-a', undefined)
  })

  it('reports a refusal without announcing success', async () => {
    const ctx = rig()
    ctx.services.workspaces.archiveSession.mockRejectedValueOnce(new Error('busy'))
    ctx.services.workspaces.pinSession.mockRejectedValueOnce(new Error('busy'))
    const archive = scriptedUi(['session-a', 'archive'])
    await runOrganize(ctx, archive.ui)
    const pin = scriptedUi(['session-a', 'pin'])
    await runOrganize(ctx, pin.ui)
    expect(texts(archive.log, 'warn')).toEqual(['Could not change the session: busy'])
    expect(texts(pin.log, 'warn')).toEqual(['Could not change the session: busy'])
    expect(texts(pin.log, 'info')).toEqual([])
  })
})

describe('status panel', () => {
  it('prints the report from the projections', async () => {
    const ctx = fakePanelContext()
    withProjection(ctx, { title: 'Fix the login', inbox: { items: [] }, plan: { active: false } })
    Object.assign(ctx.session, { running: () => true })
    const { ui, log } = scriptedUi([])
    await runStatus(ctx, ui)
    const [report] = texts(log, 'show')
    expect(report).toContain('Fix the login')
    expect(report).toContain('Session     3f9a0c1e')
    expect(report).toContain('Directory   /work/app')
    expect(report).toContain('State       working')
    expect(report).toContain('Plan mode   off')
  })
})

describe('budget panel', () => {
  it('prints the spend of the session and the month', async () => {
    const ctx = fakePanelContext()
    const { ui, log } = scriptedUi([])
    await runBudget(ctx, ui)
    expect(ctx.remote.spendBudget.summary).toHaveBeenCalledWith(SESSION)
    expect(texts(log, 'show')[0]).toContain('This session:')
  })

  it('says why the budget could not be read', async () => {
    const ctx = fakePanelContext()
    ctx.remote.spendBudget.summary.mockResolvedValueOnce(failure)
    const { ui, log } = scriptedUi([])
    await runBudget(ctx, ui)
    expect(texts(log, 'warn')).toEqual(['Could not read the budget: refused'])
    expect(texts(log, 'show')).toEqual([])
  })
})

describe('plan panel', () => {
  it('prints the newest plan the agent submitted', async () => {
    const ctx = fakePanelContext()
    Object.assign(ctx.session, { events: () => [callEvent('p1', 'exit_plan_mode', { plan: '# Ship it\n\n- one' })] })
    const { ui, log } = scriptedUi([])
    await runPlan(ctx, ui)
    expect(texts(log, 'show')).toEqual(['Ship it\n# Ship it\n\n- one'])
  })

  it('says so when no plan was submitted', async () => {
    const { ui, log } = scriptedUi([])
    await runPlan(fakePanelContext(), ui)
    expect(texts(log, 'info')).toEqual(['The agent has not submitted a plan in the loaded history.'])
  })
})

describe('commands panel', () => {
  it('puts the chosen command in the composer', async () => {
    const ctx = fakePanelContext()
    ctx.remote.commands.list.mockResolvedValue({ ok: true, value: [
      { name: 'review', description: 'Review the changes', input: { hint: '<target>' } },
      { name: 'compact', description: 'Compact the context' },
    ] })
    const { ui, log } = scriptedUi(['review'])
    await runCommands(ctx, ui)
    expect(log[0]!.items!.map(item => item.label)).toEqual(['/compact', '/review <target>'])
    expect(ctx.session.insertText).toHaveBeenCalledWith('/review ')
  })

  it('leaves without a choice, on an empty list and on a refusal', async () => {
    const ctx = fakePanelContext()
    ctx.remote.commands.list.mockResolvedValueOnce({ ok: true, value: [{ name: 'a', description: 'A' }] })
    await runCommands(ctx, scriptedUi([undefined]).ui)
    expect(ctx.session.insertText).not.toHaveBeenCalled()
    const empty = scriptedUi([])
    await runCommands(ctx, empty.ui)
    expect(texts(empty.log, 'info')).toEqual(['The Host offers no commands.'])
    ctx.remote.commands.list.mockResolvedValueOnce(failure)
    const refused = scriptedUi([])
    await runCommands(ctx, refused.ui)
    expect(texts(refused.log, 'warn')).toEqual(['Could not list commands: refused'])
  })
})

describe('open panel', () => {
  const apps = { ok: true as const, value: [{ id: 'code', name: 'Editor', default: true }, { id: 'term', name: 'Terminal', default: false }] }

  it('opens the directory in the chosen application', async () => {
    const ctx = fakePanelContext()
    ctx.remote.session.workspacePathApplications.mockResolvedValue(apps)
    const { ui, log } = scriptedUi(['app:term'])
    await runOpen('', ctx, ui)
    expect(ctx.remote.session.workspacePathApplications).toHaveBeenCalledWith({ path: '/work/app' })
    expect(ctx.remote.session.openWorkspacePath).toHaveBeenCalledWith({ path: '/work/app', application: 'term' })
    expect(texts(log, 'info')).toEqual(['Opened /work/app.'])
  })

  it('resolves a typed path and can show it in the file manager', async () => {
    const ctx = fakePanelContext()
    ctx.remote.session.workspacePathApplications.mockResolvedValue(apps)
    await runOpen('src', ctx, scriptedUi(['reveal']).ui)
    expect(ctx.remote.session.openWorkspacePath).toHaveBeenCalledWith({ path: '/work/app/src', action: 'reveal' })
  })

  it('says when the Host cannot open applications', async () => {
    const ctx = fakePanelContext()
    ctx.remote.session.canOpenWorkspacePath.mockResolvedValueOnce({ ok: true, value: false })
    const { ui, log } = scriptedUi([])
    await runOpen('', ctx, ui)
    expect(texts(log, 'info')).toEqual(['This host cannot open applications.'])
    expect(ctx.remote.session.workspacePathApplications).not.toHaveBeenCalled()
  })

  it('stops on a refusal at each step and when the person leaves', async () => {
    const ctx = fakePanelContext()
    ctx.remote.session.workspacePathApplications.mockResolvedValueOnce(failure)
    const listing = scriptedUi([])
    await runOpen('', ctx, listing.ui)
    expect(texts(listing.log, 'warn')).toEqual(['Could not open it: refused'])
    ctx.remote.session.workspacePathApplications.mockResolvedValue(apps)
    await runOpen('', ctx, scriptedUi([undefined]).ui)
    expect(ctx.remote.session.openWorkspacePath).not.toHaveBeenCalled()
    ctx.remote.session.openWorkspacePath.mockResolvedValueOnce(failure)
    const opening = scriptedUi(['app:code'])
    await runOpen('', ctx, opening.ui)
    expect(texts(opening.log, 'warn')).toEqual(['Could not open it: refused'])
    expect(texts(opening.log, 'info')).toEqual([])
  })
})
