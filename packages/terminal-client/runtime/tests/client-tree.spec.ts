import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as cordis from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootClientTree, CLIENT_ROSTER, installedSources } from '../src/client-tree.ts'
import type { ClientTreeSources } from '../src/client-tree.ts'
import type { InProcessTransport } from '../src/carrier.ts'

let dir: string
let transport: InProcessTransport
const globals = globalThis as { __DSH_TRANSPORT__?: unknown; __DSH_FILE_UPLOAD__?: unknown }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'terminal-tree-'))
  transport = {
    fetch: () => Promise.resolve(new Response()),
    openStream: async function* () { /* never opened */ },
    ownsHost: true,
  }
  globals.__DSH_TRANSPORT__ = 'previous-transport'
  globals.__DSH_FILE_UPLOAD__ = 'previous-upload'
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete globals.__DSH_TRANSPORT__
  delete globals.__DSH_FILE_UPLOAD__
  vi.useRealTimers()
})

/** A plugin bundle whose factory returns `module` source text. */
function plugin(id: string, module: string): string {
  const file = join(dir, `${id.replace(/\W/gu, '_')}.js`)
  writeFileSync(file, `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => (${module}) })\n`)
  return file
}

/** Sources whose `connection` reports `states` in order, one per change, and whose `sessions`/`remote` are markers. */
function sources(states: readonly string[], extra: Partial<ClientTreeSources> = {}, initial?: string): ClientTreeSources {
  const files = new Map<string, string>([
    ['@t/connection', plugin('@t/connection', `{
      name: 'connection',
      apply(ctx) {
        let current = ${JSON.stringify(initial)}
        const listeners = new Set()
        ctx.provide('connection', { state: {
          getSnapshot: () => current,
          subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
        } })
        const states = ${JSON.stringify(states)}
        let index = 0
        const advance = () => {
          if (index >= states.length) return
          current = states[index++]
          for (const listener of [...listeners]) listener()
          setTimeout(advance, 1)
        }
        setTimeout(advance, 1)
      },
    }`)],
    ['@t/sessions', plugin('@t/sessions', `{
      name: 'sessions',
      apply(ctx) { ctx.provide('sessions', { kind: 'sessions' }); ctx.provide('remote', { kind: 'remote' }) },
    }`)],
  ])
  return {
    cordis,
    store: {},
    roster: ['@t/connection', '@t/sessions'],
    bundleFile: specifier => files.get(specifier)!,
    ...extra,
  }
}

describe('client tree', () => {
  it('connects, exposes the Session and Remote services, and withdraws the transport on dispose', async () => {
    const tree = await bootClientTree(transport, sources(['connecting', 'connected']))
    expect(tree.services).toEqual({ sessions: { kind: 'sessions' }, remote: { kind: 'remote' } })
    expect(globals.__DSH_TRANSPORT__).toBe(transport)
    expect(globals.__DSH_FILE_UPLOAD__).toEqual({ fetch: transport.fetch })
    await tree.dispose()
    expect(globals.__DSH_TRANSPORT__).toBe('previous-transport')
    expect(globals.__DSH_FILE_UPLOAD__).toBe('previous-upload')
  })

  it('continues at once when the Connection is already connected', async () => {
    const tree = await bootClientTree(transport, sources([], {}, 'connected'))
    await tree.dispose()
  })

  it('stops waiting and restores the globals when no connection arrives', async () => {
    vi.useFakeTimers()
    const booting = bootClientTree(transport, sources([])).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(30_001)
    expect(await booting).toMatchObject({ message: expect.stringContaining('no connection to the Host within 30 seconds') })
    expect(globals.__DSH_TRANSPORT__).toBe('previous-transport')
  })

  it('names the bundle that was not built', async () => {
    const real = await installedSources()
    expect(real.roster).toBe(CLIENT_ROSTER)
    expect(() => real.bundleFile('@deepseek-ai/dsh-not-a-package')).toThrow(/cannot find the built client bundle of @deepseek-ai\/dsh-not-a-package/u)
  })

  it('reports a bundle that fails to load before touching the globals', async () => {
    const failing = sources(['connected'], { bundleFile: () => { throw new Error('bundle missing') } })
    await expect(bootClientTree(transport, failing)).rejects.toThrow('bundle missing')
    expect(globals.__DSH_TRANSPORT__).toBe('previous-transport')
  })
})
