/**
 * The terminal command-line provider over a real Loader tree: its ordinary
 * service releases a consumer whose config reads `ctx.terminalStartup`.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { internals, provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as hooksClaudeCode from '@deepseek-ai/dsh-hooks-claude-code'
import { apply, Config, TERMINAL_STARTUP_SERVICE, type TerminalStartupValues } from '../src/index.ts'

/** What one fixture boot observed. */
interface Observed {
  exits: number[]
  out: string
  readerConfig?: unknown
  /** Whether the Orca hook bridge is mounted. */
  bridgeMounted?: boolean
}

const disposers: (() => Promise<void>)[] = []
const tempDirs: string[] = []

afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  internals.stdout = process.stdout
  internals.stderr = process.stderr
  vi.unstubAllEnvs()
})

/**
 * Mount the real provider and a consumer reading its service from config.
 * @param args - the invocation's inner arguments.
 * @returns the service value and what the consumer and process observed.
 */
async function bootProvider(
  args: string[],
  providerConfig: Record<string, unknown> = {},
): Promise<{ values: TerminalStartupValues | undefined; observed: Observed }> {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-terminal-startup-'))
  tempDirs.push(dir)
  const observed: Observed = { exits: [], out: '' }
  writeFileSync(join(dir, 'reader.mjs'), `
export function apply(_ctx, config) { globalThis.__terminalStartupObserved.readerConfig = config }
`)
  writeFileSync(join(dir, 'provider.mjs'), `
export const name = 'terminal-startup'
export const inject = ['cmdlineArgs']
export const Config = globalThis.__terminalStartupConfig
export const apply = (ctx, config) => globalThis.__terminalStartupApply(ctx, config)
`)
  writeFileSync(join(dir, 'cordis.yml'), [
    '- id: reader',
    `  name: ${pathToFileURL(join(dir, 'reader.mjs')).href}`,
    `  inject: [${TERMINAL_STARTUP_SERVICE}]`,
    '  config:',
    '    resume: !!js ctx.terminalStartup.resume',
    '    continueLatest: !!js ctx.terminalStartup.continueLatest',
    '    cwd: !!js ctx.terminalStartup.cwd',
    '- id: provider',
    `  name: ${pathToFileURL(join(dir, 'provider.mjs')).href}`,
    ...Object.keys(providerConfig).length === 0 ? [] : ['  config:', ...Object.entries(providerConfig).map(([key, value]) => `    ${key}: ${JSON.stringify(value)}`)],
    '',
  ].join('\n'))
  const observing = { write: (chunk: string) => { observed.out += chunk; return true } }
  internals.stdout = observing
  internals.stderr = observing
  Reflect.set(globalThis, '__terminalStartupApply', apply)
  Reflect.set(globalThis, '__terminalStartupConfig', Config)
  Reflect.set(globalThis, '__terminalStartupObserved', observed)

  const ctx = new Context()
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  provideCmdline(ctx, { args, exit: code => void observed.exits.push(code) })
  // The bridge waits for these two services; a mounted bridge stays registered while it waits.
  ctx.provide('shell', {})
  ctx.provide('sessionProjections', {})
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(join(dir, 'cordis.yml')).href } })
  await ctx.loader.await()
  disposers.push(async () => { await ctx.fiber.dispose() })
  observed.bridgeMounted = ctx.registry.has(hooksClaudeCode)
  return { values: ctx.get(TERMINAL_STARTUP_SERVICE) as TerminalStartupValues | undefined, observed }
}

describe('terminal command-line provider', () => {
  it('starts a new session when no flag is given', async () => {
    const { values, observed } = await bootProvider([])
    expect(values).toEqual({ resume: undefined, continueLatest: false, cwd: undefined })
    expect(observed.readerConfig).toEqual({ continueLatest: false })
  })

  it('publishes --resume and --continue to the consumer', async () => {
    const resume = await bootProvider(['--resume', '3f9a'])
    expect(resume.values).toEqual({ resume: '3f9a', continueLatest: false })
    expect(resume.observed.readerConfig).toEqual(resume.values)
    const last = await bootProvider(['--continue'])
    expect(last.values).toEqual({ resume: undefined, continueLatest: true })
  })

  it('publishes --cwd, alone or with --continue', async () => {
    const alone = await bootProvider(['--cwd', '/work/app'])
    expect(alone.values).toEqual({ resume: undefined, continueLatest: false, cwd: '/work/app' })
    expect(alone.observed.readerConfig).toEqual({ continueLatest: false, cwd: '/work/app' })
    const latest = await bootProvider(['--continue', '--cwd', '~/code'])
    expect(latest.values).toEqual({ resume: undefined, continueLatest: true, cwd: '~/code' })
  })

  it('prints its own help and leaves the consumer pending', async () => {
    const { values, observed } = await bootProvider(['--help'])
    expect(observed.out).toContain('dsh terminal')
    expect(observed.out).toContain('--resume <session>')
    expect(observed.out).toContain('--continue')
    expect(observed.out).toContain('--cwd <directory>')
    expect(values).toBeUndefined()
    expect(observed.readerConfig).toBeUndefined()
    expect(observed.exits).toEqual([0])
  })

  it('rejects --resume together with --continue before the consumer activates', async () => {
    const { values, observed } = await bootProvider(['--resume', 'abc', '--continue'])
    expect(observed.out).toContain('use --resume or --continue, not both')
    expect(values).toBeUndefined()
    expect(observed.readerConfig).toBeUndefined()
    expect(observed.exits).toEqual([1])
  })

  it('rejects an empty session id', async () => {
    const { values, observed } = await bootProvider(['--resume', ' '])
    expect(observed.out).toContain('--resume needs a session id')
    expect(values).toBeUndefined()
    expect(observed.exits).toEqual([1])
  })

  it('rejects an empty --cwd', async () => {
    const { values, observed } = await bootProvider(['--cwd', ' '])
    expect(observed.out).toContain('--cwd needs a directory')
    expect(values).toBeUndefined()
    expect(observed.exits).toEqual([1])
  })

  it('publishes a positional directory as the working directory', async () => {
    const dot = await bootProvider(['.'])
    expect(dot.values).toEqual({ resume: undefined, continueLatest: false, cwd: '.' })
    const resumed = await bootProvider(['--resume', '3f9a', '/work/app'])
    expect(resumed.values).toEqual({ resume: '3f9a', continueLatest: false, cwd: '/work/app' })
  })

  it('rejects a directory together with --cwd, and an empty directory', async () => {
    const both = await bootProvider(['--cwd', '/a', '/b'])
    expect(both.observed.out).toContain('use --cwd or a directory, not both')
    expect(both.values).toBeUndefined()
    const empty = await bootProvider([' '])
    expect(empty.observed.out).toContain('the directory is empty')
    expect(empty.values).toBeUndefined()
    expect(both.observed.exits.concat(empty.observed.exits)).toEqual([1, 1])
  })

  describe('Orca hooks', () => {
    /** An account home where Orca installed its hook file, and the environment of an Orca pane. */
    function orcaPane(): string {
      const home = mkdtempSync(join(tmpdir(), 'dsh-terminal-orca-'))
      tempDirs.push(home)
      mkdirSync(join(home, '.orca', 'agent-hooks'), { recursive: true })
      writeFileSync(join(home, '.orca', 'agent-hooks', 'dsh-hooks.json'), JSON.stringify({ hooks: {} }))
      vi.stubEnv('HOME', home)
      vi.stubEnv('USERPROFILE', home)
      vi.stubEnv('DSH_HOME', join(home, '.tbelt-code'))
      vi.stubEnv('ORCA_PANE_KEY', 'tab-1:0')
      return home
    }

    it('mounts the bridge on the hook file Orca wrote when the terminal runs in an Orca pane', async () => {
      orcaPane()
      const { observed } = await bootProvider([])
      expect(observed.bridgeMounted).toBe(true)
    })

    it('mounts nothing when the setting is off, outside Orca, or before Orca installed the file', async () => {
      orcaPane()
      expect((await bootProvider([], { orcaHooks: 'off' })).observed.bridgeMounted).toBe(false)
      vi.stubEnv('ORCA_PANE_KEY', '')
      expect((await bootProvider([])).observed.bridgeMounted).toBe(false)
      const empty = mkdtempSync(join(tmpdir(), 'dsh-terminal-orca-'))
      tempDirs.push(empty)
      vi.stubEnv('ORCA_PANE_KEY', 'tab-1:0')
      vi.stubEnv('HOME', empty)
      vi.stubEnv('USERPROFILE', empty)
      expect((await bootProvider([])).observed.bridgeMounted).toBe(false)
    })

    it('rejects an unknown setting value', () => {
      expect(() => Config({ orcaHooks: 'always' } as never)).toThrow('expected "auto" | "off"')
      expect(Config({})).toEqual({ orcaHooks: 'auto' })
    })
  })
})
