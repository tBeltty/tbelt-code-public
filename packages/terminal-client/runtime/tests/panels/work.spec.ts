import { afterEach, describe, expect, it, vi } from 'vitest'
import { runJobs } from '../../src/panels/jobs.ts'
import { runSkills } from '../../src/panels/skills.ts'
import { runSubagents } from '../../src/panels/subagents.ts'
import { Cell, fakePanelContext, scriptedUi, withProjection } from '../fakes.ts'

const texts = (log: { kind: string; text: string }[], kind: string) => log.filter(entry => entry.kind === kind).map(entry => entry.text)
const failure = { ok: false as const, error: { code: 'x', message: 'refused' } }

afterEach(() => { vi.useRealTimers() })

describe('skills panel', () => {
  const skills = { ok: true as const, value: { skills: [{ name: 'review', description: 'Review changes' }] } }

  it('reports a failed listing and an empty one', async () => {
    const ctx = fakePanelContext()
    ctx.remote.skills.list.mockResolvedValueOnce(failure)
    const failed = scriptedUi([])
    await runSkills(ctx, failed.ui)
    expect(texts(failed.log, 'warn')).toEqual(['Could not list skills: refused'])
    const empty = scriptedUi([])
    await runSkills(ctx, empty.ui)
    expect(texts(empty.log, 'info')).toEqual(['No skills are installed.'])
  })

  it('leaves without a choice or without arguments', async () => {
    const ctx = fakePanelContext()
    ctx.remote.skills.list.mockResolvedValue(skills)
    await runSkills(ctx, scriptedUi([undefined]).ui)
    await runSkills(ctx, scriptedUi(['review', undefined]).ui)
    expect(ctx.session.prompt).not.toHaveBeenCalled()
  })

  it('runs a skill by sending its command as a message', async () => {
    const ctx = fakePanelContext()
    ctx.remote.skills.list.mockResolvedValue(skills)
    const { ui, log } = scriptedUi(['review', 'src/'])
    await runSkills(ctx, ui)
    expect(ctx.remote.skills.list).toHaveBeenCalledWith({ sessionId: 'session-3f9a0c1e-0000' })
    expect(ctx.session.prompt).toHaveBeenCalledWith([{ type: 'text', text: '/review src/' }], 'queue')
    expect(log.filter(entry => entry.kind === 'pick')[0]!.items).toEqual([{ value: 'review', label: '/review', detail: 'Review changes' }])
  })

  it('says why a skill could not run', async () => {
    const ctx = fakePanelContext()
    ctx.remote.skills.list.mockResolvedValue(skills)
    ctx.session.prompt.mockResolvedValueOnce(failure)
    const { ui, log } = scriptedUi(['review', ''])
    await runSkills(ctx, ui)
    expect(texts(log, 'warn')).toEqual(['Could not run /review: refused'])
  })
})

describe('subagents panel', () => {
  const catalog = [
    { id: 'session-child-1', mode: 'continuable', label: 'Researcher' },
    { id: 'session-child-2', mode: 'one-shot' },
  ]
  const rig = () => {
    const ctx = fakePanelContext()
    withProjection(ctx, { subagentCatalog: catalog })
    return ctx
  }

  it('says so when the session has started none', async () => {
    const { ui, log } = scriptedUi([])
    await runSubagents(fakePanelContext(), ui)
    expect(texts(log, 'info')).toEqual(['This session has not started a subagent.'])
  })

  it('leaves without a choice', async () => {
    await runSubagents(rig(), scriptedUi([undefined]).ui)
    const ctx = rig()
    await runSubagents(ctx, scriptedUi(['session-child-1', undefined]).ui)
    expect(ctx.leave).not.toHaveBeenCalled()
  })

  it('offers sending and interrupting only for a child that can be continued', async () => {
    const continuable = scriptedUi(['session-child-1', undefined])
    await runSubagents(rig(), continuable.ui)
    expect(continuable.log.filter(entry => entry.kind === 'pick')[1]!.items!.map(item => item.value)).toEqual(['open', 'send', 'interrupt'])
    const oneShot = scriptedUi(['session-child-2', undefined])
    await runSubagents(rig(), oneShot.ui)
    expect(oneShot.log.filter(entry => entry.kind === 'pick')[1]!.items!.map(item => item.value)).toEqual(['open'])
  })

  it('opens a child as a session of its own', async () => {
    const ctx = rig()
    await runSubagents(ctx, scriptedUi(['session-child-2', 'open']).ui)
    expect(ctx.leave).toHaveBeenCalledWith({ kind: 'resume', sessionId: 'session-child-2' })
  })

  it('sends a message to the child', async () => {
    const ctx = rig()
    const { ui, log } = scriptedUi(['session-child-1', 'send', 'check the logs'])
    await runSubagents(ctx, ui)
    expect(ctx.remote.subagents.prompt).toHaveBeenCalledWith({
      requestId: expect.any(String), parentSessionId: 'session-3f9a0c1e-0000', childSessionId: 'session-child-1',
      mode: 'continuable', delivery: 'queue', content: [{ type: 'text', text: 'check the logs' }],
    })
    expect(texts(log, 'info')).toEqual(['Sent the message to the subagent.'])
  })

  it('does not send an empty message or one the person left', async () => {
    const ctx = rig()
    await runSubagents(ctx, scriptedUi(['session-child-1', 'send', '']).ui)
    await runSubagents(ctx, scriptedUi(['session-child-1', 'send', undefined]).ui)
    expect(ctx.remote.subagents.prompt).not.toHaveBeenCalled()
  })

  it('says why the child did not take a message', async () => {
    const ctx = rig()
    ctx.remote.subagents.prompt.mockResolvedValueOnce(failure)
    const { ui, log } = scriptedUi(['session-child-1', 'send', 'hi'])
    await runSubagents(ctx, ui)
    expect(texts(log, 'warn')).toEqual(['The subagent did not accept it: refused'])
  })

  it('interrupts the child', async () => {
    const ctx = rig()
    const { ui, log } = scriptedUi(['session-child-1', 'interrupt'])
    await runSubagents(ctx, ui)
    expect(ctx.remote.subagents.interruptByParent).toHaveBeenCalledWith('session-child-1', 'session-3f9a0c1e-0000', 'continuable')
    expect(texts(log, 'info')).toEqual(['Asked the subagent to stop.'])
    ctx.remote.subagents.interruptByParent.mockResolvedValueOnce(failure)
    const failed = scriptedUi(['session-child-1', 'interrupt'])
    await runSubagents(ctx, failed.ui)
    expect(texts(failed.log, 'warn')).toEqual(['The subagent did not accept it: refused'])
  })
})

const row = (over = {}) => ({ id: 'j1', kind: 'shell', label: 'npm test', status: 'running' as const, startedAt: 9_000_000, ...over })

describe('jobs panel', () => {
  const rig = (rows = [row(), row({ id: 'j2', status: 'completed', finishedAt: 9_500_000 })]) => {
    const ctx = fakePanelContext()
    ctx.services.jobs.state.set({ rows: { 'session-3f9a0c1e-0000': rows }, observed: {} })
    return ctx
  }

  it('says so when no job exists', async () => {
    const { ui, log } = scriptedUi([])
    await runJobs(fakePanelContext(), ui)
    expect(texts(log, 'info')).toEqual(['No background jobs.'])
  })

  it('leaves without a choice', async () => {
    await runJobs(rig(), scriptedUi([undefined]).ui)
    const ctx = rig()
    await runJobs(ctx, scriptedUi(['j1', undefined]).ui)
    expect(ctx.services.jobs.observe).not.toHaveBeenCalled()
    expect(ctx.services.jobs.kill).not.toHaveBeenCalled()
  })

  it('offers to stop only a job that runs', async () => {
    const running = scriptedUi(['j1', undefined])
    await runJobs(rig(), running.ui)
    expect(running.log.filter(entry => entry.kind === 'pick')[1]!.items!.map(item => item.value)).toEqual(['output', 'kill'])
    const done = scriptedUi(['j2', undefined])
    await runJobs(rig(), done.ui)
    expect(done.log.filter(entry => entry.kind === 'pick')[1]!.items!.map(item => item.value)).toEqual(['output'])
  })

  it('shows output that is already there and stops observing', async () => {
    const ctx = rig()
    ctx.services.jobs.state.set({ rows: ctx.services.jobs.state.getSnapshot().rows, observed: { j1: { text: 'ok\n', gapBefore: false, streaming: false } } })
    const { ui, log } = scriptedUi(['j1', 'output'])
    await runJobs(ctx, ui)
    expect(ctx.services.jobs.observe).toHaveBeenCalledWith('session-3f9a0c1e-0000', 'j1')
    expect(texts(log, 'show')).toEqual(['ok'])
    expect(ctx.services.jobs.stopObserving).toHaveBeenCalledTimes(1)
  })

  it('waits for the first output of a job and stops listening once it arrives', async () => {
    const ctx = rig()
    const state = ctx.services.jobs.state as Cell<ReturnType<typeof ctx.services.jobs.state.getSnapshot>>
    const { ui, log } = scriptedUi(['j1', 'output'])
    const running = runJobs(ctx, ui)
    await vi.waitFor(() => { expect(state.listeners).toBeGreaterThan(0) })
    state.set({ rows: state.getSnapshot().rows, observed: { j1: { text: '', gapBefore: false, streaming: true } } })
    expect(state.listeners).toBeGreaterThan(0)
    state.set({ rows: state.getSnapshot().rows, observed: { j1: { text: 'first line\n', gapBefore: false, streaming: true } } })
    await running
    expect(state.listeners).toBe(0)
    expect(texts(log, 'show')).toEqual(['first line\nStill running. Open the job again for more.'])
  })

  it('shows what exists once the wait for output runs out', async () => {
    vi.useFakeTimers()
    const ctx = rig()
    const { ui, log } = scriptedUi(['j1', 'output'])
    const running = runJobs(ctx, ui)
    await vi.advanceTimersByTimeAsync(2500)
    await running
    expect(texts(log, 'show')).toEqual(['No output yet.'])
    expect(ctx.services.jobs.state instanceof Cell && ctx.services.jobs.state.listeners).toBe(0)
  })

  it('asks a running job to stop and says when it had already finished', async () => {
    const ctx = rig()
    const requested = scriptedUi(['j1', 'kill'])
    await runJobs(ctx, requested.ui)
    expect(ctx.services.jobs.kill).toHaveBeenCalledWith('session-3f9a0c1e-0000', 'j1')
    expect(texts(requested.log, 'info')).toEqual(['Asked the job to stop.'])
    ctx.services.jobs.kill.mockResolvedValueOnce({ ok: true, value: { outcome: 'already-finished' } })
    const finished = scriptedUi(['j1', 'kill'])
    await runJobs(ctx, finished.ui)
    expect(texts(finished.log, 'info')).toEqual(['The job had already finished.'])
    ctx.services.jobs.kill.mockResolvedValueOnce(failure)
    const failed = scriptedUi(['j1', 'kill'])
    await runJobs(ctx, failed.ui)
    expect(texts(failed.log, 'warn')).toEqual(['Could not stop the job: refused'])
  })
})
