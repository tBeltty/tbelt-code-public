/**
 * REAL-composition proof: shipped-style YAML rows (projection registry, sandbox policy, local subprocess runtime,
 * worktree) boot through the vendored Loader, the row's config reaches the service, and a worktree it creates gets the
 * sandbox's git roots.
 */
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy'
import { SESSION_FORMAT_VERSION, Session, SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import WorktreeService from '@deepseek-ai/dsh-worktree'
import { git, put } from './support.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('real Loader composition', () => {
  it('loads the rows, applies the row config, and grants git roots inside the created worktree', async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-worktree-loader-')))
    const repo = join(root, 'app')
    await mkdir(repo)
    git(repo, 'init', '-q', '-b', 'main')
    await put(join(repo, 'README.md'), 'hi\n')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', 'initial')
    await writeFile(join(root, 'cordis.yml'), [
      "- name: '@deepseek-ai/dsh-session-projection'",
      "- name: '@deepseek-ai/dsh-sandbox-policy'",
      '  config:',
      '    mode: workspace-write',
      "- name: '@deepseek-ai/dsh-subprocess-local'",
      "- name: '@deepseek-ai/dsh-worktree'",
      '  config:',
      '    directory: trees',
      '    branchPrefix: wt/',
      '',
    ].join('\n'))
    context = new Context()
    context.baseUrl = `${pathToFileURL(root).href}/`
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-session-projection', SessionProjectionRegistry],
      ['@deepseek-ai/dsh-sandbox-policy', SandboxPolicyService],
      ['@deepseek-ai/dsh-subprocess-local', LocalSubprocessRuntime],
      ['@deepseek-ai/dsh-worktree', WorktreeService],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as never
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(join(root, 'cordis.yml')).href } })
    await context.loader.await()
    const unloaded = [...context.loader.entries()]
      .filter(entry => entry.fiber === undefined && !entry.disabled)
      .map(entry => entry.options.name)
    expect(unloaded).toEqual([])

    const created = await context.worktrees.create({ repoPath: repo, name: 'composed' })
    expect(created.path).toBe(join(repo, 'trees', 'composed'))
    expect(created.branch).toBe('wt/composed')
    const id = SessionId('composed')
    const session = Session.create(id, undefined, { version: SESSION_FORMAT_VERSION, id, createdAt: 0, isSeeded: false, cwd: created.path })
    expect(context.sandboxPolicy.resolve({ session }).extraWritableRoots).toEqual([
      join(repo, '.git', 'worktrees', 'composed'), join(repo, '.git', 'objects'), join(repo, '.git', 'refs'), join(repo, '.git', 'logs'),
    ])
  })
})
