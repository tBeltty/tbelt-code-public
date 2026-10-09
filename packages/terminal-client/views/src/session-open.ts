/**
 * Session choice at start: a new session, a named one, or the latest in the
 * working directory.
 * @module @deepseek-ai/dsh-terminal-views/session-open
 */
import { t } from './copy.ts'
import { shortSessionId } from './status.ts'

/** The fields of a catalog row this choice reads. */
export interface OpenCandidate {
  readonly id: string
  readonly cwd?: string | undefined
  /** Subagent sessions belong to a parent and are never resumed directly. */
  readonly origin?: 'subagent' | undefined
  /** A session that holds no messages yet. */
  readonly blank: boolean
  readonly updatedAt: number
}

/** What the command line asked for. */
export interface OpenRequest {
  /** Session id or unique id prefix from `--resume`. */
  readonly resume?: string | undefined
  /** `--continue`: the latest session in the working directory. */
  readonly continueLatest: boolean
  /** The working directory the session must belong to for `--continue`. */
  readonly cwd: string
}

/** The session to open. */
export type OpenChoice =
  | { readonly kind: 'new' }
  | { readonly kind: 'resume'; readonly sessionId: string }
  | { readonly kind: 'error'; readonly message: string }

/**
 * Choose the session to open.
 * @param request - the command-line choice.
 * @param catalog - the sessions the Host lists.
 * @returns a new session, an existing one, or the reason none matches.
 */
export function chooseSession(request: OpenRequest, catalog: readonly OpenCandidate[]): OpenChoice {
  const openable = catalog.filter(row => row.origin !== 'subagent')
  if (request.resume !== undefined) {
    const id = request.resume
    if (id === '') return { kind: 'error', message: t('open.noMatch', { id }) }
    const exact = openable.find(row => row.id === id)
    if (exact !== undefined) return { kind: 'resume', sessionId: exact.id }
    const matches = openable.filter(row => row.id.startsWith(id) || row.id.startsWith(`session-${id}`))
    if (matches.length === 1) return { kind: 'resume', sessionId: (matches[0] as OpenCandidate).id }
    if (matches.length === 0) return { kind: 'error', message: t('open.noMatch', { id }) }
    return { kind: 'error', message: t('open.ambiguous', { id, candidates: matches.map(row => shortSessionId(row.id)).join(', ') }) }
  }
  if (!request.continueLatest) return { kind: 'new' }
  const latest = openable
    .filter(row => row.cwd === request.cwd && !row.blank)
    .reduce<OpenCandidate | undefined>((best, row) => (best === undefined || row.updatedAt > best.updatedAt ? row : best), undefined)
  return latest === undefined
    ? { kind: 'error', message: t('open.noContinue', { cwd: request.cwd }) }
    : { kind: 'resume', sessionId: latest.id }
}
