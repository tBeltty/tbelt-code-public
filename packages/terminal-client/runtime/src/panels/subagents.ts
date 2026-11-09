/**
 * The `/subagents` panel: the children of this session. A child can be
 * opened as a session of its own; a continuable child can also be sent a
 * message or interrupted.
 * @module @deepseek-ai/dsh-terminal-client/panels/subagents
 */
import { randomUUID } from 'node:crypto'
import { subagentItems, subagentRows, t } from '@deepseek-ai/dsh-terminal-views'
import type { PickerItem } from '@deepseek-ai/dsh-terminal-views'
import { remoteDone } from '../config/ui.ts'
import type { FlowUi } from '../config/ui.ts'
import type { PanelContext } from './context.ts'

/**
 * Run the `/subagents` panel once.
 * @param ctx - the session and the Remote namespaces.
 * @param ui - where questions and messages go.
 * @returns settles when the person finished or left the panel.
 */
export async function runSubagents(ctx: PanelContext, ui: FlowUi): Promise<void> {
  const rows = subagentRows(ctx.session.projection('subagentCatalog'))
  if (rows.length === 0) {
    ui.info(t('subagent.empty'))
    return
  }
  const picked = await ui.pick(t('subagent.title'), subagentItems(rows))
  const row = rows.find(candidate => candidate.id === picked?.value)
  if (picked === undefined || row === undefined) return
  const actions: PickerItem[] = [
    { value: 'open', label: t('subagent.action.open') },
    ...row.mode === 'continuable'
      ? [{ value: 'send', label: t('subagent.action.send') }, { value: 'interrupt', label: t('subagent.action.interrupt') }]
      : [],
  ]
  const action = await ui.pick(picked.label, actions)
  const failed = (message: string): string => t('subagent.failed', { message })
  const parentSessionId = ctx.session.sessionId
  if (action?.value === 'open') {
    ctx.leave({ kind: 'resume', sessionId: row.id })
  } else if (action?.value === 'send') {
    const text = await ui.ask(t('subagent.messagePrompt'), { hint: t('subagent.messageHint') })
    if (text === undefined || text === '') return
    const request = {
      requestId: randomUUID(), parentSessionId, childSessionId: row.id, mode: 'continuable' as const, delivery: 'queue' as const,
      content: [{ type: 'text' as const, text }],
    }
    if (await remoteDone(ui, failed, () => ctx.remote.subagents.prompt(request))) ui.info(t('subagent.sent'))
  } else if (action?.value === 'interrupt') {
    if (await remoteDone(ui, failed, () => ctx.remote.subagents.interruptByParent(row.id, parentSessionId, 'continuable'))) {
      ui.info(t('subagent.interrupted'))
    }
  }
}
