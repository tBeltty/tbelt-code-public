/**
 * The `/commands` panel: every command the Host offers for the session,
 * including those of plugins. Choosing one puts it in the composer.
 * @module @deepseek-ai/dsh-terminal-client/panels/commands
 */
import { commandItems, t } from '@deepseek-ai/dsh-terminal-views'
import { remoteValue } from '../config/ui.ts'
import type { FlowUi } from '../config/ui.ts'
import type { PanelContext } from './context.ts'

/**
 * Run the `/commands` panel once.
 * @param ctx - the session and the Remote namespaces.
 * @param ui - where questions and messages go.
 * @returns settles when the person finished or left the panel.
 */
export async function runCommands(ctx: PanelContext, ui: FlowUi): Promise<void> {
  const commands = await remoteValue(ui, message => t('commands.failed', { message }), () => ctx.remote.commands.list(ctx.session.sessionId))
  if (commands === undefined) return
  if (commands.length === 0) {
    ui.info(t('commands.empty'))
    return
  }
  const picked = await ui.pick(t('commands.title'), commandItems(commands))
  if (picked !== undefined) ctx.session.insertText(`/${picked.value} `)
}
