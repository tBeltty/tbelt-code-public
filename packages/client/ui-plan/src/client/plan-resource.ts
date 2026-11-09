/** Read immutable plan arguments and their episode versions from a Session history page and earlier pages. */
import type { Context } from '@deepseek-ai/cordis'
import type { ResourceProvider } from '@deepseek-ai/dsh-client-resources/client'
import { RemoteError, remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { loggedPlan, parsePlanAddress, submittedPlan, type LoggedPlan } from './plan.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The resource URL does not identify a plan invocation. */
    'plan/invalid-address': Record<string, never>
    /** The Session has no readable plan for this invocation. */
    'plan/not-found': Record<string, never>
    /** The Session history read failed. */
    'plan/read-failed': Record<string, never>
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap {
    /** Immutable Markdown from a logged exit_plan_mode invocation, with the versions of its plan-mode episode. */
    plan: LoggedPlan
  }
}

/** Whether the events already hold the invocation's plan and the `plan/mode` activation before it. */
function episodeStart(events: readonly { readonly type: string; readonly data: unknown }[], callId: string): boolean {
  const index = events.findIndex(event => submittedPlan(event)?.callId === callId)
  return index > 0 && events.slice(0, index).some(event => event.type === 'plan/mode'
    && typeof event.data === 'object' && event.data !== null && (event.data as { active?: unknown }).active === true)
}

/**
 * Bind plan reads to the generated Session Remote face.
 * A plan is a logged tool-call argument, so the provider reads one page at the current log
 * end and pages backwards from its cut. It neither activates nor subscribes.
 * Remote failures are reported as resource failure frames with their original codes.
 * @param remote - Existing Session history API.
 * @returns a provider that reads history pages back to the invocation's episode start and yields the invocation with its episode versions.
 */
export function planResourceProvider(remote: Pick<Context['remote']['session'], 'events' | 'page'>): ResourceProvider<'plan'> {
  return {
    protocol: 'plan',
    async *open(address, { signal }): AsyncIterable<RemoteResult<LoggedPlan>> {
      const aborted = (): boolean => signal.aborted
      if (aborted()) return
      const target = parsePlanAddress(address)
      if (target === undefined) {
        yield { ok: false, error: new RemoteError('plan/invalid-address', 'Invalid plan resource address.', {}) }
        return
      }
      const sessionAddress = target.session
      try {
        // One page fixes the cut the later pages page back from.
        const first = await remote.events({ address: sessionAddress }, signal)
        if (aborted()) return
        if (!first.ok) { yield { ok: false, error: first.error }; return }
        const throughSeq = first.value.cursor
        let page = { records: first.value.records, hasMore: first.value.hasMore }
        let events = page.records.map(entry => entry.event)
        while (true) {
          const beforeSeq = page.records[0]?.event.seq
          if (!page.hasMore || beforeSeq === undefined || episodeStart(events, target.callId)) break
          const next = await remote.page({ address: sessionAddress, throughSeq, beforeSeq }, signal)
          if (aborted()) return
          if (!next.ok) { yield next; return }
          page = next.value
          events = [...page.records.map(entry => entry.event), ...events]
        }
        const plan = loggedPlan(events, target.callId)
        if (plan !== undefined) {
          yield { ok: true, value: plan }
          return
        }
        yield { ok: false, error: new RemoteError('plan/not-found', 'The submitted plan was not found in this Session.', {}) }
      } catch (error) {
        if (!aborted()) yield {
          ok: false,
          error: remoteErrorOf(error) ?? new RemoteError('plan/read-failed', error instanceof Error ? error.message : String(error), {}),
        }
      }
    },
  }
}
