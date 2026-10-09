import { describe, expect, it } from 'vitest'
import type { TranscriptEvent } from '@deepseek-ai/dsh-terminal-views'
import { runDeliverables } from '../../src/panels/deliverables.ts'
import { runFeedback } from '../../src/panels/feedback.ts'
import { runGoal } from '../../src/panels/goal.ts'
import { runSchedule } from '../../src/panels/schedule.ts'
import { runTrajectory } from '../../src/panels/trajectory.ts'
import { assistantEvent, callEvent, fakePanelContext, scriptedUi, userEvent, withEvents, withProjection } from '../fakes.ts'

const texts = (log: { kind: string; text: string }[], kind: string) => log.filter(entry => entry.kind === kind).map(entry => entry.text)
const failure = { ok: false as const, error: { code: 'x', message: 'refused' } }
const SESSION = 'session-3f9a0c1e-0000'

const entry = (over = {}) => ({
  id: 's1', kind: 'every' as const, title: 'Check the build', prompt: 'run the tests', scheduledAt: '2026-10-09T12:00:00.000Z',
  sessionId: 'session-other', status: 'active' as const, everySeconds: 300, ...over,
})

describe('schedule panel', () => {
  const rig = () => {
    const ctx = fakePanelContext()
    ctx.remote.schedule.catalog.mockResolvedValue({ ok: true, value: [entry()] })
    return ctx
  }

  it('reports a failed catalog and an empty one', async () => {
    const ctx = fakePanelContext()
    ctx.remote.schedule.catalog.mockResolvedValueOnce(failure)
    const failed = scriptedUi([])
    await runSchedule(ctx, failed.ui)
    expect(texts(failed.log, 'warn')).toEqual(['Could not list follow-ups: refused'])
    const empty = scriptedUi([])
    await runSchedule(ctx, empty.ui)
    expect(texts(empty.log, 'info')).toEqual(['Nothing is scheduled.'])
  })

  it('leaves without a choice', async () => {
    await runSchedule(rig(), scriptedUi([undefined]).ui)
    const ctx = rig()
    await runSchedule(ctx, scriptedUi(['s1', undefined]).ui)
    expect(ctx.remote.schedule.update).not.toHaveBeenCalled()
  })

  it('shows when a follow-up ran', async () => {
    const ctx = rig()
    ctx.remote.schedule.history.mockResolvedValueOnce({ ok: true, value: { records: [{ scheduledAt: 'a', deliveredAt: '2026-10-09T09:00:00Z', prompt: 'run' }] } })
    const { ui, log } = scriptedUi(['s1', 'history'])
    await runSchedule(ctx, ui)
    expect(ctx.remote.schedule.history).toHaveBeenCalledWith({ sessionId: 'session-other', id: 's1', limit: 20 })
    expect(texts(log, 'show')).toEqual(['2026-10-09T09:00:00Z  run'])
  })

  it('reports a history the Host refused or no longer holds', async () => {
    const ctx = rig()
    ctx.remote.schedule.history.mockResolvedValueOnce(failure)
    const failed = scriptedUi(['s1', 'history'])
    await runSchedule(ctx, failed.ui)
    expect(texts(failed.log, 'warn')).toEqual(['Could not change the follow-up: refused'])
    ctx.remote.schedule.history.mockResolvedValueOnce({ ok: true, value: { code: 'not-found' } })
    const gone = scriptedUi(['s1', 'history'])
    await runSchedule(ctx, gone.ui)
    expect(texts(gone.log, 'warn')).toEqual(['It changed since the list was read. Open /schedule again.'])
  })

  it('changes the title and the message, comparing with the follow-up as listed', async () => {
    const ctx = rig()
    const title = scriptedUi(['s1', 'title', 'New title'])
    await runSchedule(ctx, title.ui)
    expect(title.log.find(item => item.kind === 'ask')!.options?.initial).toBe('Check the build')
    expect(ctx.remote.schedule.update).toHaveBeenCalledWith({ sessionId: 'session-other', id: 's1', expected: entry(), title: 'New title' })
    expect(texts(title.log, 'info')).toEqual(['Saved.'])
    await runSchedule(ctx, scriptedUi(['s1', 'prompt', 'run lint']).ui)
    expect(ctx.remote.schedule.update).toHaveBeenLastCalledWith(expect.objectContaining({ prompt: 'run lint' }))
  })

  it('leaves a title or message that was emptied or abandoned as it is', async () => {
    const ctx = rig()
    for (const answer of ['', undefined]) {
      await runSchedule(ctx, scriptedUi(['s1', 'title', answer]).ui)
      await runSchedule(ctx, scriptedUi(['s1', 'prompt', answer]).ui)
    }
    expect(ctx.remote.schedule.update).not.toHaveBeenCalled()
  })

  it('changes the timing with the time zone of the person', async () => {
    const ctx = rig()
    const { ui, log } = scriptedUi(['s1', 'timing', 'daily', '09:30'])
    await runSchedule(ctx, ui)
    expect(ctx.remote.schedule.update).toHaveBeenCalledWith({
      sessionId: 'session-other', id: 's1', expected: entry(), change: { kind: 'daily', daily: { time: '09:30', time_zone: 'UTC' } },
    })
    expect(log.filter(item => item.kind === 'ask').map(item => item.text)).toEqual(['Time of day, as HH:MM'])
  })

  it('asks for each kind of timing in its own words', async () => {
    const ctx = rig()
    const asked: string[] = []
    for (const [kind, typed] of [['at', '2026-12-01 09:00'], ['every', '60'], ['cron', '0 9 * * 1']] as const) {
      const { ui, log } = scriptedUi(['s1', 'timing', kind, typed])
      await runSchedule(ctx, ui)
      asked.push(...texts(log, 'ask'))
    }
    expect(asked).toEqual(['Date and time, such as 2026-12-01 09:00', 'Seconds between runs', 'Cron expression with five fields'])
    expect(ctx.remote.schedule.update).toHaveBeenCalledTimes(3)
  })

  it('refuses a timing that does not fit and leaves when none is typed', async () => {
    const ctx = rig()
    const bad = scriptedUi(['s1', 'timing', 'every', 'often'])
    await runSchedule(ctx, bad.ui)
    expect(texts(bad.log, 'warn')).toEqual(['Use a whole number of seconds above zero.'])
    await runSchedule(ctx, scriptedUi(['s1', 'timing', undefined]).ui)
    await runSchedule(ctx, scriptedUi(['s1', 'timing', 'every', '']).ui)
    await runSchedule(ctx, scriptedUi(['s1', 'timing', 'every', undefined]).ui)
    expect(ctx.remote.schedule.update).not.toHaveBeenCalled()
  })

  it('says when the Host no longer matches the list', async () => {
    const ctx = rig()
    ctx.remote.schedule.update.mockResolvedValueOnce({ ok: true, value: { updated: false } })
    const stale = scriptedUi(['s1', 'title', 'x'])
    await runSchedule(ctx, stale.ui)
    expect(texts(stale.log, 'info')).toEqual(['It changed since the list was read. Open /schedule again.'])
    ctx.remote.schedule.update.mockResolvedValueOnce({ ok: true, value: { code: 'conflict' } })
    const conflict = scriptedUi(['s1', 'title', 'x'])
    await runSchedule(ctx, conflict.ui)
    expect(texts(conflict.log, 'warn')).toEqual(['It changed since the list was read. Open /schedule again.'])
    ctx.remote.schedule.update.mockResolvedValueOnce(failure)
    const failed = scriptedUi(['s1', 'title', 'x'])
    await runSchedule(ctx, failed.ui)
    expect(texts(failed.log, 'warn')).toEqual(['Could not change the follow-up: refused'])
  })

  it('deletes a follow-up after the person confirms', async () => {
    const ctx = rig()
    const { ui, log } = scriptedUi(['s1', 'delete', 'yes'])
    await runSchedule(ctx, ui)
    expect(ctx.remote.schedule.delete).toHaveBeenCalledWith({ sessionId: 'session-other', id: 's1' })
    expect(texts(log, 'info')).toEqual(['Deleted.'])
    await runSchedule(ctx, scriptedUi(['s1', 'delete', 'no']).ui)
    expect(ctx.remote.schedule.delete).toHaveBeenCalledTimes(1)
    ctx.remote.schedule.delete.mockResolvedValueOnce(failure)
    const failed = scriptedUi(['s1', 'delete', 'yes'])
    await runSchedule(ctx, failed.ui)
    expect(texts(failed.log, 'warn')).toEqual(['Could not change the follow-up: refused'])
  })
})

const goal = (over = {}) => ({
  id: 'g1', revision: 3, objective: 'Ship it', phase: 'active' as const, maxGoalRounds: 5, roundsStarted: 1, activation: 'armed' as const, ...over,
})

describe('goal panel', () => {
  it('reports a failed read', async () => {
    const ctx = fakePanelContext()
    ctx.remote.goals.get.mockResolvedValueOnce(failure)
    const { ui, log } = scriptedUi([])
    await runGoal(ctx, ui)
    expect(texts(log, 'warn')).toEqual(['Could not change the goal: refused'])
    expect(ctx.remote.goals.create).not.toHaveBeenCalled()
  })

  it('offers to set a first goal and saves it', async () => {
    const ctx = fakePanelContext()
    const { ui, log } = scriptedUi(['create', 'Ship it'])
    await runGoal(ctx, ui)
    expect(ctx.remote.goals.create).toHaveBeenCalledWith(SESSION, { objective: 'Ship it' })
    expect(texts(log, 'info')).toEqual(['This session has no goal.', 'Saved the goal.'])
  })

  it('leaves without a goal when the person gives none', async () => {
    const ctx = fakePanelContext()
    await runGoal(ctx, scriptedUi([undefined]).ui)
    await runGoal(ctx, scriptedUi(['create', undefined]).ui)
    await runGoal(ctx, scriptedUi(['create', '']).ui)
    expect(ctx.remote.goals.create).not.toHaveBeenCalled()
    ctx.remote.goals.create.mockResolvedValueOnce(failure)
    const failed = scriptedUi(['create', 'Ship it'])
    await runGoal(ctx, failed.ui)
    expect(texts(failed.log, 'warn')).toEqual(['Could not change the goal: refused'])
  })

  const withGoal = (over = {}) => {
    const ctx = fakePanelContext()
    ctx.remote.goals.get.mockResolvedValue({ ok: true, value: goal(over) })
    return ctx
  }

  it('shows the goal and leaves without an action', async () => {
    const ctx = withGoal()
    const { ui, log } = scriptedUi([undefined])
    await runGoal(ctx, ui)
    expect(texts(log, 'show')).toEqual(['Ship it\nactive · round 1 of 5'])
  })

  it('edits the objective with the revision it read', async () => {
    const ctx = withGoal()
    const { ui, log } = scriptedUi(['edit', 'Ship it today'])
    await runGoal(ctx, ui)
    expect(log.find(item => item.kind === 'ask')!.options?.initial).toBe('Ship it')
    expect(ctx.remote.goals.edit).toHaveBeenCalledWith(SESSION, { id: 'g1', revision: 3 }, { objective: 'Ship it today' })
    expect(texts(log, 'info')).toEqual(['Saved the goal.'])
    await runGoal(ctx, scriptedUi(['edit', undefined]).ui)
    await runGoal(ctx, scriptedUi(['edit', '']).ui)
    expect(ctx.remote.goals.edit).toHaveBeenCalledTimes(1)
  })

  it('pauses, resumes and completes', async () => {
    const ctx = withGoal()
    await runGoal(ctx, scriptedUi(['pause']).ui)
    await runGoal(ctx, scriptedUi(['complete']).ui)
    expect(ctx.remote.goals.pause).toHaveBeenCalledWith(SESSION, { id: 'g1', revision: 3 })
    expect(ctx.remote.goals.complete).toHaveBeenCalledWith(SESSION, { id: 'g1', revision: 3 })
    const paused = withGoal({ phase: 'paused' })
    const { ui, log } = scriptedUi(['resume'])
    await runGoal(paused, ui)
    expect(paused.remote.goals.resume).toHaveBeenCalledWith(SESSION, { id: 'g1', revision: 3 })
    expect(texts(log, 'info')).toEqual(['Saved the goal.'])
  })

  it('does not claim success when the Host refuses a change', async () => {
    const ctx = withGoal()
    ctx.remote.goals.edit.mockResolvedValueOnce(failure)
    ctx.remote.goals.pause.mockResolvedValueOnce(failure)
    ctx.remote.goals.clear.mockResolvedValueOnce(failure)
    const edit = scriptedUi(['edit', 'x'])
    await runGoal(ctx, edit.ui)
    const pause = scriptedUi(['pause'])
    await runGoal(ctx, pause.ui)
    const clear = scriptedUi(['clear', 'yes'])
    await runGoal(ctx, clear.ui)
    for (const { log } of [edit, pause, clear]) {
      expect(texts(log, 'warn')).toEqual(['Could not change the goal: refused'])
      expect(texts(log, 'info')).toEqual([])
    }
  })

  it('clears the goal after the person confirms', async () => {
    const ctx = withGoal()
    const { ui, log } = scriptedUi(['clear', 'yes'])
    await runGoal(ctx, ui)
    expect(ctx.remote.goals.clear).toHaveBeenCalledWith(SESSION, { id: 'g1', revision: 3 })
    expect(texts(log, 'info')).toEqual(['Cleared the goal.'])
    await runGoal(ctx, scriptedUi(['clear', 'no']).ui)
    expect(ctx.remote.goals.clear).toHaveBeenCalledTimes(1)
  })
})

const write = (callId: string, path: string, turn: number) => callEvent(callId, 'write', { file_path: path, content: 'x' }, turn)

describe('deliverables panel', () => {
  const ok = (callId: string) => ({
    ...userEvent(''), type: 'tool/result' as const, data: { turn: 1, step: 1, message: { toolCallId: callId, role: 'tool', content: [] } },
  }) as unknown as TranscriptEvent
  const rig = withEvents

  it('says so when no turn produced a file', async () => {
    const { ui, log } = scriptedUi([])
    await runDeliverables(rig([]), ui)
    expect(texts(log, 'info')).toEqual(['No turn has changed or presented files yet.'])
  })

  it('prints the only turn that produced files without asking', async () => {
    const { ui, log } = scriptedUi([])
    await runDeliverables(rig([write('c1', 'a.ts', 2), ok('c1')]), ui)
    expect(texts(log, 'show')).toEqual(['Turn 2\nChanged, 1\n  a.ts'])
  })

  it('lets the person choose among several turns, newest first', async () => {
    const events = [write('c1', 'a.ts', 1), ok('c1'), write('c2', 'b.ts', 2), ok('c2')]
    const first = scriptedUi(['1'])
    await runDeliverables(rig(events), first.ui)
    expect(first.log.find(item => item.kind === 'pick')!.items!.map(item => item.value)).toEqual(['2', '1'])
    expect(texts(first.log, 'show')).toEqual(['Turn 1\nChanged, 1\n  a.ts'])
    const left = scriptedUi([undefined])
    await runDeliverables(rig(events), left.ui)
    expect(texts(left.log, 'show')).toEqual([])
  })

  it('counts presented files in the list of turns', async () => {
    const events = [
      write('c1', 'a.ts', 1), ok('c1'),
      { type: 'deliverables/presented', seq: 90, time: 1, data: { turn: 2, callId: 'p', files: [{ path: 'r.md' }] } } as unknown as TranscriptEvent,
    ]
    const { ui, log } = scriptedUi(['2'])
    await runDeliverables(rig(events), ui)
    expect(log.find(item => item.kind === 'pick')!.items!.map(item => item.detail)).toEqual(['Presented, 1', 'Changed, 1'])
  })
})

describe('trajectory panel', () => {
  const outline = [{ turn: 1, seq: 1, prompt: 'Fix it', response: 'Done' }, { turn: 2, seq: 9, prompt: 'More', response: '' }]
  const start = (turn: number, time: number) => ({ type: 'turn/start', seq: turn * 10, time, data: { turn } }) as unknown as TranscriptEvent
  const rig = (projections: Record<string, unknown>, events: TranscriptEvent[] = []) => {
    const ctx = fakePanelContext()
    withProjection(ctx, projections)
    Object.assign(ctx.session, { events: () => events })
    return ctx
  }

  it('says so when the session has no turns', async () => {
    const { ui, log } = scriptedUi([])
    await runTrajectory(rig({}), ui)
    expect(texts(log, 'info')).toEqual(['No turns yet.'])
  })

  it('shows the totals and the events of a loaded turn', async () => {
    const events = [start(1, 1000), userEvent(''), assistantEvent('x', 1, 1)].map((event, index) => ({ ...event, time: 1000 + index * 500 })) as TranscriptEvent[]
    const ctx = rig({ turnOutline: outline, sessionStats: { turns: 2, steps: 3, llmMs: 1000, toolMs: 0 } }, events)
    const { ui, log } = scriptedUi(['1'])
    await runTrajectory(ctx, ui)
    expect(texts(log, 'show')[0]).toBe('2 turns · 3 steps · model 1s · tools 0ms')
    expect(texts(log, 'show')[1]).toContain('+0.5s  you: ')
    expect(log.find(item => item.kind === 'pick')!.items!.map(item => item.value)).toEqual(['2', '1'])
  })

  it('says when the events of a turn are not loaded, and leaves without a choice', async () => {
    const ctx = rig({ turnOutline: outline })
    const missing = scriptedUi(['2'])
    await runTrajectory(ctx, missing.ui)
    expect(texts(missing.log, 'info')).toEqual([expect.stringContaining('not loaded')])
    const left = scriptedUi([undefined])
    await runTrajectory(ctx, left.ui)
    expect(texts(left.log, 'show')).toEqual([])
  })
})

describe('feedback panel', () => {
  const reply = assistantEvent('A fine answer', 1, 1)
  const rig = (events: TranscriptEvent[] = [reply]) => withEvents(events)
  const item = (rating: 'positive' | 'negative') => ({ messageId: reply.data.message.id, rating, version: 'v7' })
  const listed = (...items: ReturnType<typeof item>[]) => ({ ok: true as const, value: { ok: true as const, value: { items } } })

  it('leaves without a choice', async () => {
    await runFeedback(rig(), scriptedUi([undefined]).ui)
    const ctx = rig()
    expect(ctx.remote.sessionFeedback.record).not.toHaveBeenCalled()
  })

  it('sends feedback about the session', async () => {
    const ctx = rig()
    const { ui, log } = scriptedUi(['send', 'The summary was too long'])
    await runFeedback(ctx, ui)
    expect(ctx.remote.sessionFeedback.record).toHaveBeenCalledWith({ sessionId: SESSION, text: 'The summary was too long' })
    expect(texts(log, 'info')).toEqual(['Sent the feedback.'])
    await runFeedback(ctx, scriptedUi(['send', '']).ui)
    await runFeedback(ctx, scriptedUi(['send', undefined]).ui)
    expect(ctx.remote.sessionFeedback.record).toHaveBeenCalledTimes(1)
  })

  it('says why feedback was not taken, whether the call failed or the Host refused', async () => {
    const ctx = rig()
    ctx.remote.sessionFeedback.record.mockResolvedValueOnce(failure)
    const failed = scriptedUi(['send', 'x'])
    await runFeedback(ctx, failed.ui)
    expect(texts(failed.log, 'warn')).toEqual(['Could not save the feedback: refused'])
    ctx.remote.sessionFeedback.record.mockResolvedValueOnce({ ok: true, value: { ok: false, error: { code: 'rate-limited' } } })
    const refused = scriptedUi(['send', 'x'])
    await runFeedback(ctx, refused.ui)
    expect(texts(refused.log, 'warn')).toEqual(['Could not save the feedback: rate-limited'])
  })

  it('says when there is no reply to rate', async () => {
    const { ui, log } = scriptedUi(['rate'])
    await runFeedback(rig([]), ui)
    expect(texts(log, 'info')).toEqual(['There is no reply to rate yet.'])
  })

  it('rates the last reply with a note', async () => {
    const ctx = rig()
    ctx.remote.messageFeedback.list.mockResolvedValue(listed())
    const { ui, log } = scriptedUi(['rate', 'positive', 'Clear and short'])
    await runFeedback(ctx, ui)
    expect(ctx.remote.messageFeedback.put).toHaveBeenCalledWith({
      sessionId: SESSION, messageId: reply.data.message.id, rating: 'positive', note: 'Clear and short', ifVersion: null,
    })
    expect(texts(log, 'info')).toEqual(['Saved your rating.'])
  })

  it('rates without a note and replaces an earlier rating with its version', async () => {
    const ctx = rig()
    ctx.remote.messageFeedback.list.mockResolvedValue(listed(item('negative')))
    await runFeedback(ctx, scriptedUi(['rate', 'positive', '']).ui)
    expect(ctx.remote.messageFeedback.put).toHaveBeenCalledWith({
      sessionId: SESSION, messageId: reply.data.message.id, rating: 'positive', ifVersion: 'v7',
    })
  })

  it('does not claim a rating the Host refused', async () => {
    const ctx = rig()
    ctx.remote.messageFeedback.list.mockResolvedValue(listed())
    ctx.remote.messageFeedback.put.mockResolvedValueOnce(failure)
    const { ui, log } = scriptedUi(['rate', 'positive', ''])
    await runFeedback(ctx, ui)
    expect(texts(log, 'warn')).toEqual(['Could not save the feedback: refused'])
    expect(texts(log, 'info')).toEqual([])
  })

  it('leaves without a rating or a note', async () => {
    const ctx = rig()
    ctx.remote.messageFeedback.list.mockResolvedValue(listed())
    await runFeedback(ctx, scriptedUi(['rate', undefined]).ui)
    await runFeedback(ctx, scriptedUi(['rate', 'positive', undefined]).ui)
    expect(ctx.remote.messageFeedback.put).not.toHaveBeenCalled()
  })

  it('removes a rating with the version it read', async () => {
    const ctx = rig()
    ctx.remote.messageFeedback.list.mockResolvedValue(listed(item('positive')))
    const { ui, log } = scriptedUi(['rate', 'remove'])
    await runFeedback(ctx, ui)
    expect(ctx.remote.messageFeedback.delete).toHaveBeenCalledWith({ sessionId: SESSION, messageId: reply.data.message.id, ifVersion: 'v7' })
    expect(texts(log, 'info')).toEqual(['Removed your rating.'])
  })

  it('stops when the ratings cannot be read or the Host refuses a change', async () => {
    const ctx = rig()
    ctx.remote.messageFeedback.list.mockResolvedValueOnce(failure)
    const unread = scriptedUi(['rate'])
    await runFeedback(ctx, unread.ui)
    expect(texts(unread.log, 'warn')).toEqual(['Could not save the feedback: refused'])
    ctx.remote.messageFeedback.list.mockResolvedValue(listed(item('positive')))
    ctx.remote.messageFeedback.delete.mockResolvedValueOnce({ ok: true, value: { ok: false, error: { code: 'version-conflict' } } })
    const refused = scriptedUi(['rate', 'remove'])
    await runFeedback(ctx, refused.ui)
    expect(texts(refused.log, 'warn')).toEqual(['Could not save the feedback: version-conflict'])
    expect(texts(refused.log, 'info')).toEqual([])
  })
})
