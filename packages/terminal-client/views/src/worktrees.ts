/**
 * Git worktrees: the rows of the `/worktrees` list and the state of one worktree.
 * @module @deepseek-ai/dsh-terminal-views/worktrees
 */
import { abbreviateHomePath } from '@deepseek-ai/dsh-util-workspace-path'
import { t } from './copy.ts'
import type { Style } from './ansi.ts'
import type { PickerItem } from './picker.ts'

/** One worktree of a repository. */
export interface WorktreeRow {
  readonly path: string
  readonly branch?: string | undefined
  readonly isPrimary: boolean
  readonly locked: boolean
  readonly prunable: boolean
}

/** Marker value of the row that creates a worktree. */
export const WORKTREE_CREATE = 'create'

/**
 * Rows of the worktree list.
 * @param rows - the worktrees of the repository.
 * @param home - account home, so paths show as `~/…`.
 * @returns a row that creates a worktree, then one item per worktree with its flags and directory as detail.
 */
export function worktreeItems(rows: readonly WorktreeRow[], home: string | undefined): PickerItem[] {
  return [
    { value: WORKTREE_CREATE, label: t('worktrees.create') },
    ...rows.map(row => ({
      value: row.path,
      label: row.branch ?? t('worktrees.detached'),
      detail: [
        ...row.isPrimary ? [t('worktrees.primary')] : [],
        ...row.locked ? [t('worktrees.locked')] : [],
        ...row.prunable ? [t('worktrees.prunable')] : [],
        abbreviateHomePath(row.path, home),
      ].join(' · '),
    })),
  ]
}

/**
 * The state of one worktree.
 * @param style - text styles.
 * @param inspected - what the Host reports about the worktree.
 * @returns lines to print: whether it is linked, its branch, and the files with uncommitted changes.
 */
export function worktreeLines(
  style: Style,
  inspected: { readonly linked: boolean; readonly branch?: string | undefined; readonly uncommitted: readonly string[] },
): string[] {
  return [
    inspected.branch === undefined ? style.dim(t('worktrees.detached')) : style.bold(inspected.branch),
    style.dim(t(inspected.linked ? 'worktrees.linked' : 'worktrees.notLinked')),
    ...inspected.uncommitted.length === 0
      ? [style.dim(t('worktrees.clean'))]
      : [style.yellow(t('worktrees.uncommitted', { count: inspected.uncommitted.length })), ...inspected.uncommitted.map(path => `  ${path}`)],
  ]
}
