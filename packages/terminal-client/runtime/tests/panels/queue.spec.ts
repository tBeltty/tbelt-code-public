import { describe, expect, it } from 'vitest'
import { runQueue } from '../../src/panels/queue.ts'
import { fakePanelContext, scriptedUi, withProjection } from '../fakes.ts'

const text = (value: string) => ({ type: 'text', text: value })
const inbox = { 'next-turn': [
  { id: 'm1', content: [text('fix the build')], source: { kind: 'user' } },
  { id: 'm2', content: [text('two'), text('\nlines')], source: { kind: 'user' } },
], 'next-step': [] }

function rig(running = false) {
  const ctx = fakePanelContext()
  withProjection(ctx, { inbox })
  Object.assign(ctx.session, { running: () => running })
  return ctx
}
const texts = (log: { kind: string; text: string }[], kind: string) => log.filter(entry => entry.kind === kind).map(entry => entry.text)

describe('queue panel', () => {
  it('says so when nothing waits', async () => {
    const ctx = fakePanelContext()
    const { ui, log } = scriptedUi([])
    await runQueue(ctx, ui)
    expect(texts(log, 'info')).toEqual(['No messages are waiting.'])
  })

  it('leaves when no message or no action is chosen', async () => {
    await runQueue(rig(), scriptedUi([undefined]).ui)
    const ctx = rig()
    await runQueue(ctx, scriptedUi(['m1', undefined]).ui)
    expect(ctx.session.updateQueue).not.toHaveBeenCalled()
  })

  it('offers editing only for single-line text, and steering only while a turn runs', async () => {
    const idle = scriptedUi(['m2', undefined])
    await runQueue(rig(), idle.ui)
    expect(idle.log.filter(entry => entry.kind === 'pick')[1]!.items!.map(item => item.value)).toEqual(['remove'])
    const busy = scriptedUi(['m1', undefined])
    await runQueue(rig(true), busy.ui)
    expect(busy.log.filter(entry => entry.kind === 'pick')[1]!.items!.map(item => item.value)).toEqual(['edit', 'steer', 'remove'])
  })

  it('edits the text of a queued message', async () => {
    const ctx = rig()
    const { ui, log } = scriptedUi(['m1', 'edit', 'fix the tests'])
    await runQueue(ctx, ui)
    expect(log.find(entry => entry.kind === 'ask')!.options?.initial).toBe('fix the build')
    expect(ctx.session.updateQueue).toHaveBeenCalledWith('m1', { kind: 'edit', content: [{ type: 'text', text: 'fix the tests' }] })
    expect(texts(log, 'info')).toEqual(['Updated the queued message.'])
  })

  it('keeps the message when the edit is left or emptied', async () => {
    const ctx = rig()
    await runQueue(ctx, scriptedUi(['m1', 'edit', undefined]).ui)
    await runQueue(ctx, scriptedUi(['m1', 'edit', '']).ui)
    expect(ctx.session.updateQueue).not.toHaveBeenCalled()
  })

  it('sends a queued message into the running turn and removes one', async () => {
    const ctx = rig(true)
    const steered = scriptedUi(['m1', 'steer'])
    await runQueue(ctx, steered.ui)
    expect(ctx.session.updateQueue).toHaveBeenCalledWith('m1', { kind: 'steer' })
    expect(texts(steered.log, 'info')).toEqual(['Sent the message into the running turn.'])
    const removed = scriptedUi(['m1', 'remove'])
    await runQueue(ctx, removed.ui)
    expect(ctx.session.updateQueue).toHaveBeenLastCalledWith('m1', { kind: 'remove' })
    expect(texts(removed.log, 'info')).toEqual(['Removed the queued message.'])
  })

  it('titles a message that carries only an attachment', async () => {
    const ctx = fakePanelContext()
    withProjection(ctx, { inbox: { 'next-turn': [{ id: 'm9', content: [{ type: 'file', receiptId: 'r1' }], source: { kind: 'user' } }], 'next-step': [] } })
    const { ui, log } = scriptedUi(['m9', undefined])
    await runQueue(ctx, ui)
    expect(log[1]!.text).toBe('attachment only')
    expect(log[1]!.items!.map(item => item.value)).toEqual(['remove'])
  })

  it('reports a refusal and does not claim success', async () => {
    const ctx = rig()
    ctx.session.updateQueue.mockResolvedValue({ ok: false, error: { code: 'x', message: 'already started' } })
    const { ui, log } = scriptedUi(['m1', 'remove'])
    await runQueue(ctx, ui)
    expect(texts(log, 'warn')).toEqual(['The message may have started already: already started'])
    expect(texts(log, 'info')).toEqual([])
    const edit = scriptedUi(['m1', 'edit', 'new'])
    await runQueue(ctx, edit.ui)
    expect(texts(edit.log, 'info')).toEqual([])
    const steer = scriptedUi(['m1', 'steer'])
    Object.assign(ctx.session, { running: () => true })
    await runQueue(ctx, steer.ui)
    expect(texts(steer.log, 'info')).toEqual([])
  })
})
