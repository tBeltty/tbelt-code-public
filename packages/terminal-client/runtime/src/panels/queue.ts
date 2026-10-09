/**
 * The `/queue` panel: messages waiting for the agent. Pick one to edit its
 * text, send it into the running turn, or remove it.
 * @module @deepseek-ai/dsh-terminal-client/panels/queue
 */
import { queueItems, queueRows, t } from '@deepseek-ai/dsh-terminal-views'
import type { PickerItem } from '@deepseek-ai/dsh-terminal-views'
import { remoteDone } from '../config/ui.ts'
import type { FlowUi } from '../config/ui.ts'
import type { PanelContext } from './context.ts'

/**
 * Run the `/queue` panel once.
 * @param ctx - the session and the Remote namespaces.
 * @param ui - where questions and messages go.
 * @returns settles when the person finished or left the panel.
 */
export async function runQueue(ctx: PanelContext, ui: FlowUi): Promise<void> {
  const rows = queueRows(ctx.session.projection('inbox'))
  if (rows.length === 0) {
    ui.info(t('queue.empty'))
    return
  }
  const picked = await ui.pick(t('queue.title'), queueItems(rows))
  const row = rows.find(candidate => candidate.id === picked?.value)
  if (picked === undefined || row === undefined) return
  const actions: PickerItem[] = [
    ...row.text === undefined ? [] : [{ value: 'edit', label: t('queue.action.edit') }],
    ...ctx.session.running() ? [{ value: 'steer', label: t('queue.action.steer') }] : [],
    { value: 'remove', label: t('queue.action.remove') },
  ]
  const action = await ui.pick(row.preview === '' ? t('queue.attachmentOnly') : row.preview, actions)
  const failed = (message: string): string => t('queue.failed', { message })
  if (action?.value === 'edit') {
    const text = await ui.ask(t('queue.editPrompt'), { hint: t('queue.editHint'), initial: row.text })
    if (text === undefined || text === '') return
    if (await remoteDone(ui, failed, () => ctx.session.updateQueue(row.id, { kind: 'edit', content: [{ type: 'text', text }] }))) {
      ui.info(t('queue.edited'))
    }
  } else if (action?.value === 'steer') {
    if (await remoteDone(ui, failed, () => ctx.session.updateQueue(row.id, { kind: 'steer' }))) ui.info(t('queue.steered'))
  } else if (action?.value === 'remove') {
    if (await remoteDone(ui, failed, () => ctx.session.updateQueue(row.id, { kind: 'remove' }))) ui.info(t('queue.removed'))
  }
}
