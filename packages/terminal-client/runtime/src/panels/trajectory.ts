/**
 * The `/trajectory` panel: the turns of the session with their timing, and
 * the events of one turn in order.
 * @module @deepseek-ai/dsh-terminal-client/panels/trajectory
 */
import { ledgerLines, outlineRows, statsRow, t, trajectoryHeader, trajectoryItems, turnSlices } from '@deepseek-ai/dsh-terminal-views'
import type { FlowUi } from '../config/ui.ts'
import type { PanelContext } from './context.ts'

/**
 * Run the `/trajectory` panel once.
 * @param ctx - the session on screen.
 * @param ui - where questions and messages go.
 * @returns settles when the person finished or left the panel.
 */
export async function runTrajectory(ctx: PanelContext, ui: FlowUi): Promise<void> {
  const rows = outlineRows(ctx.session.projection('turnOutline'))
  if (rows.length === 0) {
    ui.info(t('trajectory.empty'))
    return
  }
  const stats = statsRow(ctx.session.projection('sessionStats'))
  if (stats !== undefined) ui.show(trajectoryHeader(ctx.style, stats))
  const slices = turnSlices(ctx.session.events())
  const picked = await ui.pick(t('trajectory.title'), trajectoryItems(rows, slices))
  if (picked === undefined) return
  const events = slices.get(Number(picked.value))
  if (events === undefined) ui.info(t('trajectory.turnNotLoaded'))
  else ui.show(ledgerLines(ctx.style, events))
}
