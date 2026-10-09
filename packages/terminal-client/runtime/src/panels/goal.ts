/**
 * The bare `/goal` panel: the session goal and what its phase allows. The
 * command with text, `/goal <objective>`, still goes to the session.
 * @module @deepseek-ai/dsh-terminal-client/panels/goal
 */
import { goalActions, goalLines, t } from '@deepseek-ai/dsh-terminal-views'
import { confirm, remoteDone, remoteOutcome } from '../config/ui.ts'
import type { FlowUi } from '../config/ui.ts'
import type { PanelContext } from './context.ts'

/** Marker value of the choice that sets the first goal. */
const CREATE = 'create'

/**
 * Run the `/goal` panel once.
 * @param ctx - the session and the Remote namespaces.
 * @param ui - where questions and messages go.
 * @returns settles when the person finished or left the panel.
 */
export async function runGoal(ctx: PanelContext, ui: FlowUi): Promise<void> {
  const { sessionId } = ctx.session
  const failed = (message: string): string => t('goal.failed', { message })
  const found = await remoteOutcome(ui, failed, () => ctx.remote.goals.get(sessionId))
  if (found === undefined) return
  const goal = found.value
  if (goal === undefined) {
    ui.info(t('goal.none'))
    const action = await ui.pick(t('goal.none'), [{ value: CREATE, label: t('goal.create') }])
    if (action === undefined) return
    const objective = await ui.ask(t('goal.objectivePrompt'), { hint: t('goal.objectiveHint') })
    if (objective === undefined || objective === '') return
    if (await remoteDone(ui, failed, () => ctx.remote.goals.create(sessionId, { objective }))) ui.info(t('goal.saved'))
    return
  }
  ui.show(goalLines(ctx.style, goal))
  const ref = { id: goal.id, revision: goal.revision }
  const action = await ui.pick(goal.objective, goalActions(goal))
  switch (action?.value) {
    case 'edit': {
      const objective = await ui.ask(t('goal.objectivePrompt'), { hint: t('goal.objectiveHint'), initial: goal.objective })
      if (objective === undefined || objective === '') return
      if (await remoteDone(ui, failed, () => ctx.remote.goals.edit(sessionId, ref, { objective }))) ui.info(t('goal.saved'))
      return
    }
    case 'pause':
    case 'resume':
    case 'complete': {
      const verb = action.value
      if (await remoteDone(ui, failed, () => ctx.remote.goals[verb](sessionId, ref))) ui.info(t('goal.saved'))
      return
    }
    case 'clear':
      if (!await confirm(ui, t('goal.action.clear'), t('goal.action.clear'))) return
      if (await remoteDone(ui, failed, () => ctx.remote.goals.clear(sessionId, ref))) ui.info(t('goal.cleared'))
      return
    default:
  }
}
