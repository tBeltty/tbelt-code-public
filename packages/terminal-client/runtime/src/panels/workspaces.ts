/**
 * The `/workspaces` panel: add a directory as a workspace, rename a workspace
 * or remove it from the list.
 * @module @deepseek-ai/dsh-terminal-client/panels/workspaces
 */
import { resolveTypedPath, t, workspaceItems } from '@deepseek-ai/dsh-terminal-views'
import { attempt, confirm } from '../config/ui.ts'
import type { FlowUi } from '../config/ui.ts'
import type { PanelContext } from './context.ts'

/** Marker value of the row that adds a workspace. */
const ADD = 'add'

/**
 * Run the `/workspaces` panel once.
 * @param ctx - the session and the client services.
 * @param ui - where questions and messages go.
 * @returns settles when the person finished or left the panel.
 */
export async function runWorkspaces(ctx: PanelContext, ui: FlowUi): Promise<void> {
  const { workspaces } = ctx.services
  const failed = (message: string): string => t('workspace.failed', { message })
  const rows = workspaces.list.getSnapshot().items
  const picked = await ui.pick(t('workspace.title'), [{ value: ADD, label: t('workspace.add') }, ...workspaceItems(rows, ctx.session.home)])
  if (picked === undefined) return
  if (picked.value === ADD) {
    const typed = await ui.ask(t('workspace.addPrompt'), { hint: t('workspace.addHint') })
    if (typed === undefined || typed === '') return
    const path = resolveTypedPath(typed, { base: ctx.session.cwd, home: ctx.session.home })
    const isDirectory = await attempt(ui, failed, () => ctx.files.isDirectory(path))
    if (isDirectory === undefined) return
    if (!isDirectory.value) {
      ui.warn(t('workspace.notDirectory', { path }))
      return
    }
    const created = await attempt(ui, failed, () => workspaces.create({ path }))
    if (created !== undefined) ui.info(t('workspace.added', { title: created.value.title }))
    return
  }
  const row = rows.find(candidate => candidate.workspaceId === picked.value)
  const action = await ui.pick(picked.label, [
    { value: 'rename', label: t('workspace.action.rename') },
    { value: 'remove', label: t('workspace.action.remove') },
  ])
  if (row === undefined || action === undefined) return
  if (action.value === 'rename') {
    const title = await ui.ask(t('workspace.renamePrompt'), { initial: row.title })
    if (title === undefined || title === '') return
    if (await attempt(ui, failed, () => workspaces.rename(row.workspaceId, title))) ui.info(t('workspace.renamed'))
  } else if (await confirm(ui, t('workspace.removeAsk', { title: row.title }), t('workspace.removeYes'))) {
    if (await attempt(ui, failed, () => workspaces.delete(row.workspaceId))) ui.info(t('workspace.removed'))
  }
}
