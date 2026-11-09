/**
 * Subagents: the rows of the `/subagents` list, read from the parent's catalog projection.
 * @module @deepseek-ai/dsh-terminal-views/subagent
 */
import { t } from './copy.ts'
import type { PickerItem } from './picker.ts'
import { oneLine, recordOf } from './lines.ts'
import { shortSessionId } from './status.ts'

/** How a child session can be used again. */
export type SubagentMode = 'one-shot' | 'continuable' | 'unknown'

/** One direct child of the session on screen. */
export interface SubagentRow {
  readonly id: string
  readonly mode: SubagentMode
  readonly label: string | undefined
}

const MODES: ReadonlySet<string> = new Set<SubagentMode>(['one-shot', 'continuable', 'unknown'])

/**
 * The children of a session.
 * @param catalog - the `subagentCatalog` projection value, which is wire data.
 * @returns one row per entry that has an id and a known mode, in catalog order.
 */
export function subagentRows(catalog: unknown): SubagentRow[] {
  if (!Array.isArray(catalog)) return []
  const rows: SubagentRow[] = []
  for (const entry of catalog as unknown[]) {
    const fields = recordOf(entry)
    const id = fields?.['id']
    const mode = fields?.['mode']
    const label = fields?.['label']
    if (typeof id !== 'string' || typeof mode !== 'string' || !MODES.has(mode)) continue
    rows.push({ id, mode: mode as SubagentMode, label: typeof label === 'string' && label !== '' ? label : undefined })
  }
  return rows
}

/**
 * Rows of the subagent list.
 * @param rows - the children.
 * @returns one item per child, named by its label or short id, with its mode as detail.
 */
export function subagentItems(rows: readonly SubagentRow[]): PickerItem[] {
  return rows.map(row => ({
    value: row.id,
    label: row.label === undefined ? shortSessionId(row.id) : oneLine(row.label),
    detail: t(`subagent.mode.${row.mode}`),
  }))
}
