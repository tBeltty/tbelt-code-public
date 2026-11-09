/**
 * The `/plan show` panel: the newest plan the agent submitted. `/plan` alone
 * still turns plan mode on or off in the session.
 * @module @deepseek-ai/dsh-terminal-client/panels/plan
 */
import { latestPlan, planLines, t } from '@deepseek-ai/dsh-terminal-views'
import type { FlowUi } from '../config/ui.ts'
import type { PanelContext } from './context.ts'

/**
 * Run the `/plan show` panel once.
 * @param ctx - the session on screen.
 * @param ui - where the plan goes.
 * @returns settles when the plan was printed.
 */
export function runPlan(ctx: PanelContext, ui: FlowUi): Promise<void> {
  const plan = latestPlan(ctx.session.events())
  if (plan === undefined) ui.info(t('plan.none'))
  else ui.show(planLines(ctx.style, plan))
  return Promise.resolve()
}
