/**
 * Spend budget (`ctx.spendBudget`): a local spend ledger priced from
 * provider-reported token usage and each route's published list price, plus
 * a guard that refuses the next model step once a Session limit or the
 * monthly limit is reached.
 *
 * Accounting follows every committed `assistant/message` and
 * `assistant/attempt` event on the host's `session/event` feed. Each one is one
 * model request; its usage is priced with `ctx.llm.resolveModelInfo()` and
 * added to the event's UTC month and to its budget Session, the top Session of
 * its subagent lineage. A route without a known price adds nothing and counts
 * one unpriced call. Writes run on one serial chain, so concurrent Sessions
 * never lose an update.
 *
 * The guard is an `agent/pre-step` listener. It waits for pending accounting,
 * then throws an `LlmError` with code {@link SPEND_LIMIT_CODE} when a limit is
 * reached; the agent loop records that failure on the turn's `turn/end`
 * reason, which the Web chat shows as its failed-turn line.
 * @module @deepseek-ai/dsh-spend-budget
 */

import { Context, Service, type Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-agent'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { LlmModelPricing, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-settings'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { settlementUsage, usageCostUsd, utcMonthOf } from './cost.ts'
import { findBreaches, SPEND_LIMIT_CODE, spendLimitMessage } from './limits.ts'
import { spendDomainSpec } from './spec.ts'
import type { MonthSpendRecord, SessionSpendRecord } from './spec.ts'
import type { SpendMonth, SpendScopeSummary, SpendSummary } from './types.ts'

export type * from './types.ts'
export { monthSpendRecord, sessionSpendRecord, spendDomainSpec } from './spec.ts'
export type { MonthSpendRecord, SessionSpendRecord } from './spec.ts'
export { formatUsd, settlementUsage, usageCostUsd, utcMonthOf } from './cost.ts'
export { findBreaches, SPEND_LIMIT_CODE, spendLimitMessage } from './limits.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    spendBudget: SpendBudget
  }
}

/** Plugin config. */
export interface Config {
  /** Monthly spend limit in US dollars across every Session; absent means no monthly limit. A user-editable setting. */
  monthlyLimitUsd: Volatile<number | undefined>
}

/** Route that served one model request. */
interface Route {
  readonly provider: string
  readonly model: string
}

const EMPTY_MONTH: MonthSpendRecord = { spentUsd: 0, unpricedCalls: 0 }
const EMPTY_SESSION: SessionSpendRecord = { spentUsd: 0, unpricedCalls: 0 }

/** Project one stored record and its limit onto the public summary fields. */
function scopeSummary(record: MonthSpendRecord, limitUsd: number | undefined): SpendScopeSummary {
  return {
    spentUsd: record.spentUsd,
    unpricedCalls: record.unpricedCalls,
    ...limitUsd === undefined ? {} : { limitUsd },
  }
}

/**
 * Validate one limit value at the service interface.
 * @throws RangeError when the value is not a finite non-negative number.
 */
function assertLimit(limitUsd: number | undefined): void {
  if (limitUsd !== undefined && (!Number.isFinite(limitUsd) || limitUsd < 0)) {
    throw new RangeError(`spend limit must be a finite number of US dollars at or above 0, got ${String(limitUsd)}`)
  }
}

/**
 * Owns the `spend_budget` storage domain, records spend from committed model
 * requests, and refuses model steps past a reached limit.
 */
export default class SpendBudget extends Service {
  static Config = z.object({
    monthlyLimitUsd: z.number().min(0).volatile(),
  })

  static inject = ['storageDomain', 'llm', 'sessions']

  private months?: KvTable<SpendMonth, MonthSpendRecord>
  private sessionRecords?: KvTable<SessionId, SessionSpendRecord>
  /** Tail of the serial ledger write chain. */
  private writes: Promise<void> = Promise.resolve()
  /** Accounting jobs started by `session/event` and not yet settled. */
  private readonly pending = new Set<Promise<void>>()
  /** Aborted at disposal so an in-flight price lookup stops. */
  private readonly lifetime = new AbortController()
  /** Profile entry id that Settings addresses; absent when mounted without the Loader. */
  private readonly entryId: string | undefined

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'spendBudget')
    this.entryId = ctx.fiber.entry?.options.id
  }

  /**
   * Open the domain, then register accounting and the guard. Effects unwind
   * in reverse: the listeners stop first, then pending accounting drains and
   * the domain closes.
   */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(spendDomainSpec)
    this.months = domain.table('months')
    this.sessionRecords = domain.table('sessions')
    this.ctx.effect(() => async () => {
      this.lifetime.abort(new Error('spend budget disposed'))
      await this.whenSettled()
      await domain.close()
    }, 'spendBudget.domainClose')
    this.ctx.on('session/event', (session, event) => { this.observe(session, event) })
    this.ctx.on('agent/pre-step', async (payload, next) => {
      await this.enforce(payload.agent.session.id)
      return next()
    })
  }

  /**
   * Spend and limits for one Session and the current UTC month. Reflects
   * settled accounting; call {@link whenSettled} first to include requests
   * whose pricing is still in flight.
   * @param session - any Session; a subagent Session reports its top Session's record.
   * @returns the budget Session's figures and the current month's figures.
   */
  summary(session: SessionId): SpendSummary {
    const budgetSession = this.budgetSessionOf(session)
    const month = utcMonthOf(Date.now())
    const sessionRecord = this.requireSessions().get(budgetSession) ?? EMPTY_SESSION
    const monthRecord = this.requireMonths().get(month) ?? EMPTY_MONTH
    return {
      budgetSession,
      session: scopeSummary(sessionRecord, sessionRecord.limitUsd),
      month,
      monthly: scopeSummary(monthRecord, this.config.monthlyLimitUsd.get()),
    }
  }

  /**
   * Set or clear the spend limit of a Session's budget Session.
   * @param session - any Session; a subagent Session sets its top Session's limit.
   * @param limitUsd - limit in US dollars, or `undefined` to remove the limit.
   * @returns after the limit is durably stored.
   * @throws RangeError when `limitUsd` is not a finite number at or above 0.
   */
  async setSessionLimit(session: SessionId, limitUsd: number | undefined): Promise<void> {
    assertLimit(limitUsd)
    const budgetSession = this.budgetSessionOf(session)
    await this.serialize(async () => {
      const table = this.requireSessions()
      const { limitUsd: _previous, ...current } = table.get(budgetSession) ?? EMPTY_SESSION
      await table.put(budgetSession, limitUsd === undefined ? current : { ...current, limitUsd })
    })
  }

  /**
   * Set or clear the monthly limit through Settings, persisting it in this
   * plugin's profile entry and updating the live `monthlyLimitUsd` value.
   * @param limitUsd - limit in US dollars, or `undefined` to remove the limit.
   * @returns after the profile write and its live update.
   * @throws RangeError when `limitUsd` is not a finite number at or above 0.
   * @throws Error when no Settings service is mounted or the plugin has no profile entry, or when Settings refuses the write.
   */
  async setMonthlyLimit(limitUsd: number | undefined): Promise<void> {
    assertLimit(limitUsd)
    const settings = this.ctx.get('settings')
    if (settings === undefined || this.entryId === undefined) {
      throw new Error('the monthly spend limit is not editable here: no settings service or profile entry; set monthlyLimitUsd in the configuration')
    }
    await (limitUsd === undefined
      ? settings.mutate(this.entryId, [{ op: 'unset', path: ['monthlyLimitUsd'] }])
      : settings.update(this.entryId, { monthlyLimitUsd: limitUsd }))
  }

  /**
   * Wait until every accounting job started so far has settled, including
   * jobs started while waiting.
   * @returns once no accounting job is pending.
   */
  async whenSettled(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending])
  }

  /** Refuse the next model step when a limit of its budget Session or the month is reached. */
  private async enforce(session: SessionId): Promise<void> {
    await this.whenSettled()
    const summary = this.summary(session)
    const breaches = findBreaches(summary.session, summary.monthly)
    if (breaches.length > 0) throw new LlmError(spendLimitMessage(breaches), SPEND_LIMIT_CODE)
  }

  /** Start accounting for one committed event when it settles a model request with usage. */
  private observe(session: Session, event: SessionEvent): void {
    const usage = settlementUsage(event)
    if (usage === undefined) return
    const route: Route | undefined = event.type === 'assistant/message'
      ? event.data.message.source
      : session.requestContext()
    const job = this.record(this.budgetSessionOf(session.id), utcMonthOf(event.time), usage, route)
      .catch((error: unknown) => {
        this.ctx.logger.warn('spend-budget: could not record spend for session %s: %s', session.id, error instanceof Error ? error.message : String(error))
      })
    this.pending.add(job)
    void job.finally(() => { this.pending.delete(job) })
  }

  /** Price one request and add it to its month and budget Session. */
  private async record(budgetSession: SessionId, month: SpendMonth, usage: TokenUsage, route: Route | undefined): Promise<void> {
    const pricing = route === undefined ? undefined : await this.pricingOf(route)
    const costUsd = pricing === undefined ? 0 : usageCostUsd(usage, pricing)
    const unpriced = pricing === undefined ? 1 : 0
    const add = <R extends MonthSpendRecord>(record: R): R => ({
      ...record,
      spentUsd: record.spentUsd + costUsd,
      unpricedCalls: record.unpricedCalls + unpriced,
    })
    await this.serialize(async () => {
      const months = this.requireMonths()
      const sessions = this.requireSessions()
      // Both writes enter the domain's write queue in one synchronous step, so
      // a domain close that drains the queue drains both.
      await Promise.all([
        months.put(month, add(months.get(month) ?? EMPTY_MONTH)),
        sessions.put(budgetSession, add(sessions.get(budgetSession) ?? EMPTY_SESSION)),
      ])
    })
  }

  /** The route's list price, or `undefined` when the adapter publishes none or the route no longer resolves. */
  private async pricingOf(route: Route): Promise<LlmModelPricing | undefined> {
    try {
      return (await this.ctx.llm.resolveModelInfo(route.provider, route.model, this.lifetime.signal)).pricing
    } catch (error: unknown) {
      this.ctx.logger.debug('spend-budget: no price for %s/%s: %s', route.provider, route.model, error instanceof Error ? error.message : String(error))
      return undefined
    }
  }

  /** Run one read-modify-write after every earlier one has settled. */
  private serialize(job: () => Promise<void>): Promise<void> {
    const run = this.writes.then(job)
    // The caller of `run` observes its failure; the chain only orders later jobs.
    this.writes = run.catch((_failure: unknown) => undefined)
    return run
  }

  /**
   * The Session whose record holds a Session's spend and limit: the top
   * Session of its subagent lineage, as far as live Session headers reach.
   */
  private budgetSessionOf(id: SessionId): SessionId {
    let current = id
    const visited = new Set<SessionId>()
    while (!visited.has(current)) {
      visited.add(current)
      const header = this.ctx.sessions.get(current)?.header
      if (header?.origin !== 'subagent' || header.parentSession === undefined) return current
      current = header.parentSession
    }
    return current
  }

  private requireMonths(): KvTable<SpendMonth, MonthSpendRecord> {
    if (this.months === undefined) throw new Error('spendBudget: ledger read before the domain finished opening')
    return this.months
  }

  private requireSessions(): KvTable<SessionId, SessionSpendRecord> {
    if (this.sessionRecords === undefined) throw new Error('spendBudget: ledger read before the domain finished opening')
    return this.sessionRecords
  }
}
