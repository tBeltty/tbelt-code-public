/**
 * Boots a throwaway `dsh` profile through `@deepseek-ai/dsh-app-boot`'s
 * Loader: one test bundle whose patch mounts the spend stack as `cordis:*`
 * builtins over the JSON storage backend under the profile's home.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { boot, initProfile, readProfilePatches, type ProfileContext } from '@deepseek-ai/dsh-app-boot'
import ConfigEditor from '@deepseek-ai/dsh-config-editor'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import Settings from '@deepseek-ai/dsh-settings'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SpendBudget from '../../src/index.ts'

/** Rows every spend composition mounts; `{{storageRoot}}` is replaced at boot. */
const BASE_ROWS = `
    - id: config-editor
      name: cordis:editor
    - id: settings
      name: cordis:settings
    - id: storage
      name: cordis:storage
    - id: storage-json
      name: cordis:storage-json
      config:
        root: '{{storageRoot}}'
    - id: storage-domain
      name: cordis:storage-domain
      config:
        backend: json
    - id: llm
      name: cordis:llm
    - id: session
      name: cordis:session
    - id: session-projection
      name: cordis:session-projection
    - id: system-prompt
      name: cordis:system-prompt
    - id: tools
      name: cordis:tools
    - id: agent
      name: cordis:agent
    - id: agent-loop
      name: cordis:agent-loop
`

/** A booted test profile and its lifecycle. */
export interface SpendProfile {
  /** The profile's patch file, which Settings writes. */
  readonly patchPath: string
  /** Boot (or reboot) the profile. */
  readonly start: () => Promise<Context>
  /** Remove the profile home. */
  readonly remove: () => void
}

/**
 * Create a profile whose bundle patch mounts the spend stack plus `extraRows`.
 * @param spendBudgetRow - the `spend-budget` row's YAML, indented as a list item under `insert`.
 * @param extraRows - further rows and `cordis:<name>` builtins they use.
 * @returns the profile handle.
 */
export function createSpendProfile(
  spendBudgetRow: string,
  extraRows: { readonly yaml: string; readonly builtins: Record<string, unknown> } = { yaml: '', builtins: {} },
): SpendProfile {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-spend-profile-')))
  const dir = join(home, 'profiles', 'test')
  initProfile(dir, ['test-bundle'])
  const bundle = join(dir, 'node_modules', 'test-bundle')
  mkdirSync(bundle, { recursive: true })
  writeFileSync(join(home, 'package.json'), '{"name":"test-installation"}\n')
  writeFileSync(join(bundle, 'package.json'), JSON.stringify({ name: 'test-bundle', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } } }))
  const rows = BASE_ROWS.replace('{{storageRoot}}', join(home, 'storages').replaceAll('\\', '/'))
  writeFileSync(join(bundle, 'cordis.patch.yml'), `- insert:${rows}${spendBudgetRow}${extraRows.yaml}`)
  writeFileSync(join(dir, 'cordis.yml'), '[]\n')
  const profile: ProfileContext = {
    name: 'test', startedBundles: ['test-bundle'], dir, patchPath: join(dir, 'cordis.patch.yml'),
    installAnchor: join(home, 'package.json'), cwd: home, home, overlays: [], telemetryDisabledEnv: undefined,
  }
  return {
    patchPath: profile.patchPath,
    start: () => boot('test', join(dir, 'cordis.yml'), readProfilePatches('test', profile), (root) => {
      root.provide('profileContext', profile)
      Object.assign(root.loader.builtins, {
        'editor': ConfigEditor,
        'settings': Settings,
        'storage': Storage,
        'storage-json': StorageJson,
        'storage-domain': StorageDomain,
        'llm': LlmRuntime,
        'session': SessionStore,
        'session-projection': SessionProjectionRegistry,
        'system-prompt': SystemPrompt,
        'tools': ToolRuntime,
        'agent': AgentRegistry,
        'agent-loop': AgentLoop,
        'spend-budget': SpendBudget,
        ...extraRows.builtins,
      })
    }),
    remove: () => { rmSync(home, { recursive: true, force: true }) },
  }
}
