/**
 * The `/deliverables` panel: the files each turn changed or presented, read
 * from the loaded history.
 * @module @deepseek-ai/dsh-terminal-client/panels/deliverables
 */
import { deliverableLines, t, turnDeliverables } from '@deepseek-ai/dsh-terminal-views'
import type { FlowUi } from '../config/ui.ts'
import type { PanelContext } from './context.ts'

/**
 * Run the `/deliverables` panel once.
 * @param ctx - the session on screen.
 * @param ui - where questions and messages go.
 * @returns settles when the person finished or left the panel.
 */
export async function runDeliverables(ctx: PanelContext, ui: FlowUi): Promise<void> {
  const turns = turnDeliverables(ctx.session.events()).reverse()
  const [only] = turns
  if (only === undefined) {
    ui.info(t('deliverables.none'))
    return
  }
  if (turns.length === 1) {
    ui.show(deliverableLines(ctx.style, only))
    return
  }
  const picked = await ui.pick(t('deliverables.title'), turns.map(turn => ({
    value: String(turn.turn),
    label: t('deliverables.turn', { turn: turn.turn }),
    detail: [
      ...turn.produced.length === 0 ? [] : [t('deliverables.changed', { count: turn.produced.length })],
      ...turn.presented.length === 0 ? [] : [t('deliverables.delivered', { count: turn.presented.length })],
    ].join(' · '),
  })))
  const chosen = turns.find(turn => String(turn.turn) === picked?.value)
  if (chosen !== undefined) ui.show(deliverableLines(ctx.style, chosen))
}
