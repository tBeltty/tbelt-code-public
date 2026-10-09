/**
 * The `/skills` panel: the skills the Host offers. Choosing one runs it by
 * sending `/name arguments` as a message, the way the GUI does.
 * @module @deepseek-ai/dsh-terminal-client/panels/skills
 */
import { skillItems, skillMessage, t } from '@deepseek-ai/dsh-terminal-views'
import { remoteDone, remoteValue } from '../config/ui.ts'
import type { FlowUi } from '../config/ui.ts'
import type { PanelContext } from './context.ts'

/**
 * Run the `/skills` panel once.
 * @param ctx - the session and the Remote namespaces.
 * @param ui - where questions and messages go.
 * @returns settles when the person finished or left the panel.
 */
export async function runSkills(ctx: PanelContext, ui: FlowUi): Promise<void> {
  const listed = await remoteValue(ui, message => t('skills.failed', { message }), () => ctx.remote.skills.list({ sessionId: ctx.session.sessionId }))
  if (listed === undefined) return
  if (listed.skills.length === 0) {
    ui.info(t('skills.empty'))
    return
  }
  const picked = await ui.pick(t('skills.title'), skillItems(listed.skills))
  if (picked === undefined) return
  const args = await ui.ask(t('skills.argsPrompt', { name: picked.value }), { hint: t('skills.argsHint') })
  if (args === undefined) return
  await remoteDone(
    ui,
    message => t('skills.runFailed', { name: picked.value, message }),
    () => ctx.session.prompt([{ type: 'text', text: skillMessage(picked.value, args) }], 'queue'),
  )
}
