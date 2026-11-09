import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import WorktreeService from '@deepseek-ai/dsh-worktree'
import WorkspaceController from '../src/index.ts'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

const roots: Context[] = []
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose()))
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })
}

/** A controller over a real registry, with the worktree service mounted unless `withWorktrees` is false. */
async function harness(withWorktrees = true) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-workspace-worktrees-')))
  tempDirs.push(root)
  const ctx = new Context()
  roots.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend())
  const storageDomain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', storageDomain)
  ctx.provide('storageDomain', storageDomain)
  ctx.provide('sessionPersistence', { list: () => Promise.resolve([]) } as never)
  await ctx.plugin(WorkspaceRegistry)
  const dispose = (): void => {}
  ctx.provide('typert', {
    lookups: { configure: () => dispose },
    contexts: { configureHost: () => dispose },
  } as never)
  if (withWorktrees) {
    await ctx.plugin(LocalSubprocessRuntime)
    await ctx.plugin(WorktreeService, {} as never)
  }
  const controller = new WorkspaceController(ctx, { documentsDirectory: root })
  const repo = join(root, 'app')
  mkdirSync(repo)
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), 'hello\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'initial')
  const { workspace } = await controller.create({ path: repo })
  return { controller, root, repo, workspace }
}

async function failureOf(promise: Promise<unknown>): Promise<RemoteError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof RemoteError) return error
    throw error
  }
  throw new Error('expected the command to fail')
}

describe('worktree commands', () => {
  it('creates a worktree Workspace, lists it beside the primary, and removes both', async () => {
    const { controller, workspace } = await harness()
    const created = await controller.createWorktree({ workspaceId: workspace.workspaceId, name: 'feature' })
    expect(created.worktree).toMatchObject({ branch: 'feature', baseRef: 'HEAD' })
    expect(existsSync(created.workspace.path)).toBe(true)

    const listed = await controller.listWorktrees({ workspaceId: workspace.workspaceId })
    expect(listed.worktrees.map(entry => [entry.isPrimary, entry.branch, entry.workspaceId])).toEqual([
      [true, 'main', workspace.workspaceId],
      [false, 'feature', created.workspace.workspaceId],
    ])

    await expect(controller.inspectWorktree({ workspaceId: created.workspace.workspaceId })).resolves.toEqual({
      linked: true, branch: 'feature', uncommitted: [],
    })
    await expect(controller.removeWorktree({ workspaceId: created.workspace.workspaceId })).resolves.toEqual({
      deleted: true, branch: 'feature', branchDeleted: true,
    })
    expect(existsSync(created.workspace.path)).toBe(false)
    const afterRemoval = await controller.listWorktrees({ workspaceId: workspace.workspaceId })
    expect(afterRemoval.worktrees).toHaveLength(1)
  })

  it('passes the base ref and lists a worktree that has no Workspace', async () => {
    const { controller, repo, workspace } = await harness()
    git(repo, 'branch', 'release')
    const created = await controller.createWorktree({ workspaceId: workspace.workspaceId, baseRef: 'release' })
    expect(created.worktree.baseRef).toContain('release')
    await controller.delete({ workspaceId: created.workspace.workspaceId })
    const listed = await controller.listWorktrees({ workspaceId: workspace.workspaceId })
    expect(listed.worktrees[1]).toBeDefined()
    expect(listed.worktrees[1]?.workspaceId).toBeUndefined()
  })

  it('refuses a dirty removal unless forced, keeping the Workspace until it succeeds', async () => {
    const { controller, workspace } = await harness()
    const created = await controller.createWorktree({ workspaceId: workspace.workspaceId, name: 'dirty' })
    writeFileSync(join(created.workspace.path, 'scratch.txt'), 'x\n')
    const { workspaceId } = created.workspace

    await expect(controller.inspectWorktree({ workspaceId })).resolves.toMatchObject({
      linked: true, uncommitted: ['?? scratch.txt'],
    })
    const refusal = await failureOf(controller.removeWorktree({ workspaceId }))
    expect(refusal.code).toBe('workspace/worktree-dirty')
    expect(refusal.details).toEqual({ workspaceId, entries: ['?? scratch.txt'] })
    expect(existsSync(created.workspace.path)).toBe(true)

    await expect(controller.removeWorktree({ workspaceId, force: true })).resolves.toMatchObject({ deleted: true })
    expect(existsSync(created.workspace.path)).toBe(false)
  })

  it('reports a primary checkout and a plain directory as not linked', async () => {
    const { controller, root, workspace } = await harness()
    await expect(controller.inspectWorktree({ workspaceId: workspace.workspaceId })).resolves.toEqual({ linked: false, uncommitted: [] })
    const plain = join(root, 'plain')
    mkdirSync(plain)
    const { workspace: plainWorkspace } = await controller.create({ path: plain })
    await expect(controller.inspectWorktree({ workspaceId: plainWorkspace.workspaceId }))
      .resolves.toEqual({ linked: false, uncommitted: [] })
    const failure = await failureOf(controller.createWorktree({ workspaceId: plainWorkspace.workspaceId }))
    expect(failure.code).toBe('workspace/worktree-unavailable')
  })

  it('tolerates a registered directory that was deleted and reports other git failures', async () => {
    const { controller, root, workspace } = await harness()
    const gone = join(root, 'gone')
    mkdirSync(gone)
    const { workspace: goneWorkspace } = await controller.create({ path: gone })
    rmSync(gone, { recursive: true })
    await expect(controller.listWorktrees({ workspaceId: workspace.workspaceId })).resolves.toMatchObject({
      worktrees: [{ isPrimary: true, workspaceId: workspace.workspaceId }],
    })
    // git cannot run in a directory that no longer exists; that is neither "not linked" nor "no repository".
    await expect(controller.inspectWorktree({ workspaceId: goneWorkspace.workspaceId })).rejects.toThrow()
    const failure = await failureOf(controller.removeWorktree({ workspaceId: goneWorkspace.workspaceId }))
    expect(failure.code).toBe('workspace/worktree-failed')
  })

  it('handles a detached worktree that has no branch', async () => {
    const { controller, repo, root, workspace } = await harness()
    const detached = join(root, 'detached')
    git(repo, 'worktree', 'add', '-q', '--detach', detached)
    const { workspace: detachedWorkspace } = await controller.create({ path: detached })
    const { workspaceId } = detachedWorkspace
    const listed = await controller.listWorktrees({ workspaceId: workspace.workspaceId })
    expect(listed.worktrees[1]).toEqual({ path: detached, isPrimary: false, locked: false, prunable: false, workspaceId })
    await expect(controller.inspectWorktree({ workspaceId })).resolves.toEqual({ linked: true, uncommitted: [] })
    await expect(controller.removeWorktree({ workspaceId })).resolves.toEqual({ deleted: true, branchDeleted: false })
  })

  it('refuses to remove a primary checkout', async () => {
    const { controller, workspace } = await harness()
    const failure = await failureOf(controller.removeWorktree({ workspaceId: workspace.workspaceId }))
    expect(failure.code).toBe('workspace/worktree-failed')
  })

  it('maps a git refusal to a worktree failure', async () => {
    const { controller, workspace } = await harness()
    const failure = await failureOf(controller.createWorktree({ workspaceId: workspace.workspaceId, baseRef: 'no-such-ref' }))
    expect(failure.code).toBe('workspace/worktree-failed')
  })

  it('answers unavailable or not linked when the worktree service is not mounted', async () => {
    const { controller, workspace } = await harness(false)
    const { workspaceId } = workspace
    expect((await failureOf(controller.createWorktree({ workspaceId }))).code).toBe('workspace/worktree-unavailable')
    expect((await failureOf(controller.listWorktrees({ workspaceId }))).code).toBe('workspace/worktree-unavailable')
    expect((await failureOf(controller.removeWorktree({ workspaceId }))).code).toBe('workspace/worktree-unavailable')
    await expect(controller.inspectWorktree({ workspaceId })).resolves.toEqual({ linked: false, uncommitted: [] })
  })

  it('fails with not-found for an unknown Workspace', async () => {
    const { controller, workspace } = await harness()
    const { workspaceId } = workspace
    await controller.delete({ workspaceId })
    expect((await failureOf(controller.createWorktree({ workspaceId }))).code).toBe('workspace/not-found')
  })
})
