import { describe, expect, it, vi } from 'vitest'
import { createInProcessTransport } from '../src/carrier.ts'
import type { HostWireStream } from '../src/carrier.ts'

function wire(open: HostWireStream['open']): HostWireStream {
  return {
    open,
    failure: error => ({ code: 'host/failed', message: error instanceof Error ? error.message : String(error), details: { kind: 'test' } }),
  }
}

async function* items(...values: unknown[]): AsyncGenerator {
  for (const value of values) yield value
}

describe('in-process carrier', () => {
  it('sends a relative request to the Host handler and returns its response', async () => {
    const fetch = vi.fn((request: Request) => Promise.resolve(new Response(`${request.method} ${new URL(request.url).pathname}`)))
    const transport = createInProcessTransport({ fetch }, wire(() => Promise.resolve(items())))
    const response = await transport.fetch('/api/session/list', { method: 'POST', body: '{}' })
    expect(await response.text()).toBe('POST /api/session/list')
    expect(new URL(fetch.mock.calls[0]![0].url).origin).toBe('http://terminal.invalid')
    expect(transport.ownsHost).toBe(true)
  })

  it('relays stream items and hands the Host the client uplink', async () => {
    const opened: unknown[][] = []
    const transport = createInProcessTransport({ fetch: () => Promise.resolve(new Response()) }, wire((...args) => {
      opened.push(args)
      return Promise.resolve(items(1, 2))
    }))
    const uplink = items('up')
    const controller = new AbortController()
    const received: unknown[] = []
    for await (const value of transport.openStream('session/follow', { id: 1 }, controller.signal, uplink)) received.push(value)
    expect(received).toEqual([1, 2])
    expect(opened[0]!.slice(0, 4)).toEqual(['session/follow', { id: 1 }, uplink, undefined])
  })

  it('gives a stream the client sends nothing on an uplink that ends when the stream is aborted', async () => {
    let uplink: AsyncIterable<unknown> | undefined
    const transport = createInProcessTransport({ fetch: () => Promise.resolve(new Response()) }, wire((_e, _p, up) => {
      uplink = up
      return Promise.resolve(items())
    }))
    const waiting = new AbortController()
    for await (const value of transport.openStream('a/b', {}, waiting.signal)) expect(value).toBeUndefined()
    const pending = uplink![Symbol.asyncIterator]().next()
    waiting.abort()
    await expect(pending).resolves.toMatchObject({ done: true })

    const aborted = new AbortController()
    for await (const value of transport.openStream('a/b', {}, aborted.signal)) expect(value).toBeUndefined()
    aborted.abort()
    await expect(uplink![Symbol.asyncIterator]().next()).resolves.toMatchObject({ done: true })
  })

  it('reports a Host failure with the marker the Gateway client recognizes', async () => {
    const transport = createInProcessTransport({ fetch: () => Promise.resolve(new Response()) }, wire(() => Promise.reject(new Error('no such endpoint'))))
    const error = await (async () => {
      for await (const value of transport.openStream('x/y', {}, new AbortController().signal)) expect(value).toBeUndefined()
    })().catch((caught: unknown) => caught)
    expect(error).toMatchObject({
      message: 'no such endpoint',
      dshRemoteStreamFailure: { kind: 'remote', code: 'host/failed', details: { kind: 'test' } },
    })
  })

  it('rethrows the abort reason instead of a failure when the client cancels', async () => {
    const controller = new AbortController()
    async function* failing(): AsyncGenerator<number> {
      await Promise.resolve()
      controller.abort(new Error('stopped'))
      yield 1
      throw new Error('never reported')
    }
    const open: HostWireStream['open'] = () => Promise.resolve(failing())
    const transport = createInProcessTransport({ fetch: () => Promise.resolve(new Response()) }, wire(open))
    const run = async (): Promise<void> => {
      for await (const value of transport.openStream('x/y', {}, controller.signal)) expect(value).toBeUndefined()
    }
    await expect(run()).rejects.toThrow('stopped')
    const aborted = new AbortController()
    aborted.abort(new Error('before'))
    await expect((async () => {
      for await (const value of transport.openStream('x/y', {}, aborted.signal)) expect(value).toBeUndefined()
    })()).rejects.toThrow('before')
  })
})
