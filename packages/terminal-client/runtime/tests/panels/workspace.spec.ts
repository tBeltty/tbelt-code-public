import { describe, expect, it } from 'vitest'
import { runWorkspaces } from '../../src/panels/workspaces.ts'
import { runWorktrees } from '../../src/panels/worktrees.ts'
import type { WorktreePort } from '../../src/panel-ports.ts'
import { fakePanelContext, scriptedUi } from '../fakes.ts'

const texts = (log: { kind: string; text: string }[], kind: string) => log.filter(entry => entry.kind === kind).map(entry => entry.text)
const SESSION = 'session-3f9a0c1e-0000'
const app = { workspaceId: 'w1', path: '/work/app', title: 'app', sessionIds: [SESSION] }

const rig = (items = [app]) => {
  const ctx = fakePanelContext()
  ctx.services.workspaces.list.set({ items, archivedSessionIds: [], pinnedSessionIds: [], phase: 'ready' })
  return ctx
}

describe('workspaces panel', () => {
  it('adds a directory typed relative to the session directory', async () => {
    const ctx = rig()
    const { ui, log } = scriptedUi(['add', '../other'])
    await runWorkspaces(ctx, ui)
    expect(ctx.files.isDirectory).toHaveBeenCalledWith('/work/other')
    expect(ctx.services.workspaces.create).toHaveBeenCalledWith({ path: '/work/other' })
    expect(texts(log, 'info')).toEqual(['Added other.'])
    expect(log[0]!.items!.map(item => item.label)).toEqual(['Add a workspace', 'app'])
  })

  it('leaves at every step of adding', async () => {
    const ctx = rig()
    await runWorkspaces(ctx, scriptedUi([undefined]).ui)
    await runWorkspaces(ctx, scriptedUi(['add', undefined]).ui)
    await runWorkspaces(ctx, scriptedUi(['add', '']).ui)
    expect(ctx.files.isDirectory).not.toHaveBeenCalled()
  })

  it('refuses a path that is not a directory and reports failures', async () => {
    const ctx = rig()
    ctx.files.isDirectory.mockResolvedValueOnce(false)
    const file = scriptedUi(['add', '/etc/hosts'])
    await runWorkspaces(ctx, file.ui)
    expect(texts(file.log, 'warn')).toEqual(['/etc/hosts is not a directory.'])
    expect(ctx.services.workspaces.create).not.toHaveBeenCalled()
    ctx.files.isDirectory.mockRejectedValueOnce(new Error('denied'))
    const unreadable = scriptedUi(['add', '/root'])
    await runWorkspaces(ctx, unreadable.ui)
    expect(texts(unreadable.log, 'warn')).toEqual(['Could not change the workspace: denied'])
    ctx.services.workspaces.create.mockRejectedValueOnce(new Error('duplicate'))
    const refused = scriptedUi(['add', '/work/x'])
    await runWorkspaces(ctx, refused.ui)
    expect(texts(refused.log, 'warn')).toEqual(['Could not change the workspace: duplicate'])
    expect(texts(refused.log, 'info')).toEqual([])
  })

  it('renames a workspace', async () => {
    const ctx = rig()
    const { ui, log } = scriptedUi(['w1', 'rename', 'Main app'])
    await runWorkspaces(ctx, ui)
    expect(ctx.services.workspaces.rename).toHaveBeenCalledWith('w1', 'Main app')
    expect(log.find(item => item.kind === 'ask')!.options).toMatchObject({ initial: 'app' })
    expect(texts(log, 'info')).toEqual(['Renamed.'])
  })

  it('leaves a rename and reports its failure', async () => {
    const ctx = rig()
    await runWorkspaces(ctx, scriptedUi(['w1', undefined]).ui)
    await runWorkspaces(ctx, scriptedUi(['w1', 'rename', undefined]).ui)
    await runWorkspaces(ctx, scriptedUi(['w1', 'rename', '']).ui)
    expect(ctx.services.workspaces.rename).not.toHaveBeenCalled()
    ctx.services.workspaces.rename.mockRejectedValueOnce(new Error('busy'))
    const refused = scriptedUi(['w1', 'rename', 'x'])
    await runWorkspaces(ctx, refused.ui)
    expect(texts(refused.log, 'warn')).toEqual(['Could not change the workspace: busy'])
  })

  it('removes a workspace only after confirmation', async () => {
    const ctx = rig()
    await runWorkspaces(ctx, scriptedUi(['w1', 'remove', 'no']).ui)
    expect(ctx.services.workspaces.delete).not.toHaveBeenCalled()
    const { ui, log } = scriptedUi(['w1', 'remove', 'yes'])
    await runWorkspaces(ctx, ui)
    expect(ctx.services.workspaces.delete).toHaveBeenCalledWith('w1')
    expect(texts(log, 'info')).toEqual(['Removed.'])
    ctx.services.workspaces.delete.mockRejectedValueOnce(new Error('busy'))
    const refused = scriptedUi(['w1', 'remove', 'yes'])
    await runWorkspaces(ctx, refused.ui)
    expect(texts(refused.log, 'info')).toEqual([])
  })

  it('does nothing when the workspace vanished while choosing', async () => {
    const ctx = rig()
    const { ui } = scriptedUi(['w1', 'rename'])
    const pick = ui.pick
    ui.pick = async (title, items) => {
      const picked = await pick(title, items)
      ctx.services.workspaces.list.set({ items: [], archivedSessionIds: [], pinnedSessionIds: [], phase: 'ready' })
      return picked
    }
    await runWorkspaces(ctx, ui)
    expect(ctx.services.workspaces.rename).not.toHaveBeenCalled()
  })
})

describe('worktrees panel', () => {
  const primary = { path: '/work/app', branch: 'main', isPrimary: true, locked: false, prunable: false, workspaceId: 'w1' }
  const linked = { path: '/work/app-x', branch: 'x', isPrimary: false, locked: false, prunable: false, workspaceId: 'w2' }
  const loose = { path: '/work/app-y', isPrimary: false, locked: false, prunable: false }
  const withTrees = (worktrees: WorktreePort[] = [primary, linked, loose]) => {
    const ctx = rig()
    ctx.services.workspaces.listWorktrees.mockResolvedValue({ worktrees })
    return ctx
  }

  it('says when the directory is in no workspace', async () => {
    const ctx = rig([])
    const { ui, log } = scriptedUi([])
    await runWorktrees(ctx, ui)
    expect(texts(log, 'info')).toEqual(['This directory is not in a registered workspace. Add it with /workspaces.'])
  })

  it('reports a failed listing and leaves without a choice', async () => {
    const ctx = withTrees()
    ctx.services.workspaces.listWorktrees.mockRejectedValueOnce(new Error('not a repository'))
    const failed = scriptedUi([])
    await runWorktrees(ctx, failed.ui)
    expect(texts(failed.log, 'warn')).toEqual(['Could not change the worktree: not a repository'])
    await runWorktrees(ctx, scriptedUi([undefined]).ui)
    await runWorktrees(ctx, scriptedUi(['/work/app', undefined]).ui)
    expect(ctx.leave).not.toHaveBeenCalled()
  })

  it('starts a session in a worktree', async () => {
    const ctx = withTrees()
    await runWorktrees(ctx, scriptedUi(['/work/app-y', 'open']).ui)
    expect(ctx.leave).toHaveBeenCalledWith({ kind: 'new', cwd: '/work/app-y' })
  })

  it('offers inspect and remove only where they apply', async () => {
    const ctx = withTrees()
    const actions = async (path: string) => {
      const { ui, log } = scriptedUi([path, undefined])
      await runWorktrees(ctx, ui)
      return log[1]!.items!.map(item => item.value)
    }
    expect(await actions('/work/app')).toEqual(['open', 'inspect'])
    expect(await actions('/work/app-x')).toEqual(['open', 'inspect', 'remove'])
    expect(await actions('/work/app-y')).toEqual(['open'])
  })

  it('shows the state of a worktree', async () => {
    const ctx = withTrees()
    ctx.services.workspaces.inspectWorktree.mockResolvedValueOnce({ linked: true, branch: 'x', uncommitted: ['a.ts'] })
    const { ui, log } = scriptedUi(['/work/app-x', 'inspect'])
    await runWorktrees(ctx, ui)
    expect(ctx.services.workspaces.inspectWorktree).toHaveBeenCalledWith('w2')
    expect(texts(log, 'show')[0]).toContain('Uncommitted changes, 1')
    ctx.services.workspaces.inspectWorktree.mockRejectedValueOnce(new Error('gone'))
    const failed = scriptedUi(['/work/app-x', 'inspect'])
    await runWorktrees(ctx, failed.ui)
    expect(texts(failed.log, 'show')).toEqual([])
    expect(texts(failed.log, 'warn')).toEqual(['Could not change the worktree: gone'])
  })

  it('creates a worktree with or without a name and passes on warnings', async () => {
    const ctx = withTrees()
    ctx.services.workspaces.createWorktree.mockResolvedValueOnce({
      workspace: app, worktree: { branch: 'feat', baseRef: 'main', warnings: ['hooks skipped'] },
    })
    const named = scriptedUi(['create', 'feat'])
    await runWorktrees(ctx, named.ui)
    expect(ctx.services.workspaces.createWorktree).toHaveBeenCalledWith('w1', { name: 'feat' })
    expect(texts(named.log, 'info')).toEqual(['Created worktree on feat, from main.'])
    expect(texts(named.log, 'warn')).toEqual(['Warning: hooks skipped'])
    await runWorktrees(ctx, scriptedUi(['create', '']).ui)
    expect(ctx.services.workspaces.createWorktree).toHaveBeenLastCalledWith('w1', undefined)
  })

  it('leaves a creation and reports its failure', async () => {
    const ctx = withTrees()
    await runWorktrees(ctx, scriptedUi(['create', undefined]).ui)
    expect(ctx.services.workspaces.createWorktree).not.toHaveBeenCalled()
    ctx.services.workspaces.createWorktree.mockRejectedValueOnce(new Error('exists'))
    const failed = scriptedUi(['create', 'x'])
    await runWorktrees(ctx, failed.ui)
    expect(texts(failed.log, 'warn')).toEqual(['Could not change the worktree: exists'])
    expect(texts(failed.log, 'info')).toEqual([])
  })

  it('removes a clean worktree after asking and says its branch went too', async () => {
    const ctx = withTrees()
    const { ui, log } = scriptedUi(['/work/app-x', 'remove', 'yes'])
    await runWorktrees(ctx, ui)
    expect(log[2]!.text).toBe('Remove the worktree x?')
    expect(ctx.services.workspaces.removeWorktree).toHaveBeenCalledWith('w2', undefined)
    expect(texts(log, 'info')).toEqual(['Removed the worktree.', 'Deleted its branch.'])
  })

  it('forces the removal of a dirty worktree only on a second confirmation', async () => {
    const ctx = withTrees([primary, { ...linked, branch: undefined }])
    ctx.services.workspaces.inspectWorktree.mockResolvedValue({ linked: true, uncommitted: ['a.ts'] })
    ctx.services.workspaces.removeWorktree.mockResolvedValueOnce({ deleted: true, branchDeleted: false })
    const { ui, log } = scriptedUi(['/work/app-x', 'remove', 'yes'])
    await runWorktrees(ctx, ui)
    expect(log[2]!.text).toBe('It has uncommitted changes. Remove it anyway?')
    expect(ctx.services.workspaces.removeWorktree).toHaveBeenCalledWith('w2', { force: true })
    expect(texts(log, 'info')).toEqual(['Removed the worktree.'])
  })

  it('names no branch when the worktree has none', async () => {
    const ctx = withTrees([primary, { ...linked, branch: undefined }])
    const { ui, log } = scriptedUi(['/work/app-x', 'remove', 'no'])
    await runWorktrees(ctx, ui)
    expect(log[2]!.text).toBe('Remove the worktree?')
  })

  it('keeps the worktree when the person declines or the checks fail', async () => {
    const ctx = withTrees()
    await runWorktrees(ctx, scriptedUi(['/work/app-x', 'remove', 'no']).ui)
    expect(ctx.services.workspaces.removeWorktree).not.toHaveBeenCalled()
    ctx.services.workspaces.inspectWorktree.mockRejectedValueOnce(new Error('gone'))
    await runWorktrees(ctx, scriptedUi(['/work/app-x', 'remove']).ui)
    expect(ctx.services.workspaces.removeWorktree).not.toHaveBeenCalled()
    ctx.services.workspaces.removeWorktree.mockRejectedValueOnce(new Error('locked'))
    const failed = scriptedUi(['/work/app-x', 'remove', 'yes'])
    await runWorktrees(ctx, failed.ui)
    expect(texts(failed.log, 'warn')).toEqual(['Could not change the worktree: locked'])
    expect(texts(failed.log, 'info')).toEqual([])
  })
})
