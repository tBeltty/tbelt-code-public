/**
 * The `/schedule` panel: scheduled follow-ups. Choosing one shows when it ran
 * or changes its title, message or timing; a follow-up can also be deleted.
 * @module @deepseek-ai/dsh-terminal-client/panels/schedule
 */
import { deliveryLines, parseTiming, scheduleItems, t } from '@deepseek-ai/dsh-terminal-views'
import type { PickerItem, TimingKind } from '@deepseek-ai/dsh-terminal-views'
import { confirm, remoteDone, remoteValue } from '../config/ui.ts'
import type { FlowUi } from '../config/ui.ts'
import type { ScheduleEntryPort, ScheduleTimingPort } from '../panel-ports.ts'
import type { PanelContext } from './context.ts'

/** Most deliveries listed for one follow-up. */
const HISTORY_LIMIT = 20

/** How a person is asked for each timing. */
const TIMING_ASKS: Readonly<Record<TimingKind, 'schedule.askAt' | 'schedule.askEvery' | 'schedule.askDaily' | 'schedule.askCron'>> = {
  at: 'schedule.askAt', every: 'schedule.askEvery', daily: 'schedule.askDaily', cron: 'schedule.askCron',
}

/** What a change to a follow-up asks the Host to replace. */
type Change = { readonly title: string } | { readonly prompt: string } | { readonly change: ScheduleTimingPort }

/**
 * Change one follow-up and say how it went.
 * @param ctx - the session and the Remote namespaces.
 * @param ui - where messages go.
 * @param entry - the follow-up as listed, which the Host compares with its own copy.
 * @param change - the field to replace.
 * @returns settles when the outcome was printed.
 */
async function update(ctx: PanelContext, ui: FlowUi, entry: ScheduleEntryPort, change: Change): Promise<void> {
  const result = await remoteValue(
    ui,
    message => t('schedule.failed', { message }),
    () => ctx.remote.schedule.update({ sessionId: entry.sessionId, id: entry.id, expected: entry, ...change }),
  )
  if (result === undefined) return
  if ('code' in result) ui.warn(t('schedule.conflict'))
  else ui.info(t(result.updated ? 'schedule.updated' : 'schedule.conflict'))
}

/**
 * Run the `/schedule` panel once.
 * @param ctx - the session and the Remote namespaces.
 * @param ui - where questions and messages go.
 * @returns settles when the person finished or left the panel.
 */
export async function runSchedule(ctx: PanelContext, ui: FlowUi): Promise<void> {
  const entries = await remoteValue(ui, message => t('schedule.listFailed', { message }), () => ctx.remote.schedule.catalog())
  if (entries === undefined) return
  if (entries.length === 0) {
    ui.info(t('schedule.empty'))
    return
  }
  const picked = await ui.pick(t('schedule.title'), scheduleItems(entries, ctx.now()))
  const entry = entries.find(candidate => candidate.id === picked?.value)
  if (entry === undefined) return
  const actions: PickerItem[] = ['history', 'title', 'prompt', 'timing', 'delete'].map(action => ({
    value: action, label: t(`schedule.action.${action as 'history'}`),
  }))
  const action = await ui.pick(entry.title, actions)
  if (action?.value === 'history') {
    const history = await remoteValue(
      ui,
      message => t('schedule.failed', { message }),
      () => ctx.remote.schedule.history({ sessionId: entry.sessionId, id: entry.id, limit: HISTORY_LIMIT }),
    )
    if (history === undefined) return
    if ('code' in history) ui.warn(t('schedule.conflict'))
    else ui.show(deliveryLines(ctx.style, history.records))
  } else if (action?.value === 'title') {
    const title = await ui.ask(t('schedule.askTitle'), { initial: entry.title })
    if (title !== undefined && title !== '') await update(ctx, ui, entry, { title })
  } else if (action?.value === 'prompt') {
    const prompt = await ui.ask(t('schedule.askPrompt'), { initial: entry.prompt })
    if (prompt !== undefined && prompt !== '') await update(ctx, ui, entry, { prompt })
  } else if (action?.value === 'timing') {
    await changeTiming(ctx, ui, entry)
  } else if (action?.value === 'delete') {
    if (!await confirm(ui, t('schedule.deleteAsk', { title: entry.title }), t('schedule.deleteYes'))) return
    const deleted = await remoteDone(
      ui,
      message => t('schedule.failed', { message }),
      () => ctx.remote.schedule.delete({ sessionId: entry.sessionId, id: entry.id }),
    )
    if (deleted) ui.info(t('schedule.deleted'))
  }
}

/** Ask for a new timing and apply it. */
async function changeTiming(ctx: PanelContext, ui: FlowUi, entry: ScheduleEntryPort): Promise<void> {
  const kinds: TimingKind[] = ['at', 'every', 'daily', 'cron']
  const kind = await ui.pick(t('schedule.action.timing'), kinds.map(value => ({ value, label: t(`schedule.timing.${value}`) })))
  if (kind === undefined) return
  const timing = kind.value as TimingKind
  const typed = await ui.ask(t(TIMING_ASKS[timing]))
  if (typed === undefined || typed === '') return
  const parsed = parseTiming(timing, typed, ctx.timeZone)
  if (!parsed.ok) {
    ui.warn(parsed.problem)
    return
  }
  await update(ctx, ui, entry, { change: parsed.change })
}
