// @vitest-environment jsdom
/**
 * BtwDialogController over a fake `btw` port: opening mirrors the Host's
 * thread and can ask at once; asking publishes the answer or restores the
 * question on failure; sending marks the turns delivered and raises the toast;
 * clearing empties the thread; transport and Host failures publish their code;
 * a controller disposed mid-flight publishes nothing.
 */
import { describe, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { BtwResult, BtwTurn } from '@deepseek-ai/dsh-command-btw/types'
import { BtwDialogController } from '../src/client/controller.ts'
import type { BtwPort, Carried } from '../src/client/controller.ts'

const SESSION = 's1' as SessionId

const carried = <T>(value: BtwResult<T>): Promise<Carried<BtwResult<T>>> => Promise.resolve({ ok: true, value })
const fail = (code: string) => ({ ok: false as const, error: { code, message: code } })

/** A fake port whose answers each test replaces. */
function port(overrides: Partial<BtwPort> = {}): BtwPort & { calls: string[] } {
  const calls: string[] = []
  const base: BtwPort = {
    ask: (request) => {
      calls.push(`ask:${request.question}`)
      return carried({ ok: true, value: { question: request.question, answer: `re: ${request.question}` } })
    },
    send: () => {
      calls.push('send')
      return carried({ ok: true, value: { form: 'verbatim', turns: 1 } })
    },
    reset: () => {
      calls.push('reset')
      return carried({ ok: true, value: { turns: [], sentTurns: 0 } })
    },
    get: () => {
      calls.push('get')
      return carried({ ok: true, value: { turns: [], sentTurns: 0 } })
    },
  }
  return Object.assign({ ...base, ...overrides }, { calls })
}

describe('BtwDialogController', () => {
  it('opens on the Host thread and keeps it when closed', async () => {
    const turns: BtwTurn[] = [{ question: 'q', answer: 'a' }]
    const p = port({ get: () => carried({ ok: true, value: { turns, sentTurns: 1 } }) })
    const c = new BtwDialogController(p, SESSION)
    await c.open()
    expect(c.state.getSnapshot()).toMatchObject({ open: true, turns, sentTurns: 1 })
    c.dismiss()
    expect(c.state.getSnapshot()).toMatchObject({ open: false, turns })
  })

  it('asks the question given on open', async () => {
    const p = port()
    const c = new BtwDialogController(p, SESSION)
    await c.open('why?')
    expect(p.calls).toEqual(['get', 'ask:why?'])
    expect(c.state.getSnapshot().turns).toEqual([{ question: 'why?', answer: 're: why?' }])
    await c.open('   ')
    expect(p.calls).toEqual(['get', 'ask:why?', 'get'])
  })

  it('asks the field, clears it, and ignores blank or overlapping questions', async () => {
    let release: (() => void) | undefined
    const p = port({
      ask: request => new Promise((resolve) => {
        release = () => { resolve({ ok: true, value: { ok: true, value: { question: request.question, answer: 'done' } } }) }
      }),
    })
    const c = new BtwDialogController(p, SESSION)
    await c.ask()
    c.edit('  first  ')
    const pending = c.ask()
    expect(c.state.getSnapshot()).toMatchObject({ pending: 'first', draft: '' })
    await c.ask('second')
    expect(c.state.getSnapshot().pending).toBe('first')
    release?.()
    await pending
    expect(c.state.getSnapshot()).toMatchObject({ pending: null, turns: [{ question: 'first', answer: 'done' }] })
  })

  it('restores the question into an empty field when asking fails', async () => {
    const c = new BtwDialogController(port({ ask: () => carried({ ok: false, error: { code: 'model-failed', message: 'x' } }) }), SESSION)
    c.edit('lost?')
    await c.ask()
    expect(c.state.getSnapshot()).toMatchObject({ pending: null, failure: 'model-failed', draft: 'lost?' })
    c.edit('newer')
    await c.ask('again')
    expect(c.state.getSnapshot().draft).toBe('newer')
    c.dismissFailure()
    expect(c.state.getSnapshot().failure).toBeNull()
  })

  it('reads a transport rejection and an envelope failure as failure codes', async () => {
    const rejecting = new BtwDialogController(port({ ask: () => Promise.reject(new Error('socket closed')) }), SESSION)
    await rejecting.ask('q')
    expect(rejecting.state.getSnapshot().failure).toBe('transport')
    const refused = new BtwDialogController(port({ ask: () => Promise.resolve(fail('forbidden')) }), SESSION)
    await refused.ask('q')
    expect(refused.state.getSnapshot().failure).toBe('forbidden')
  })

  it('delivers unsent turns, marks them sent, and raises one toast per delivery', async () => {
    const p = port()
    const c = new BtwDialogController(p, SESSION)
    await c.send()
    expect(p.calls).toEqual([])
    await c.ask('one')
    await c.send()
    expect(c.state.getSnapshot()).toMatchObject({ sentTurns: 1, sending: false, toast: 1 })
    await c.send()
    expect(p.calls.filter(call => call === 'send')).toHaveLength(1)
    await c.ask('two')
    await c.send()
    expect(c.state.getSnapshot()).toMatchObject({ sentTurns: 2, toast: 2 })
    c.dismissToast(1)
    expect(c.state.getSnapshot().toast).toBe(2)
    c.dismissToast(2)
    expect(c.state.getSnapshot().toast).toBe(0)
  })

  it('keeps turns unsent and publishes the code when delivery fails', async () => {
    const c = new BtwDialogController(port({ send: () => carried({ ok: false, error: { code: 'model-failed', message: 'x' } }) }), SESSION)
    await c.ask('one')
    await c.send()
    expect(c.state.getSnapshot()).toMatchObject({ sentTurns: 0, sending: false, failure: 'model-failed', toast: 0 })
  })

  it('clears the thread, or publishes the code when the Host refuses', async () => {
    const c = new BtwDialogController(port(), SESSION)
    await c.ask('one')
    await c.clear()
    expect(c.state.getSnapshot()).toMatchObject({ turns: [], sentTurns: 0 })
    const busy = new BtwDialogController(port({ reset: () => carried({ ok: false, error: { code: 'busy', message: 'x' } }) }), SESSION)
    await busy.clear()
    expect(busy.state.getSnapshot().failure).toBe('busy')
  })

  it('does not clear or send while a question is pending', async () => {
    let release: (() => void) | undefined
    const p = port({
      ask: request => new Promise((resolve) => {
        release = () => { resolve({ ok: true, value: { ok: true, value: { question: request.question, answer: 'a' } } }) }
      }),
    })
    const c = new BtwDialogController(p, SESSION)
    const pending = c.ask('slow')
    await c.clear()
    await c.send()
    expect(p.calls).toEqual([])
    release?.()
    await pending
  })

  it('publishes nothing from work that settles after disposal', async () => {
    let release: (() => void) | undefined
    const p = port({
      ask: request => new Promise((resolve) => {
        release = () => { resolve({ ok: true, value: { ok: true, value: { question: request.question, answer: 'a' } } }) }
      }),
      get: () => Promise.resolve({ ok: true, value: { ok: true, value: { turns: [{ question: 'q', answer: 'a' }], sentTurns: 0 } } }),
    })
    const c = new BtwDialogController(p, SESSION)
    const pending = c.ask('slow')
    c.dispose()
    release?.()
    await pending
    expect(c.state.getSnapshot()).toMatchObject({ open: false, turns: [], pending: null })
    await c.send()
    await c.open()
    expect(c.state.getSnapshot().turns).toEqual([])
    const disposedClear = new BtwDialogController(port(), SESSION)
    const clearing = disposedClear.clear()
    disposedClear.dispose()
    await clearing
    const disposedSend = new BtwDialogController(port(), SESSION)
    await disposedSend.ask('x')
    const sending = disposedSend.send()
    disposedSend.dispose()
    await sending
    expect(disposedSend.state.getSnapshot().toast).toBe(0)
  })
})
