/**
 * The `/status` panel: model, permissions, plan mode, goal, queue, turns,
 * tokens and context of the session, read from the Host's projections.
 * @module @deepseek-ai/dsh-terminal-client/panels/status
 */
import { queueRows, statusLines } from '@deepseek-ai/dsh-terminal-views'
import type { FlowUi } from '../config/ui.ts'
import type { PanelContext } from './context.ts'

/**
 * Run the `/status` panel once.
 * @param ctx - the session on screen.
 * @param ui - where the report goes.
 * @returns settles when the report was printed.
 */
export function runStatus(ctx: PanelContext, ui: FlowUi): Promise<void> {
  const { session } = ctx
  ui.show(statusLines(ctx.style, {
    sessionId: session.sessionId,
    cwd: session.cwd,
    home: session.home,
    running: session.running(),
    queued: queueRows(session.projection('inbox')).length,
  }, key => session.projection(key)))
  return Promise.resolve()
}
