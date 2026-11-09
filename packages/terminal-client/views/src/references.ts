/**
 * References: what `Tab` offers after an `@` in the message and the text it
 * puts in place of the typed token.
 * @module @deepseek-ai/dsh-terminal-views/references
 */
import { formatFileMention } from '@deepseek-ai/dsh-file-reference/grammar'
import type { ActiveAtToken } from '@deepseek-ai/dsh-file-reference/grammar'
import { t } from './copy.ts'
import type { PickerItem } from './picker.ts'
import { oneLine } from './lines.ts'

/** A file or directory that `@` can name. */
export interface FileCandidate {
  /** Path relative to the session directory. */
  readonly path: string
  readonly kind: 'file' | 'directory'
}

/** A session that `@` can name. */
export interface SessionCandidate {
  readonly label: string
  readonly displayTitle?: string | undefined
  /** The text that goes into the message to name the session. */
  readonly mention: string
}

/** What choosing a reference puts into the message. */
export interface Reference {
  /** The text that replaces the typed token. */
  readonly text: string
  /** Whether the reference is complete; a directory stays open so the next level can be completed. */
  readonly closed: boolean
}

const SESSION_PREFIX = 'session:'

/**
 * Items for the reference list.
 * @param files - files and directories that match.
 * @param sessions - sessions that match.
 * @returns directories first, then files, then sessions; a value encodes which kind it is.
 */
export function referenceItems(files: readonly FileCandidate[], sessions: readonly SessionCandidate[]): PickerItem[] {
  const ordered = [...files.filter(f => f.kind === 'directory'), ...files.filter(f => f.kind === 'file')]
  return [
    ...ordered.map(file => ({
      value: `${file.kind}:${file.path}`,
      label: file.kind === 'directory' ? `${file.path}/` : file.path,
      detail: t(file.kind === 'directory' ? 'reference.directory' : 'reference.file'),
    })),
    ...sessions.map(session => ({
      value: `${SESSION_PREFIX}${session.mention}`,
      label: oneLine(session.displayTitle ?? session.label, 60),
      detail: t('reference.session'),
    })),
  ]
}

/**
 * The text a chosen item puts into the message.
 * @param value - the `value` of the chosen item.
 * @param token - the `@` token the person typed.
 * @returns the replacement, or undefined when the path cannot be written as a reference.
 */
export function referenceFor(value: string, token: ActiveAtToken): Reference | undefined {
  if (value.startsWith(SESSION_PREFIX)) return { text: value.slice(SESSION_PREFIX.length), closed: true }
  const kind = value.startsWith('directory:') ? 'directory' : 'file'
  const path = value.slice(value.indexOf(':') + 1)
  const text = formatFileMention({ path, kind }, token.quoted)
  return text === undefined ? undefined : { text, closed: kind === 'file' }
}
