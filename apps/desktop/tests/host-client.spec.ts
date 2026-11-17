/** The Desktop shell reuses authenticated Web RPC for analytics intake and the saved language. */
import { describe, expect, it, vi } from 'vitest'
import { connectDesktopHost } from '../src/host-client.ts'

function transport(preference?: string) {
  const namespaces = [
    { ns: 'locale', value: preference === undefined ? {} : { preference } },
  ]
  const send = vi.fn<Parameters<typeof connectDesktopHost>[1]>(async (_input, init) => {
    if (init?.method !== 'POST') return new Response('index')
    const { rpcId, method } = JSON.parse(init.body as string) as { rpcId: string; method: string }
    const value = method === 'settings/describe' ? { namespaces } : undefined
    return Response.json({ type: 'server-response', rpcId, result: { ok: true, value } })
  })
  return { send, namespaces }
}

const url = 'http://127.0.0.1:19387/?token=fixture'

describe('desktop Host client', () => {
  it('authenticates through Web before any RPC', async () => {
    const host = transport()
    await connectDesktopHost(url, host.send)
    expect(host.send).toHaveBeenCalledExactlyOnceWith(url, { credentials: 'include' })
  })

  it.each([['es', 'es'], [undefined, null]])('reads the language preference %s as %s', async (preference, expected) => {
    const host = transport(preference)
    const client = await connectDesktopHost(url, host.send)
    host.send.mockClear()
    expect(await client.readLocalePreference()).toBe(expected)
    expect(host.send).toHaveBeenCalledOnce()
    expect(host.send.mock.calls[0]![0]).toContain('/api/settings/describe')
    expect(host.send.mock.calls[0]![1]).toMatchObject({ credentials: 'include', redirect: 'error' })
  })

  it('rejects settings without a language namespace and unmatched RPC envelopes', async () => {
    const host = transport()
    host.namespaces.length = 0
    const client = await connectDesktopHost(url, host.send)
    await expect(client.readLocalePreference()).rejects.toThrow('invalid locale preference')
    host.send.mockResolvedValueOnce(Response.json({ type: 'server-response', rpcId: 'other', result: { ok: true } }))
    await expect(client.readLocalePreference()).rejects.toThrow('Web RPC failed')
  })

  it('submits native analytics through authenticated RPC with a bounded request', async () => {
    const host = transport()
    const client = await connectDesktopHost(url, host.send)
    const event = { eventName: 'desktop_app_launch' as const, timestamp: 100, attributes: {} }
    await client.report(event)
    const [input, init] = host.send.mock.calls.at(-1)!
    expect(input).toBe('http://127.0.0.1:19387/api/productAnalytics/report')
    expect(init?.credentials).toBe('include')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(init!.body as string)).toMatchObject({ payload: { args: { event } } })
  })

  it('refuses an unauthenticated Web launch', async () => {
    const send = vi.fn<Parameters<typeof connectDesktopHost>[1]>(async () => new Response(null, { status: 401 }))
    await expect(connectDesktopHost(url, send)).rejects.toThrow('Web authentication failed')
  })
})
