/**
 * The `/open` panel: open this directory, or a path typed after the command,
 * in an application on the machine the Host runs on.
 * @module @deepseek-ai/dsh-terminal-client/panels/open
 */
import { applicationItems, OPEN_REVEAL, resolveTypedPath, t } from '@deepseek-ai/dsh-terminal-views'
import { remoteDone, remoteValue } from '../config/ui.ts'
import type { FlowUi } from '../config/ui.ts'
import type { PanelContext } from './context.ts'

/**
 * Run the `/open` panel once.
 * @param argument - a path relative to the session directory, or empty for the directory itself.
 * @param ctx - the session and the Remote namespaces.
 * @param ui - where questions and messages go.
 * @returns settles when the person finished or left the panel.
 */
export async function runOpen(argument: string, ctx: PanelContext, ui: FlowUi): Promise<void> {
  const failed = (message: string): string => t('open.failed', { message })
  const { session, remote } = ctx
  if (await remoteValue(ui, failed, () => remote.session.canOpenWorkspacePath()) !== true) {
    ui.info(t('open.unavailable'))
    return
  }
  const path = resolveTypedPath(argument, { base: session.cwd, home: session.home })
  const apps = await remoteValue(ui, failed, () => remote.session.workspacePathApplications({ path }))
  if (apps === undefined) return
  const picked = await ui.pick(t('open.title'), applicationItems(apps))
  if (picked === undefined) return
  const request = picked.value === OPEN_REVEAL
    ? { path, action: 'reveal' as const }
    : { path, application: picked.value.slice('app:'.length) }
  if (await remoteDone(ui, failed, () => remote.session.openWorkspacePath(request))) ui.info(t('open.opened', { path }))
}
