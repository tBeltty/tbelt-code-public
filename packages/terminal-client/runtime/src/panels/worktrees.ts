/**
 * The `/worktrees` panel: the git worktrees of this session's workspace.
 * A worktree can be created, opened as a session, inspected or removed.
 * @module @deepseek-ai/dsh-terminal-client/panels/worktrees
 */
import { t, WORKTREE_CREATE, worktreeItems, worktreeLines } from '@deepseek-ai/dsh-terminal-views'
import type { PickerItem } from '@deepseek-ai/dsh-terminal-views'
import { attempt, confirm } from '../config/ui.ts'
import type { FlowUi } from '../config/ui.ts'
import type { WorktreePort } from '../panel-ports.ts'
import type { PanelContext } from './context.ts'

/** Remove the worktree of a workspace after asking, and say what was removed. */
async function remove(ctx: PanelContext, ui: FlowUi, workspaceId: string, branch: string | undefined): Promise<void> {
  const { workspaces } = ctx.services
  const failed = (message: string): string => t('worktrees.failed', { message })
  const inspected = await attempt(ui, failed, () => workspaces.inspectWorktree(workspaceId))
  if (inspected === undefined) return
  const dirty = inspected.value.uncommitted.length > 0
  const question = dirty ? t('worktrees.removeForceAsk') : t('worktrees.removeAsk', { branch: branch === undefined ? '' : ` ${branch}` })
  if (!await confirm(ui, question, t(dirty ? 'worktrees.removeForceYes' : 'worktrees.removeYes'))) return
  const removed = await attempt(ui, failed, () => workspaces.removeWorktree(workspaceId, dirty ? { force: true } : undefined))
  if (removed === undefined) return
  ui.info(t('worktrees.removed'))
  if (removed.value.branchDeleted) ui.info(t('worktrees.branchDeleted'))
}

/** Create a worktree for the workspace and say where it is. */
async function create(ctx: PanelContext, ui: FlowUi, workspaceId: string): Promise<void> {
  const name = await ui.ask(t('worktrees.namePrompt'), { hint: t('worktrees.nameHint') })
  if (name === undefined) return
  const created = await attempt(
    ui,
    message => t('worktrees.failed', { message }),
    () => ctx.services.workspaces.createWorktree(workspaceId, name === '' ? undefined : { name }),
  )
  if (created === undefined) return
  const { worktree } = created.value
  ui.info(t('worktrees.created', { branch: worktree.branch, base: worktree.baseRef }))
  for (const text of worktree.warnings) ui.warn(t('worktrees.warning', { text }))
}

/**
 * Run the `/worktrees` panel once.
 * @param ctx - the session and the client services.
 * @param ui - where questions and messages go.
 * @returns settles when the person finished or left the panel.
 */
export async function runWorktrees(ctx: PanelContext, ui: FlowUi): Promise<void> {
  const { workspaces } = ctx.services
  const failed = (message: string): string => t('worktrees.failed', { message })
  const workspace = workspaces.list.getSnapshot().items.find(item => item.sessionIds.includes(ctx.session.sessionId))
  if (workspace === undefined) {
    ui.info(t('worktrees.noWorkspace'))
    return
  }
  const listed = await attempt(ui, failed, () => workspaces.listWorktrees(workspace.workspaceId))
  if (listed === undefined) return
  const picked = await ui.pick(t('worktrees.title'), worktreeItems(listed.value.worktrees, ctx.session.home))
  if (picked === undefined) return
  if (picked.value === WORKTREE_CREATE) {
    await create(ctx, ui, workspace.workspaceId)
    return
  }
  const worktree = listed.value.worktrees.find(candidate => candidate.path === picked.value) as WorktreePort
  const actions: PickerItem[] = [
    { value: 'open', label: t('worktrees.action.open') },
    ...worktree.workspaceId === undefined ? [] : [{ value: 'inspect', label: t('worktrees.action.inspect') }],
    ...worktree.workspaceId === undefined || worktree.isPrimary ? [] : [{ value: 'remove', label: t('worktrees.action.remove') }],
  ]
  const action = await ui.pick(picked.label, actions)
  if (action?.value === 'open') {
    ctx.leave({ kind: 'new', cwd: worktree.path })
  } else if (action?.value === 'inspect') {
    // The list offers Inspect and Remove only for a worktree that is a workspace.
    const inspected = await attempt(ui, failed, () => workspaces.inspectWorktree(worktree.workspaceId as string))
    if (inspected !== undefined) ui.show(worktreeLines(ctx.style, inspected.value))
  } else if (action?.value === 'remove') {
    await remove(ctx, ui, worktree.workspaceId as string, worktree.branch)
  }
}
