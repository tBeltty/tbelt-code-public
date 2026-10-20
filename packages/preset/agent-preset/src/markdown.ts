/**
 * Agent definition files: one Markdown file with YAML front matter registers one preset.
 * @module @deepseek-ai/dsh-agent-preset/markdown
 */
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { load } from 'js-yaml'
import type { AgentFileEntry, AgentFileStore, PresetAgentRoute, PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import { RULE_OUTCOMES, validateRuleTable, type PermissionRule, type RuleOutcome } from '@deepseek-ai/dsh-permission-rules'
import type {} from '@deepseek-ai/dsh-permission-rules'

/** Cordis module name of the persona row whose prefix a file body replaces. */
const PERSONA_MODULE = '@deepseek-ai/dsh-persona'

/** Front matter keys an agent file may carry. */
const FRONT_MATTER_KEYS = ['name', 'description', 'order', 'extends', 'provider', 'model', 'reasoning_effort', 'skills', 'permission'] as const

/** Preset ids a file name may produce. */
const AGENT_ID = /^[a-z0-9][a-z0-9-]*$/

/** Skill names a `skills` list may name; the same kebab-case grammar as the skill registry. */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Plugin configuration. */
export interface Config {
  /** Absolute directories scanned for `*.md` agent files; a directory that does not exist contributes none. */
  dirs: string[]
  /** Preset whose plugins every file extends unless its own `extends` names another. */
  extends?: string
  /** Milliseconds between scans of `dirs`; an added, edited or removed file applies at the next scan. */
  pollIntervalMs: number
}

/** What the plugin last read from one agent file, keyed by its absolute path. */
interface Attempt {
  /** File text the attempt read; a different text on disk makes the attempt stale. */
  readonly text: string
  /** Registrations of a file that loaded: its preset id, the base it extends, and the release of both. */
  readonly loaded?: { readonly id: string; readonly base: string; readonly dispose: () => Promise<void> }
  /** Message of the failure that kept the file from loading; undefined once it loads. */
  readonly error?: string
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
  /** LLM route children of this preset run on, if the file names one. */
  readonly route?: PresetAgentRoute
  /** Skill names children of this preset may see; omitted leaves every skill visible. */
  readonly skills?: readonly string[]
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

function optionalString(
  front: Record<string, unknown>,
  key: 'name' | 'description' | 'extends' | 'provider' | 'model' | 'reasoning_effort',
): string | undefined {
  const value = front[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${key} must be a non-empty string`)
  return value
}

/**
 * Read the `skills` list. An empty list hides every skill from the preset's children.
 * @param front Parsed front matter.
 * @returns The skill names, or undefined when the file names no list.
 * @throws When the value is not a list of skill names.
 */
function skillsOf(front: Record<string, unknown>): string[] | undefined {
  const value = front.skills
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error('skills must be a list of skill names')
  const names: string[] = []
  for (const name of value) {
    if (typeof name !== 'string' || !SKILL_NAME.test(name)) throw new Error(`skills entry "${String(name)}" is not a skill name`)
    names.push(name)
  }
  return names
}

/**
 * Read the route fields. `provider` and `model` name one route and must appear together;
 * `reasoning_effort` only qualifies that route.
 * @param front Parsed front matter.
 * @returns The route, or undefined when the file names none.
 * @throws When the fields are malformed or incomplete.
 */
function routeOf(front: Record<string, unknown>): PresetAgentRoute | undefined {
  const provider = optionalString(front, 'provider')
  const model = optionalString(front, 'model')
  const effort = optionalString(front, 'reasoning_effort')
  if (provider === undefined && model === undefined) {
    if (effort !== undefined) throw new Error('reasoning_effort requires provider and model')
    return undefined
  }
  if (provider === undefined || model === undefined) throw new Error('provider and model must be set together')
  return { provider, model, ...effort === undefined ? {} : { reasoningEffort: effort } }
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
  const route = routeOf(parsed)
  const skills = skillsOf(parsed)
  const order = parsed.order
  if (order !== undefined && typeof order !== 'number') throw new Error('order must be a number')
  const rules = parsed.permission === undefined ? [] : permissionRules(id, parsed.permission)
  return {
    id,
    ...(name === undefined ? {} : { name }),
    ...(description === undefined ? {} : { description }),
    ...(order === undefined ? {} : { order }),
    ...(base === undefined ? {} : { extends: base }),
    ...(route === undefined ? {} : { route }),
    ...(skills === undefined ? {} : { skills }),
    prompt,
    rules,
  }
}

/**
 * Compose the preset an agent file declares.
 * @param file Parsed file.
 * @param base Plugins of the preset the file extends.
 * @returns The definition to register. A non-empty prompt replaces the persona prefix of the base or adds a
 *   persona row; every agent is one-shot.
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
    ...(file.route === undefined ? {} : { agentRoute: file.route }),
    ...(file.skills === undefined ? {} : { skills: file.skills }),
    oneShot: true,
    origin: 'agent-file',
    plugins,
  }
}

/** Registers one preset per agent file in the configured directories and keeps them in step with the files. */
export default class AgentPresetMarkdown {
  static inject = ['agentPresets', 'permissionRules']
  static Config: z<Config> = z.object({
    dirs: z.array(z.string()).default([]),
    extends: z.string(),
    pollIntervalMs: z.number().min(100).default(2_000),
  })

  /** Last attempt per agent file path; a file without an entry has not been read yet. */
  private readonly attempts = new Map<string, Attempt>()
  /** Tail of the queued scans, so a scan never overlaps the one before it. */
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly ctx: Context, private readonly config: Config) {}

  async* [Service.init]() {
    for (const dir of this.config.dirs) {
      if (!isAbsolute(dir)) throw new Error(`agent-preset-markdown: dirs entry "${dir}" must be an absolute path`)
    }
    await this.reconcile()
    // The first directory is the one the editor writes to; the others are read only.
    const [authoring] = this.config.dirs
    if (authoring !== undefined) yield this.ctx.agentPresets.attachAgentFiles(this.fileStore(authoring))
    const timer = setInterval(() => { void this.queueReconcile() }, this.config.pollIntervalMs)
    timer.unref()
    yield async () => {
      clearInterval(timer)
      await this.queue
      for (const path of [...this.attempts.keys()]) await this.unload(path)
    }
  }

  /**
   * Reader and writer of the authoring folder. Each write or removal reloads the folder before it resolves.
   * @param dir Absolute authoring folder.
   * @returns The store the agent-preset registry attaches.
   */
  private fileStore(dir: string): AgentFileStore {
    const entryOf = (id: string): AgentFileEntry => {
      const error = this.attempts.get(agentFilePath(dir, id))?.error
      return error === undefined ? { id } : { id, error }
    }
    return {
      list: async () => (await agentFileNames(dir)).map(file => entryOf(file.slice(0, -'.md'.length))),
      read: async (id) => {
        try {
          return await readFile(agentFilePath(dir, id), 'utf8')
        } catch (error) {
          // A file that does not exist is an absent preset; any other read failure belongs to the caller.
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
          throw error
        }
      },
      write: async (id, text) => {
        parseAgentFile(id, text)
        await mkdir(dir, { recursive: true })
        await writeFile(agentFilePath(dir, id), text, 'utf8')
        await this.queueReconcile()
        return entryOf(id)
      },
      remove: async (id) => {
        await unlink(agentFilePath(dir, id))
        await this.queueReconcile()
      },
    }
  }

  /**
   * Queue one scan behind the scans already queued. A failed scan is warned and the next one retries.
   * @returns The queue tail after this scan settles.
   */
  private queueReconcile(): Promise<void> {
    this.queue = this.queue.then(() => this.reconcile()).catch((error: unknown) => {
      this.ctx.logger.warn(`agent files not rescanned: ${(error as Error).message}`)
    })
    return this.queue
  }

  /**
   * Unload files that were edited or removed, then load every file that is not loaded yet, in directory and name order.
   * Files that extend an unloaded file are unloaded with it and reloaded after it.
   */
  private async reconcile(): Promise<void> {
    const texts = new Map<string, string>()
    for (const dir of this.config.dirs) {
      for (const file of await agentFileNames(dir)) {
        const path = join(dir, file)
        texts.set(path, await readFile(path, 'utf8'))
      }
    }
    for (const [path, attempt] of this.attempts) {
      if (texts.get(path) !== attempt.text) await this.unload(path)
    }
    for (const [path, text] of texts) {
      if (this.attempts.get(path)?.loaded === undefined) await this.load(path, text)
    }
  }

  /**
   * Parse and register one agent file. A failure is warned when its message or text differs from the last attempt.
   * @param path Absolute path of the file.
   * @param text File content read by the scan.
   */
  private async load(path: string, text: string): Promise<void> {
    const before = this.attempts.get(path)
    try {
      const parsed = parseAgentFile(basename(path, '.md'), text)
      const baseId = parsed.extends ?? this.config.extends
      if (baseId === undefined) throw new Error('names no base preset (set "extends" in the file or in the plugin config)')
      const base = this.ctx.agentPresets.definitionOf(baseId)
      if (base === undefined) throw new Error(`base preset "${baseId}" is not declared before this plugin`)
      const unregister = await this.ctx.agentPresets.register(composeAgent(parsed, base))
      const uncontribute = parsed.rules.length > 0 ? this.ctx.permissionRules.contribute(parsed.rules) : undefined
      this.attempts.set(path, {
        text,
        loaded: {
          id: parsed.id,
          base: baseId,
          dispose: async () => {
            uncontribute?.()
            await unregister()
          },
        },
      })
    } catch (error) {
      const message = (error as Error).message
      this.attempts.set(path, { text, error: message })
      if (before === undefined || before.text !== text || before.error !== message) {
        this.ctx.logger.warn(`agent file ${path} skipped: ${message}`)
      }
    }
  }

  /**
   * Release one file's registrations after the files that extend it. A path without a loaded file is a no-op.
   * @param path Absolute path of the file.
   */
  private async unload(path: string): Promise<void> {
    const attempt = this.attempts.get(path)
    if (attempt === undefined) return
    this.attempts.delete(path)
    if (attempt.loaded === undefined) return
    const { id, dispose } = attempt.loaded
    for (const [other, candidate] of [...this.attempts]) {
      if (candidate.loaded?.base === id) await this.unload(other)
    }
    await dispose()
  }
}

/**
 * Path of one agent file, validating the id first so that no id can name a path outside the folder.
 * @param dir Folder that holds the file.
 * @param id Preset id, which is the file name without `.md`.
 * @returns The file path.
 * @throws When the id is not an agent id.
 */
function agentFilePath(dir: string, id: string): string {
  if (!AGENT_ID.test(id)) throw new Error(`"${id}" is not a valid agent id (lowercase letters, digits and hyphens)`)
  return join(dir, `${id}.md`)
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
