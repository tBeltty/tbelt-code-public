/**
 * Status lines: the banner printed when a session opens and the line shown
 * while a turn runs.
 * @module @deepseek-ai/dsh-terminal-views/status
 */
import { abbreviateHomePath } from '@deepseek-ai/dsh-util-workspace-path'
import { t } from './copy.ts'
import type { Style } from './ansi.ts'

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
