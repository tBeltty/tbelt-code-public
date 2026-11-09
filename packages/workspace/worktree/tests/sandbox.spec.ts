/** The service composed with the sandbox policy: roots derived from the session's checkout, removed with the plugin. */
import type { Config } from '../src/types.ts'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SESSION_FORMAT_VERSION, Session, SessionId } from '@deepseek-ai/dsh-session'
import SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import WorktreeService from '@deepseek-ai/dsh-worktree'
import { git, makeRepo } from './support.ts'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups.length = 0
})

function sessionIn(cwd: string): Session {
  const id = SessionId('sess-worktree')
  return Session.create(id, undefined, { version: SESSION_FORMAT_VERSION, id, createdAt: 0, isSeeded: false, cwd })
}

async function composed(config: { grantGitAccess?: boolean }): Promise<{ ctx: Context; dispose: () => Promise<void> }> {
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SandboxPolicyService, { mode: 'workspace-write' })
  await ctx.plugin(LocalSubprocessRuntime)
  const fiber = await ctx.plugin(WorktreeService, config as Config)
  return { ctx, dispose: () => fiber.dispose() }
}

describe('sandbox git access', () => {
  it('adds the git directories to the policy of a session inside a created worktree only', async () => {
    const { repo } = await makeRepo(cleanups)
    const { ctx } = await composed({})
    const created = await ctx.worktrees.create({ repoPath: repo, name: 'confined' })
    const inside = ctx.sandboxPolicy.resolve({ session: sessionIn(created.path) })
    expect(inside.workspaceRoot).toBe(created.path)
    expect(inside.extraWritableRoots).toEqual([
      join(repo, '.git', 'worktrees', 'confined'), join(repo, '.git', 'objects'), join(repo, '.git', 'refs'), join(repo, '.git', 'logs'),
    ])
    expect(ctx.sandboxPolicy.resolve({ session: sessionIn(repo) })).not.toHaveProperty('extraWritableRoots')
  })

  it('grants nothing when grantGitAccess is off', async () => {
    const { repo } = await makeRepo(cleanups)
    const { ctx } = await composed({ grantGitAccess: false })
    const created = await ctx.worktrees.create({ repoPath: repo, name: 'closed' })
    expect(ctx.sandboxPolicy.resolve({ session: sessionIn(created.path) })).not.toHaveProperty('extraWritableRoots')
  })

  it('withdraws the grant when the plugin is disposed (HMR safety)', async () => {
    const { repo } = await makeRepo(cleanups)
    const { ctx, dispose } = await composed({})
    const created = await ctx.worktrees.create({ repoPath: repo, name: 'hmr' })
    expect(ctx.sandboxPolicy.resolve({ session: sessionIn(created.path) }).extraWritableRoots).toHaveLength(4)
    await dispose()
    expect(ctx.get('worktrees')).toBeUndefined()
    expect(ctx.sandboxPolicy.resolve({ session: sessionIn(created.path) })).not.toHaveProperty('extraWritableRoots')
    expect(git(repo, 'worktree', 'list').split('\n').filter(Boolean)).toHaveLength(2)
  })

  it('mounts without a sandbox policy', async () => {
    const ctx = new Context()
    cleanups.push(() => ctx.fiber.dispose())
    await ctx.plugin(LocalSubprocessRuntime)
    await ctx.plugin(WorktreeService, {} as Config)
    expect(ctx.worktrees).toBeDefined()
  })
})
