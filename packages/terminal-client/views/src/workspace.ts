/**
 * Workspaces and sessions: the rows of the `/workspaces` and `/organize` lists.
 * @module @deepseek-ai/dsh-terminal-views/workspace
 */
import { abbreviateHomePath } from '@deepseek-ai/dsh-util-workspace-path'
import { t } from './copy.ts'
import type { PickerItem } from './picker.ts'
import { oneLine } from './lines.ts'

/** One workspace as the registry lists it. */
export interface WorkspaceRow {
  readonly workspaceId: string
  readonly path: string
  readonly title: string
  readonly sessionIds: readonly string[]
}

/**
 * Rows of the workspace list.
 * @param rows - the registered workspaces.
 * @param home - account home, so paths show as `~/…`.
 * @returns one item per workspace, with its directory and session count as detail.
 */
export function workspaceItems(rows: readonly WorkspaceRow[], home: string | undefined): PickerItem[] {
  return rows.map(row => ({
    value: row.workspaceId,
    label: oneLine(row.title),
    detail: `${abbreviateHomePath(row.path, home)} · ${t('workspace.sessions', { count: row.sessionIds.length })}`,
  }))
}

/** The ways a session can be filed. */
export type OrganizeAction = 'archive' | 'unarchive' | 'pin' | 'unpin'

/**
 * The actions open for a session.
 * @param archived - whether the session is archived.
 * @param pinned - whether the session is pinned.
 * @returns archive or unarchive, and pin or unpin.
 */
export function organizeItems(archived: boolean, pinned: boolean): PickerItem[] {
  const actions: OrganizeAction[] = [archived ? 'unarchive' : 'archive', pinned ? 'unpin' : 'pin']
  return actions.map(action => ({ value: action, label: t(`organize.${action}`) }))
}
