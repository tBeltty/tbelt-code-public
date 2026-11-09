/**
 * The `/fork` panel: copy the session, up to the end of a turn or the whole
 * conversation, into a new session and open it.
 * @module @deepseek-ai/dsh-terminal-client/panels/fork
 */
import { FORK_END, forkItems, t } from '@deepseek-ai/dsh-terminal-views'
import { remoteValue } from '../config/ui.ts'
import type { FlowUi } from '../config/ui.ts'
import type { PanelContext } from './context.ts'

/**
 * Run the `/fork` panel once.
 * @param ctx - the session and the Remote namespaces.
 * @param ui - where questions and messages go.
 * @returns settles when the person finished or left the panel.
 */
export async function runFork(ctx: PanelContext, ui: FlowUi): Promise<void> {
  const picked = await ui.pick(t('fork.title'), forkItems(ctx.session.events()))
  if (picked === undefined) return
  const { sessionId } = ctx.session
  const forked = await remoteValue(
    ui,
    message => t('fork.failed', { message }),
    () => ctx.remote.session.fork(picked.value === FORK_END ? { sessionId } : { sessionId, atSeq: Number(picked.value) }),
  )
  if (forked === undefined) return
  ui.info(t('fork.opened'))
  ctx.leave({ kind: 'resume', sessionId: forked.sessionId })
}
