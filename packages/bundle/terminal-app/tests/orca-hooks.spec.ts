import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { orcaHooksConfigPath, processProbe } from '../src/orca-hooks.ts'
import type { OrcaHooksProbe } from '../src/orca-hooks.ts'

const HOME = join('/', 'home', 'me')
const FILE = join(HOME, '.orca', 'agent-hooks', 'dsh-hooks.json')

/** A machine with the given files; the environment is an Orca pane unless overridden. */
function machine(files: Record<string, string>, env: Record<string, string | undefined> = { ORCA_PANE_KEY: 'tab-1:0' }): OrcaHooksProbe {
  return { env, home: HOME, dshHome: env['DSH_HOME'] ?? join(HOME, '.dsh'), exists: path => path in files, read: path => files[path] }
}

describe('orcaHooksConfigPath', () => {
  it('returns Orca\'s hook file inside an Orca pane, whatever home the launcher chose', () => {
    expect(orcaHooksConfigPath(machine({ [FILE]: '{}' }))).toBe(FILE)
    expect(orcaHooksConfigPath(machine({ [FILE]: '{}' }, { ORCA_PANE_KEY: 'p', DSH_HOME: '/data/tbelt' }))).toBe(FILE)
  })

  it('does nothing outside an Orca pane', () => {
    expect(orcaHooksConfigPath(machine({ [FILE]: '{}' }, {}))).toBeUndefined()
    expect(orcaHooksConfigPath(machine({ [FILE]: '{}' }, { ORCA_PANE_KEY: '' }))).toBeUndefined()
  })

  it('does nothing until Orca has installed the file', () => {
    expect(orcaHooksConfigPath(machine({}))).toBeUndefined()
  })

  it('leaves the file to Orca\'s own block when the home this process reads already loads it', () => {
    const patch = join(HOME, '.dsh', 'cordis.patch.yml')
    const block = '# >>> orca-managed-dsh-hooks (managed by Orca; do not edit) >>>\n- insert: []\n'
    expect(orcaHooksConfigPath(machine({ [FILE]: '{}', [patch]: block }))).toBeUndefined()
    expect(orcaHooksConfigPath(machine({ [FILE]: '{}', [patch]: '[]\n' }))).toBe(FILE)
    const other = join('/data', 'tbelt', 'cordis.patch.yml')
    expect(orcaHooksConfigPath(machine({ [FILE]: '{}', [patch]: block, [other]: '[]\n' }, { ORCA_PANE_KEY: 'p', DSH_HOME: '/data/tbelt' }))).toBe(FILE)
  })
})

describe('processProbe', () => {
  it('reads this process', () => {
    const probe = processProbe()
    expect(probe.env).toBe(process.env)
    expect(probe.dshHome).toBe(resolveDshHome())
    expect(probe.exists(import.meta.filename)).toBe(true)
    expect(probe.read(import.meta.filename)).toContain('processProbe')
    expect(probe.read(join(import.meta.dirname, 'no-such-file'))).toBeUndefined()
  })
})
