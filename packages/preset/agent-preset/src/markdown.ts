/**
 * Agent definition files: one Markdown file with YAML front matter registers one preset.
 * @module @deepseek-ai/dsh-agent-preset/markdown
 */
import { readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { load } from 'js-yaml'
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import { RULE_OUTCOMES, validateRuleTable, type PermissionRule, type RuleOutcome } from '@deepseek-ai/dsh-permission-rules'
import type {} from '@deepseek-ai/dsh-permission-rules'

/** Cordis module name of the persona row whose prefix a file body replaces. */
const PERSONA_MODULE = '@deepseek-ai/dsh-persona'

/** Front matter keys an agent file may carry. */
const FRONT_MATTER_KEYS = ['name', 'description', 'order', 'extends', 'permission'] as const

/** Preset ids a file name may produce. */
const AGENT_ID = /^[a-z0-9][a-z0-9-]*$/

/** Plugin configuration. */
export interface Config {
  /** Absolute directories scanned for `*.md` agent files; a directory that does not exist contributes none. */
  dirs: string[]
  /** Preset whose plugins every file extends unless its own `extends` names another. */
  extends?: string
}

/** One parsed agent file. */
export interface AgentFile {
  /** Preset id taken from the file name. */
  readonly id: string
  readonly name?: string
  readonly description?: string
  readonly order?: number
  /** Base preset named by the file, if any. */
  readonly extends?: string
  /** Markdown body; becomes the persona prefix when not empty. */
  readonly prompt: string
  /** `permission` entries as rules scoped to this preset. */
  readonly rules: readonly PermissionRule[]
}

function isMap(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function outcomeOf(value: unknown, at: string): RuleOutcome {
  if (typeof value === 'string' && (RULE_OUTCOMES as readonly string[]).includes(value)) return value as RuleOutcome
  throw new Error(`${at} must be one of ${RULE_OUTCOMES.join(', ')}`)
}

/**
 * Turn a `permission` map into rules scoped to one preset. A tool maps to one outcome
 * or to command patterns with outcomes; `*` as a pattern matches every call of the tool.
 * Later entries override earlier ones, so the rules take descending priorities in file order.
 * @param id Preset the rules apply to.
 * @param permission Parsed `permission` value.
 * @returns Rules in evaluation order.
 * @throws When an entry is malformed or a pattern is invalid.
 */
function permissionRules(id: string, permission: unknown): PermissionRule[] {
  if (!isMap(permission)) throw new Error('permission must be a map of tool names')
  const entries: { tool: string; pattern?: string; outcome: RuleOutcome }[] = []
  for (const [tool, value] of Object.entries(permission)) {
    if (!isMap(value)) {
      entries.push({ tool, outcome: outcomeOf(value, `permission.${tool}`) })
      continue
    }
    for (const [pattern, outcome] of Object.entries(value)) {
      entries.push({ tool, pattern, outcome: outcomeOf(outcome, `permission.${tool}.${pattern}`) })
    }
  }
  const rules = entries.map(({ tool, pattern, outcome }, index): PermissionRule => ({
    priority: entries.length - index,
    match: {
      tool,
      agent: id,
      ...(pattern === undefined || pattern === '*' ? {} : { commandPattern: pattern }),
    },
    outcome,
  }))
  validateRuleTable(rules)
  return rules
}

function optionalString(front: Record<string, unknown>, key: 'name' | 'description' | 'extends'): string | undefined {
  const value = front[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${key} must be a non-empty string`)
  return value
}

/**
 * Parse one agent file.
 * @param id Preset id, normally the file name without `.md`.
 * @param text File content: optional YAML front matter between `---` lines, then the prompt.
 * @returns The parsed file.
 * @throws When the id, front matter keys or values are invalid.
 */
export function parseAgentFile(id: string, text: string): AgentFile {
  if (!AGENT_ID.test(id)) throw new Error(`"${id}" is not a valid agent id (lowercase letters, digits and hyphens)`)
  const source = text.replace(/\r\n/g, '\n')
  const match = /^---\n(?:([\s\S]*?)\n)?---(?:\n|$)/.exec(source)
  const frontText = match === null ? undefined : match[1]
  const prompt = (match === null ? source : source.slice(match[0].length)).trim()
  const parsed = frontText === undefined ? {} : load(frontText) ?? {}
  if (!isMap(parsed)) throw new Error('front matter must be a YAML map')
  for (const key of Object.keys(parsed)) {
    if (!(FRONT_MATTER_KEYS as readonly string[]).includes(key)) {
      throw new Error(`unknown front matter key "${key}" (accepted: ${FRONT_MATTER_KEYS.join(', ')})`)
    }
  }
  const name = optionalString(parsed, 'name')
  const description = optionalString(parsed, 'description')
  const base = optionalString(parsed, 'extends')
  const order = parsed.order
  if (order !== undefined && typeof order !== 'number') throw new Error('order must be a number')
  const rules = parsed.permission === undefined ? [] : permissionRules(id, parsed.permission)
  return {
    id,
    ...(name === undefined ? {} : { name }),
    ...(description === undefined ? {} : { description }),
    ...(order === undefined ? {} : { order }),
    ...(base === undefined ? {} : { extends: base }),
    prompt,
    rules,
  }
}

/**
 * Compose the preset an agent file declares.
 * @param file Parsed file.
 * @param base Plugins of the preset the file extends.
 * @returns The definition to register; a non-empty prompt replaces the persona prefix of the base or adds a persona row.
 */
export function composeAgent(file: AgentFile, base: PresetDefinition): PresetDefinition {
  let plugins = base.plugins
  if (file.prompt !== '') {
    const prefix = file.prompt
    const replaced = plugins.map(row => row.name === PERSONA_MODULE
      ? { ...row, config: { ...(row.config as Record<string, unknown> | undefined), prefix } }
      : row)
    plugins = replaced.some(row => row.name === PERSONA_MODULE)
      ? replaced
      : [...plugins, { id: 'persona', name: PERSONA_MODULE, config: { prefix } }]
  }
  return {
    id: file.id,
    ...(file.name === undefined ? {} : { name: file.name }),
    ...(file.description === undefined ? {} : { description: file.description }),
    ...(file.order === undefined ? {} : { order: file.order }),
    plugins,
  }
}

/** Registers one preset per agent file in the configured directories. */
export default class AgentPresetMarkdown {
  static inject = ['agentPresets', 'permissionRules']
  static Config: z<Config> = z.object({
    dirs: z.array(z.string()).default([]),
    extends: z.string(),
  })

  constructor(private readonly ctx: Context, private readonly config: Config) {}

  async* [Service.init]() {
    for (const dir of this.config.dirs) {
      if (!isAbsolute(dir)) throw new Error(`agent-preset-markdown: dirs entry "${dir}" must be an absolute path`)
      for (const file of await agentFileNames(dir)) {
        const id = file.slice(0, -'.md'.length)
        try {
          const parsed = parseAgentFile(id, await readFile(join(dir, file), 'utf8'))
          const baseId = parsed.extends ?? this.config.extends
          if (baseId === undefined) throw new Error('names no base preset (set "extends" in the file or in the plugin config)')
          const base = this.ctx.agentPresets.definitionOf(baseId)
          if (base === undefined) throw new Error(`base preset "${baseId}" is not declared before this plugin`)
          yield await this.ctx.agentPresets.register(composeAgent(parsed, base))
          if (parsed.rules.length > 0) yield this.ctx.permissionRules.contribute(parsed.rules)
        } catch (error) {
          this.ctx.logger.warn(`agent file ${join(dir, file)} skipped: ${(error as Error).message}`)
        }
      }
    }
  }
}

/** List `*.md` files of one directory in name order; a missing directory has none. */
async function agentFileNames(dir: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    // A user directory that was never created is the normal empty state.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  return entries.filter(entry => entry.isFile() && entry.name.endsWith('.md')).map(entry => entry.name).sort()
}
