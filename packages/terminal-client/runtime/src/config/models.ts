/**
 * The `/model default` screen: choose the model new sessions start with.
 * @module @deepseek-ai/dsh-terminal-client/config/models
 */
import { modelItems, parseModelValue, t } from '@deepseek-ai/dsh-terminal-views'
import type { RemotePort } from '../ports.ts'
import { remoteDone, remoteValue } from './ui.ts'
import type { FlowUi } from './ui.ts'

/**
 * Run the default model screen once.
 * @param remote - the Remote namespaces of the connected client.
 * @param ui - where questions and messages go.
 * @returns settles when the person finished or left the screen.
 */
export async function runDefaultModel(remote: RemotePort, ui: FlowUi): Promise<void> {
  const catalog = await remoteValue(ui, message => t('picker.loadFailed', { message }), () => remote.session.modelCatalog())
  if (catalog === undefined) return
  const items = modelItems(catalog)
  if (items.length === 0) {
    ui.warn(t('model.none'))
    return
  }
  const picked = await ui.pick(t('picker.defaultModel'), items)
  if (picked === undefined) return
  const choice = parseModelValue(picked.value)
  if (await remoteDone(ui, message => t('model.failed', { message }), () => remote.session.setDefaultModel(choice))) {
    ui.info(t('model.defaultSet', { model: choice.model, provider: choice.provider }))
  }
}
