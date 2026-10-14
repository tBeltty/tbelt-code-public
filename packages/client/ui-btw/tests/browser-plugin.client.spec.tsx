// @vitest-environment jsdom
/**
 * ui-btw browser half on a real cordis Context with fake slots/remote faces:
 * the plugin registers the dialog at conversation.input.overlay, decorates the
 * Host's /btw command with an action that opens the dialog (asking a typed
 * question, never a flag), one surface per Session backs the entry and the
 * command, and registration plus surface disposal ride the plugin fiber
 * (HMR safety). The node half stays inert.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { CommandDecoration } from '@deepseek-ai/dsh-client-ui-commands/client'
import type { BtwDialogInjected } from '../src/client/slots.ts'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'

afterEach(cleanup)

const sid = (k: string): SessionId => k as SessionId

/** Boot the plugin over fake faces; the Remote namespace records every call. */
async function bench() {
  const ctx = new Context()
  const calls: { method: string; request: unknown }[] = []
  const carried = <T,>(value: T) => Promise.resolve({ ok: true as const, value })
  const btw = {
    get: (request: unknown) => {
      calls.push({ method: 'get', request })
      return carried({ ok: true as const, value: { turns: [], sentTurns: 0 } })
    },
    ask: (request: { question: string }) => {
      calls.push({ method: 'ask', request })
      return carried({ ok: true as const, value: { question: request.question, answer: 'ok' } })
    },
    send: (request: unknown) => {
      calls.push({ method: 'send', request })
      return carried({ ok: true as const, value: { form: 'verbatim' as const, turns: 1 } })
    },
    reset: (request: unknown) => {
      calls.push({ method: 'reset', request })
      return carried({ ok: true as const, value: { turns: [], sentTurns: 0 } })
    },
  }
  class RemoteService extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }
  }
  new RemoteService(ctx)
  ctx.provide('remote.btw', btw)
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: { 'conversation.input.overlay': { kind: 'list', scope: 'session' } },
  } as never, (() => null) as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const decorations = new Map<string, CommandDecoration>()
  ctx.provide('commandUi', {
    decorate: (decoration: CommandDecoration) => {
      decorations.set(decoration.name, decoration)
      return () => { decorations.delete(decoration.name) }
    },
  })
  const fiber = ctx.plugin({ inject: [...inject], apply })
  return {
    ctx,
    fiber,
    calls,
    decorations,
    entry: () => {
      const entry = ctx.slots.entries('conversation.input.overlay')[0]
      if (entry === undefined) return undefined
      return {
        ...entry.options,
        locale: entry.locale,
        inject: entry.inject as unknown as ((sessionId: SessionId) => BtwDialogInjected) | undefined,
      }
    },
  }
}

describe('ui-btw browser plugin', () => {
  it('registers the dialog entry with the documented id, order, and locale', async () => {
    const b = await bench()
    await b.fiber.await()
    expect(b.entry()).toMatchObject({ id: 'btw-dialog', order: 3, locale: 'btw' })
  })

  it('backs the entry with one controller per Session', async () => {
    const b = await bench()
    await b.fiber.await()
    const first = b.entry()!.inject!(sid('s1'))
    const again = b.entry()!.inject!(sid('s1'))
    const other = b.entry()!.inject!(sid('s2'))
    expect(first.hooks.dialog).toBe(again.hooks.dialog)
    expect(first.hooks.dialog).not.toBe(other.hooks.dialog)
    expect(first.hooks.dialog.getSnapshot()).toMatchObject({ open: false, turns: [] })
  })

  it('drives ask, send, clear, and dismiss through the Remote', async () => {
    const b = await bench()
    await b.fiber.await()
    const face = b.entry()!.inject!(sid('s1'))
    face.edit('why?')
    await face.ask()
    await face.send()
    await face.clear()
    expect(b.calls.map(call => call.method)).toEqual(['ask', 'send', 'reset'])
    expect(b.calls[0]?.request).toEqual({ sessionId: sid('s1'), question: 'why?' })
    face.dismiss()
    face.dismissFailure()
    face.dismissToast(1)
    expect(face.hooks.dialog.getSnapshot().open).toBe(false)
  })

  it('decorates /btw: a bare invocation opens the dialog', async () => {
    const b = await bench()
    await b.fiber.await()
    const decoration = b.decorations.get('btw')!
    expect(decoration.available({} as never)).toBe(true)
    if (decoration.ui.kind !== 'action') throw new Error('expected an action decoration')
    decoration.ui.run({ sessionId: sid('s1') })
    await Promise.resolve()
    expect(b.entry()!.inject!(sid('s1')).hooks.dialog.getSnapshot().open).toBe(true)
    expect(b.calls.map(call => call.method)).toEqual(['get'])
  })

  it('decorates /btw: a typed question is asked, a flag only opens the dialog', async () => {
    const b = await bench()
    await b.fiber.await()
    const decoration = b.decorations.get('btw')!
    if (decoration.ui.kind !== 'action' || decoration.ui.runWithInput === undefined) throw new Error('expected runWithInput')
    decoration.ui.runWithInput({ sessionId: sid('s1') }, 'what changed?')
    decoration.ui.runWithInput({ sessionId: sid('s2') }, '--send')
    await new Promise<void>((resolve) => { setTimeout(resolve, 0) })
    expect(b.calls.filter(call => call.method === 'ask').map(call => call.request)).toEqual([
      { sessionId: sid('s1'), question: 'what changed?' },
    ])
    expect(b.calls.filter(call => call.method === 'get')).toHaveLength(2)
  })

  it('removes the entry, the decoration, and the surfaces with the plugin fiber', async () => {
    const b = await bench()
    await b.fiber.await()
    const dialog = b.entry()!.inject!(sid('s1')).hooks.dialog
    await b.fiber.dispose()
    expect(b.entry()).toBeUndefined()
    expect(b.decorations.has('btw')).toBe(false)
    expect(dialog.getSnapshot().open).toBe(false)
  })

  it('keeps the node half inert', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })
})
