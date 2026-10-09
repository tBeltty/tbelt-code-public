/**
 * Finds the hook file that Orca writes for dsh, so a `dsh terminal` pane in
 * Orca reports working, waiting and finished without any setup in the home.
 * @module @deepseek-ai/dsh-terminal-app/orca-hooks
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** First line of the block Orca writes into `$DSH_HOME/cordis.patch.yml` to load its own hooks. */
const ORCA_PATCH_MARKER = 'orca-managed-dsh-hooks'

/** Facts about the machine the lookup reads. */
export interface OrcaHooksProbe {
  readonly env: Readonly<Record<string, string | undefined>>
  /** The account home directory. */
  readonly home: string
  /** The tBelt Code home this process reads its `cordis.patch.yml` from. */
  readonly dshHome: string
  readonly exists: (path: string) => boolean
  /** File text, or `undefined` when the file is absent. */
  readonly read: (path: string) => string | undefined
}

/**
 * The probe for this process.
 * @returns the process environment, account home, tBelt Code home and local file reads.
 */
export function processProbe(): OrcaHooksProbe {
  return {
    env: process.env,
    home: homedir(),
    dshHome: resolveDshHome(),
    exists: existsSync,
    read: path => existsSync(path) ? readFileSync(path, 'utf8') : undefined,
  }
}

/**
 * Path of the hook file this process should load for Orca.
 *
 * Orca installs its status hooks as a block in `$DSH_HOME/cordis.patch.yml`, using
 * its own idea of the home (`~/.dsh` unless Orca runs with `DSH_HOME`). The
 * tBelt Code launchers use another home, so that block can sit where this
 * process never reads it. The hook file itself always lives at
 * `~/.orca/agent-hooks/dsh-hooks.json`.
 * @param probe - environment and file reads.
 * @returns the hook file when this process runs in an Orca pane, Orca installed the file, and the home
 * this process reads does not already load it; `undefined` otherwise.
 */
export function orcaHooksConfigPath(probe: OrcaHooksProbe): string | undefined {
  if ((probe.env['ORCA_PANE_KEY'] ?? '') === '') return undefined
  const file = join(probe.home, '.orca', 'agent-hooks', 'dsh-hooks.json')
  if (!probe.exists(file)) return undefined
  const patch = probe.read(join(probe.dshHome, 'cordis.patch.yml'))
  return patch?.includes(ORCA_PATCH_MARKER) === true ? undefined : file
}
