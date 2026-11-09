import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NodeModuleTable } from '../src/module-table.ts'

let dir: string

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'terminal-table-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

/** Write a bundle that registers one factory, as `lib/client.js` does. */
function bundle(name: string, id: string, body: string, extra = ''): string {
  const file = join(dir, `${name}.js`)
  writeFileSync(file, `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, ${extra} factory: (require) => { ${body} } })\n`)
  return file
}

describe('NodeModuleTable', () => {
  it('serves seeded platform modules and runs a factory once', () => {
    const table = new NodeModuleTable({ host: { value: 7 } })
    table.load(bundle('a', '@x/a/client', 'globalThis.__runs = (globalThis.__runs ?? 0) + 1; return { seen: require("host").value }'))
    expect(table.require('@x/a')).toEqual({ seen: 7 })
    expect(table.require('@x/a/client')).toBe(table.require('@x/a'))
    expect((globalThis as { __runs?: number }).__runs).toBe(1)
    delete (globalThis as { __runs?: number }).__runs
  })

  it('lets one bundle require another by either spelling and asynchronously', async () => {
    const table = new NodeModuleTable({})
    table.load(bundle('b', '@x/b', 'return { n: 2 }'))
    table.load(bundle('a', '@x/a', 'return { sync: require("@x/b/client").n, later: require.async("@x/b") }'))
    const exports = table.require('@x/a') as { sync: number; later: Promise<{ n: number }> }
    expect(exports.sync).toBe(2)
    await expect(exports.later).resolves.toEqual({ n: 2 })
  })

  it('refuses unknown modules, cycles, chunks, duplicates and empty files', () => {
    const table = new NodeModuleTable({})
    table.load(bundle('c1', '@x/c1', 'return require("@x/c2")'))
    table.load(bundle('c2', '@x/c2', 'return require("@x/c1")'))
    expect(() => table.require('@x/c1')).toThrow('through a cycle')
    expect(() => table.require('@x/missing')).toThrow('neither holds nor has loaded')
    expect(() => table.load(bundle('chunk', '@x/chunk', 'return {}', 'chunk: "extra.js",'))).toThrow('package-local chunk')
    expect(() => table.load(bundle('dup', '@x/c1', 'return {}'))).toThrow('registered twice')
    const empty = join(dir, 'empty.js')
    writeFileSync(empty, '// nothing registered\n')
    expect(() => table.load(empty)).toThrow('registered no client bundle')
  })
})
