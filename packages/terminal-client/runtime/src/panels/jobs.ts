/**
 * The `/jobs` panel: background jobs this session can see. Choosing one shows
 * its output or asks it to stop.
 * @module @deepseek-ai/dsh-terminal-client/panels/jobs
 */
import { jobIsLive, jobItems, jobOutputLines, t } from '@deepseek-ai/dsh-terminal-views'
import type { PickerItem } from '@deepseek-ai/dsh-terminal-views'
import { remoteValue } from '../config/ui.ts'
import type { FlowUi } from '../config/ui.ts'
import type { JobsPort, ObservedJobPort } from '../panel-ports.ts'
import type { PanelContext } from './context.ts'

/** Most output lines shown for one job. */
const OUTPUT_LINES = 40

/** Longest wait for the first output of a job, in milliseconds. */
const FIRST_OUTPUT_MS = 2000

/**
 * Wait until a job's observation has output, has ended, or has failed.
 * @param state - the client jobs state.
 * @param id - the observed job.
 * @returns the observation, or what exists of it once the wait runs out.
 */
function firstOutput(state: JobsPort['state'], id: string): Promise<ObservedJobPort | undefined> {
  const ready = (): ObservedJobPort | undefined => {
    const observed = state.getSnapshot().observed[id]
    return observed !== undefined && (observed.text !== '' || !observed.streaming || observed.error !== undefined) ? observed : undefined
  }
  return new Promise((resolve) => {
    const now = ready()
    if (now !== undefined) {
      resolve(now)
      return
    }
    const finish = (value: ObservedJobPort | undefined): void => {
      clearTimeout(timer)
      stop()
      resolve(value)
    }
    const timer = setTimeout(() => { finish(state.getSnapshot().observed[id]) }, FIRST_OUTPUT_MS)
    const stop = state.subscribe(() => {
      const observed = ready()
      if (observed !== undefined) finish(observed)
    })
  })
}

/**
 * Run the `/jobs` panel once.
 * @param ctx - the session and the client services.
 * @param ui - where questions and messages go.
 * @returns settles when the person finished or left the panel.
 */
export async function runJobs(ctx: PanelContext, ui: FlowUi): Promise<void> {
  const { jobs } = ctx.services
  const { sessionId } = ctx.session
  const rows = jobs.state.getSnapshot().rows[sessionId] ?? []
  if (rows.length === 0) {
    ui.info(t('jobs.empty'))
    return
  }
  const picked = await ui.pick(t('jobs.title'), jobItems(rows, ctx.now()))
  const row = rows.find(candidate => candidate.id === picked?.value)
  if (picked === undefined || row === undefined) return
  const actions: PickerItem[] = [
    { value: 'output', label: t('jobs.action.output') },
    ...jobIsLive(row) ? [{ value: 'kill', label: t('jobs.action.kill') }] : [],
  ]
  const action = await ui.pick(picked.label, actions)
  if (action?.value === 'output') {
    const unobserve = jobs.observe(sessionId, row.id)
    try {
      ui.show(jobOutputLines(ctx.style, await firstOutput(jobs.state, row.id), OUTPUT_LINES))
    } finally {
      unobserve()
    }
  } else if (action?.value === 'kill') {
    const killed = await remoteValue(ui, message => t('jobs.killFailed', { message }), () => jobs.kill(sessionId, row.id))
    if (killed !== undefined) ui.info(t(killed.outcome === 'requested' ? 'jobs.killRequested' : 'jobs.alreadyFinished'))
  }
}
