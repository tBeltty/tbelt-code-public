/**
 * Status lines: the banner printed when a session opens and the line shown
 * while a turn runs.
 * @module @deepseek-ai/dsh-terminal-views/status
 */
import { abbreviateHomePath } from '@deepseek-ai/dsh-util-workspace-path'
import { t } from './copy.ts'
import type { Style } from './ansi.ts'
import { durationText, numberField, recordOf, stringField } from './lines.ts'
import { statsRow } from './trajectory.ts'

/** Facts shown when a session opens. */
export interface BannerFacts {
  readonly sessionId: string
  readonly cwd: string
  /** Account home, so the working directory shows as `~/…`. */
  readonly home?: string | undefined
  /** Whether an earlier session was reopened. */
  readonly resumed: boolean
}

/** Characters of the session id shown after the `session-` prefix; enough to resume by prefix. */
export const SHORT_ID_LENGTH = 8

const ID_PREFIX = 'session-'

/**
 * The part of a session id a person types to resume it.
 * @param sessionId - a full session id.
 * @returns the first characters after the `session-` prefix.
 */
export function shortSessionId(sessionId: string): string {
  const bare = sessionId.startsWith(ID_PREFIX) ? sessionId.slice(ID_PREFIX.length) : sessionId
  return bare.slice(0, SHORT_ID_LENGTH)
}

/**
 * Banner printed at start.
 * @param style - text styles.
 * @param facts - the session and its directory.
 * @returns lines without trailing newlines.
 */
export function bannerLines(style: Style, facts: BannerFacts): string[] {
  const cwd = abbreviateHomePath(facts.cwd, facts.home)
  const id = shortSessionId(facts.sessionId)
  return [
    style.bold('tBelt Code'),
    style.dim(t(facts.resumed ? 'session.resumed' : 'session.started', { id, cwd })),
    style.dim(t('composer.hint')),
  ]
}

/**
 * Line printed when the terminal client leaves.
 * @param style - text styles.
 * @param sessionId - the session that was open.
 * @returns one line.
 */
export function farewellLine(style: Style, sessionId: string): string {
  return style.dim(t('session.exit', { id: shortSessionId(sessionId) }))
}

/**
 * Line shown in place of the composer while a turn runs.
 * @param style - text styles.
 * @param cancelling - whether a stop was already requested.
 * @returns one line.
 */
export function workingLine(style: Style, cancelling: boolean): string {
  return style.dim(t(cancelling ? 'status.cancelling' : 'status.working'))
}

/** A count of tokens in the largest fitting unit: `950`, `12.4k` or `1.2M`. */
function tokenText(count: number): string {
  if (count < 1000) return String(Math.round(count))
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`
  return `${(count / 1_000_000).toFixed(1)}M`
}

/** The model a session will use next: `provider / model`, with the reasoning effort when one is set. */
function modelText(selection: unknown): string | undefined {
  const fields = recordOf(selection)
  const chosen = recordOf(fields?.['next']) ?? recordOf(fields?.['lastUsed'])
  const model = stringField(chosen, 'model')
  if (model === undefined) return undefined
  const provider = stringField(chosen, 'provider')
  const effort = stringField(chosen, 'reasoningEffort')
  return `${provider === undefined ? '' : `${provider} / `}${model}${effort === undefined ? '' : ` · ${effort}`}`
}

/** What a status report reads besides the projections. */
export interface StatusFacts {
  readonly sessionId: string
  readonly cwd: string
  readonly home: string | undefined
  readonly running: boolean
  /** How many messages wait in the queue. */
  readonly queued: number
}

/**
 * The session's state in words, from the projections the Host computes from the log.
 * @param style - text styles.
 * @param facts - what the terminal knows itself.
 * @param read - the current value of a projection by key; each value is wire data and may be absent.
 * @returns lines to print: identity, directory, activity, model, permissions, plan, goal, queue, turns, tokens and context.
 */
export function statusLines(style: Style, facts: StatusFacts, read: (key: string) => unknown): string[] {
  const title = read('title')
  const model = modelText(read('modelSelection'))
  const permission = stringField(read('permissions'), 'currentValue')
  const plan = recordOf(read('plan'))
  const goal = recordOf(recordOf(read('goal'))?.['goal'])
  const stats = statsRow(read('sessionStats'))
  const usage = recordOf(read('tokenUsage'))
  const pressure = read('contextPressure')
  const cached = (numberField(usage, 'cacheReadTokens') ?? 0) + (numberField(usage, 'cacheWriteTokens') ?? 0)
  const input = (numberField(usage, 'uncachedInputTokens') ?? 0) + cached
  const used = numberField(pressure, 'projectedTokens') ?? numberField(pressure, 'pressureTokens')
  const window = numberField(pressure, 'contextWindow')
  const line = (label: string, value: string | undefined): string[] =>
    value === undefined ? [] : [`${style.dim(label.padEnd(12))}${value}`]
  return [
    style.bold(typeof title === 'string' && title !== '' ? title : t('status.untitled')),
    ...line(t('status.id'), shortSessionId(facts.sessionId)),
    ...line(t('status.directory'), abbreviateHomePath(facts.cwd, facts.home)),
    ...line(t('status.activity'), t(facts.running ? 'status.activityWorking' : 'status.activityIdle')),
    ...line(t('status.model'), model),
    ...line(t('status.permissions'), permission),
    ...line(t('status.plan'), plan === undefined ? undefined : t(plan['active'] === true ? 'status.on' : 'status.off')),
    ...line(t('status.goal'), stringField(goal, 'objective')),
    ...line(t('status.queue'), facts.queued === 0 ? undefined : String(facts.queued)),
    ...line(t('status.turns'), stats === undefined ? undefined : t('status.turnsValue', {
      turns: stats.turns, steps: stats.steps, model: durationText(stats.llmMs), tools: durationText(stats.toolMs),
    })),
    ...line(t('status.tokens'), usage === undefined ? undefined : t('status.tokensValue', {
      input: tokenText(input), cached: tokenText(cached), output: tokenText(numberField(usage, 'outputTokens') ?? 0),
    })),
    ...line(t('status.context'), used === undefined ? undefined
      : window === undefined ? tokenText(used)
        : t('status.contextValue', { used: tokenText(used), window: tokenText(window), percent: Math.round((used / window) * 100) })),
  ]
}
