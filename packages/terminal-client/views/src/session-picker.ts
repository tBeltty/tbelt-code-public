/**
 * Session picker rows: the stored sessions the person can switch to, newest first.
 * @module @deepseek-ai/dsh-terminal-views/session-picker
 */
import { abbreviateHomePath } from '@deepseek-ai/dsh-util-workspace-path'
import { t } from './copy.ts'
import type { PickerItem } from './picker.ts'
import { shortSessionId } from './status.ts'

/** The fields of a catalog row the session picker reads. */
export interface SessionChoice {
  readonly id: string
  readonly title?: string | undefined
  readonly cwd?: string | undefined
  readonly origin?: 'subagent' | undefined
  readonly blank: boolean
  readonly updatedAt: number
}

/** Facts that change how session rows read. */
export interface SessionChoiceContext {
  /** The session now open; it is marked and listed even when blank. */
  readonly currentId: string
  readonly home?: string | undefined
  /** Clock reading for the relative age. */
  readonly now: number
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Age of a timestamp in words.
 * @param then - epoch milliseconds.
 * @param now - epoch milliseconds.
 * @returns text such as `just now`, `5m ago`, `3h ago` or `2d ago`.
 */
export function ageText(then: number, now: number): string {
  const elapsed = Math.max(0, now - then)
  if (elapsed < MINUTE) return t('age.now')
  if (elapsed < HOUR) return t('age.minutes', { count: Math.floor(elapsed / MINUTE) })
  if (elapsed < DAY) return t('age.hours', { count: Math.floor(elapsed / HOUR) })
  return t('age.days', { count: Math.floor(elapsed / DAY) })
}

/**
 * Rows of the session picker.
 * @param catalog - the sessions the Host lists.
 * @param context - the open session, the home directory and the clock.
 * @returns newest first, without subagent sessions or empty ones other than the open session.
 */
export function sessionItems(catalog: readonly SessionChoice[], context: SessionChoiceContext): PickerItem[] {
  return catalog
    .filter(row => row.origin !== 'subagent' && (!row.blank || row.id === context.currentId))
    .toSorted((a, b) => b.updatedAt - a.updatedAt)
    .map((row) => {
      const title = row.title?.trim() ?? ''
      const detail = [
        shortSessionId(row.id),
        ...row.cwd === undefined ? [] : [abbreviateHomePath(row.cwd, context.home)],
        ageText(row.updatedAt, context.now),
      ].join(' · ')
      return {
        value: row.id,
        label: title === '' ? t('picker.untitled') : title,
        detail,
        current: row.id === context.currentId,
      }
    })
}
