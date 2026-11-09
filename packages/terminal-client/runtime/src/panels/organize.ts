/**
 * The `/organize` panel: archive, bring back, pin and unpin sessions.
 * @module @deepseek-ai/dsh-terminal-client/panels/organize
 */
import { organizeItems, sessionItems, t } from '@deepseek-ai/dsh-terminal-views'
import type { OrganizeAction } from '@deepseek-ai/dsh-terminal-views'
import { attempt, confirm } from '../config/ui.ts'
import type { FlowUi } from '../config/ui.ts'
import type { PanelContext } from './context.ts'

/** The line printed after each action. */
const DONE = {
  archive: 'organize.archived', unarchive: 'organize.unarchived', pin: 'organize.pinned', unpin: 'organize.unpinned',
} as const

/**
 * Run the `/organize` panel once.
 * @param ctx - the session and the client services.
 * @param ui - where questions and messages go.
 * @returns settles when the person finished or left the panel.
 */
export async function runOrganize(ctx: PanelContext, ui: FlowUi): Promise<void> {
  const { workspaces } = ctx.services
  const { sessionId } = ctx.session
  const listed = workspaces.list.getSnapshot()
  const picked = await ui.pick(t('organize.title'), sessionItems(ctx.sessions(), { currentId: sessionId, home: ctx.session.home, now: ctx.now() }))
  if (picked === undefined) return
  const archived = listed.archivedSessionIds.includes(picked.value)
  const pinned = listed.pinnedSessionIds.includes(picked.value)
  const action = await ui.pick(picked.label, organizeItems(archived, pinned))
  if (action === undefined) return
  const verb = action.value as OrganizeAction
  const failed = (message: string): string => t('organize.failed', { message })
  if (verb === 'archive') {
    const stop = picked.value === sessionId && ctx.session.running()
    if (stop && !await confirm(ui, t('organize.stopAsk'), t('organize.stopYes'))) return
    const archived = await attempt(ui, failed, () => workspaces.archiveSession(picked.value, stop ? { stopActivity: true } : undefined))
    if (archived !== undefined) ui.info(t(DONE.archive))
    return
  }
  const method = ({ unarchive: 'unarchiveSession', pin: 'pinSession', unpin: 'unpinSession' } as const)[verb]
  if (await attempt(ui, failed, () => workspaces[method](picked.value))) ui.info(t(DONE[verb]))
}
