/**
 * The bare `/budget` panel: spend of this session and month against their
 * limits. The command with an amount, `/budget <usd>`, still goes to the session.
 * @module @deepseek-ai/dsh-terminal-client/panels/budget
 */
import { budgetLines, t } from '@deepseek-ai/dsh-terminal-views'
import { remoteValue } from '../config/ui.ts'
import type { FlowUi } from '../config/ui.ts'
import type { PanelContext } from './context.ts'

/**
 * Run the `/budget` panel once.
 * @param ctx - the session and the Remote namespaces.
 * @param ui - where the report goes.
 * @returns settles when the report was printed.
 */
export async function runBudget(ctx: PanelContext, ui: FlowUi): Promise<void> {
  const summary = await remoteValue(ui, message => t('budget.failed', { message }), () => ctx.remote.spendBudget.summary(ctx.session.sessionId))
  if (summary !== undefined) ui.show(budgetLines(ctx.style, summary))
}
