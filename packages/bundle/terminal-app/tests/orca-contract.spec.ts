import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { composeEntries, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { parseClaudeCodeConfig } from '@deepseek-ai/dsh-hooks-claude-code/src/config.ts'
import { afterAll, describe, expect, it } from 'vitest'
import { orcaHooksConfigPath } from '../src/orca-hooks.ts'

/**
 * Opt-in contract check against a checkout of Orca (https://github.com/stablyai/orca) at the commit the
 * integration was written for. Set `ORCA_SRC` to the checkout; the suite is skipped without it.
 */
const ORCA_SRC = process.env['ORCA_SRC'] ?? ''

/** Script run under tsx: Orca imports without file extensions, which only tsx resolves. */
const READER = `
const orca = async path => {
  const loaded = await import(new URL('src/' + path, 'file://' + process.argv[1] + '/').href)
  return loaded.default ?? loaded
}
const request = JSON.parse(process.argv[2])
if (request.kind === 'recognize') {
  const { recognizeAgentProcessFromCommandLine } = await orca('shared/agent-process-recognition.ts')
  console.log(JSON.stringify(request.lines.map(line => recognizeAgentProcessFromCommandLine(line))))
} else {
  const settings = await orca('main/dsh/hook-settings.ts')
  const patch = await orca('main/dsh/dsh-home-patch.ts')
  const hooksPath = settings.getDshManagedHooksPath()
  console.log(JSON.stringify({
    hooksPath,
    patchPath: settings.getDshConfigPath(),
    events: settings.DSH_HOOK_EVENTS,
    hooksFile: settings.buildDshManagedHooksFile('orca-hook-command'),
    patch: patch.applyManagedDshPatch('[]\\n', hooksPath),
  }))
}
`

/** Run the reader against the Orca checkout; `home` becomes the account home Orca writes under. */
function ask(request: object, home: string): unknown {
  const out = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', READER, resolve(ORCA_SRC), JSON.stringify(request)], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home, DSH_HOME: '' },
  })
  return JSON.parse(out)
}

describe.skipIf(ORCA_SRC === '')('terminal profile as Orca sees it', () => {
  const home = mkdtempSync(join(tmpdir(), 'orca-contract-'))
  afterAll(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('recognizes the launch commands Orca can be given and not the `tbelt` alias', () => {
    const lines = [
      'dsh terminal',
      'node /usr/lib/node_modules/@deepseek-ai/dsh/lib/bin.js terminal --resume abc',
      'dsh-tui .',
      'node /usr/local/bin/dsh-tui --resume abc',
      'tbelt',
      'node /usr/lib/node_modules/@deepseek-ai/dsh/lib/tbelt-bin.js',
      'dsh --profile headless task',
    ]
    const agent = { agent: 'dsh', processName: 'dsh' }
    const tui = { agent: 'dsh', processName: 'dsh-tui' }
    expect(ask({ kind: 'recognize', lines }, home)).toEqual([agent, agent, tui, tui, null, null, null])
  })

  it('writes hook files the terminal profile\'s bridge parses, for every event it registers', () => {
    const setup = ask({ kind: 'hooks' }, home) as { hooksFile: string; events: string[] }
    const parsed = parseClaudeCodeConfig(JSON.parse(setup.hooksFile))
    expect(parsed.skipped).toEqual([])
    expect(Object.keys(parsed.config).sort()).toEqual([...setup.events].sort())
    for (const event of setup.events) expect(parsed.config[event]?.[0]?.hooks.length, event).toBeGreaterThan(0)
  })

  it('loads the hook file Orca writes from the path the terminal profile looks up', () => {
    const setup = ask({ kind: 'hooks' }, home) as { hooksPath: string; patchPath: string; patch: string }
    expect(setup.hooksPath).toBe(join(home, '.orca', 'agent-hooks', 'dsh-hooks.json'))
    const probe = (patch: string | undefined) => ({
      env: { ORCA_PANE_KEY: 'tab:0' },
      home,
      dshHome: join(home, '.dsh'),
      exists: (path: string) => path === setup.hooksPath || (patch !== undefined && path === setup.patchPath),
      read: (path: string) => path === setup.patchPath ? patch : undefined,
    })
    expect(setup.patchPath).toBe(join(home, '.dsh', 'cordis.patch.yml'))
    // Orca's own block in the home this process reads: the terminal profile leaves loading to it.
    expect(orcaHooksConfigPath(probe(setup.patch))).toBeUndefined()
    // A home Orca did not patch: the terminal profile loads the file itself.
    expect(orcaHooksConfigPath(probe(undefined))).toBe(setup.hooksPath)
  })

  it('writes a patch block the loader mounts as the hook bridge on the terminal profile', () => {
    const setup = ask({ kind: 'hooks' }, home) as { hooksPath: string; patch: string }
    const file = join(home, 'cordis.patch.yml')
    writeFileSync(file, setup.patch)
    const layer = (bundle: string) => loadOverlayPatches('orca-contract', fileURLToPath(new URL(`../../${bundle}/cordis.patch.yml`, import.meta.url)))
    const entries = composeEntries([layer('base'), layer('web-app'), layer('terminal-app'), loadOverlayPatches('orca-contract', file)])
    const row = entries.find(entry => entry.id === 'orca-agent-hooks')
    expect(row).toMatchObject({ name: '@deepseek-ai/dsh-hooks-claude-code', config: { configPath: setup.hooksPath } })
  })
})
