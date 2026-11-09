/** Declarative preset configuration and YAML validation. */
import type { EntryOptions, JsExpr } from '@deepseek-ai/cordis-plugin-loader'

/** LLM route a child Agent of one preset runs on unless a delegation names another. */
export interface PresetAgentRoute {
  /** Registered LLM provider id. */
  readonly provider: string
  /** Provider-owned model id. */
  readonly model: string
  /** Adapter-owned reasoning effort; omitted lets the adapter choose its default. */
  readonly reasoningEffort?: string
}

/** Identity, display fields and child Cordis plugins of one preset. */
export interface PresetDefinition {
  readonly id: string
  readonly name?: string
  readonly description?: string
  readonly order?: number
  /** Route for children that run this preset; omitted when the delegation tool's own route applies. */
  readonly agentRoute?: PresetAgentRoute
  /** Skill names children of this preset may see; omitted leaves every skill visible. */
  readonly skills?: readonly string[]
  /** Children run one task: they accept no follow-up input and are not resumed after completion. */
  readonly oneShot?: boolean
  /** Where the definition came from; `agent-file` presets are offered to delegation tools automatically. */
  readonly origin?: 'agent-file'
  readonly plugins: readonly (Omit<EntryOptions, 'id' | 'disabled'> & { id?: string; disabled?: EntryOptions['disabled'] | JsExpr })[]
}

/** Validate a parsed Cordis entry list, including nested groups.
 * @param rows Parsed YAML value.
 * @param at Diagnostic prefix.
 * @returns The first invalid row, or undefined.
 */
export function entryListProblem(rows: unknown, at = ''): string | undefined {
  if (!Array.isArray(rows)) {
    return at === ''
      ? 'the composition must be a top-level list of plugin rows'
      : `group ${at} must hold a list of plugin rows`
  }
  for (const [index, row] of rows.entries()) {
    const label = at === '' ? `row ${String(index + 1)}` : `${at} row ${String(index + 1)}`
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      return `${label} is not a plugin row (expected a map with a "name")`
    }
    const { name, group, config } = row as { name?: unknown; group?: unknown; config?: unknown }
    if (typeof name !== 'string' || name === '') {
      return `${label} names no plugin (a "name" string is required)`
    }
    if (group === true) {
      const nested = entryListProblem(config, label)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}
