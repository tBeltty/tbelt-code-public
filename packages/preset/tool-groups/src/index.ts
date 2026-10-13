/**
 * Keeps named groups of tools out of the model request until the model asks for them with
 * `enable_tools`. Every group member is a normal registered tool; this plugin masks the members per
 * agent with `tools.restrict()` when the agent is created and lifts the mask for one group per
 * enable call. The loop then logs the new tools as a tool-addition on its next step. A resumed or
 * forked session keeps a group on when any of its tools is in the logged request header. Named
 * exports preserve loader injection metadata.
 * @module @deepseek-ai/dsh-tool-groups
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Type-only: resolves the `agent/created` event declaration.
import type {} from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-groups'
export const inject = ['tools', 'systemPrompt']

/** The model-facing tool that enables one group. */
export const ENABLE_TOOLS = 'enable_tools'

/** One named group of tools that starts disabled. */
export interface ToolGroup {
  /** Group name the model passes to `enable_tools`; unique within the plugin. */
  name: string
  /** One line telling the model when the group is worth enabling; shown in the system prompt. */
  description: string
  /** Names of registered tools the group enables; a tool belongs to at most one group. */
  tools: string[]
}

/** Deployment-owned tool groups. */
export interface Config {
  /** The groups, in the order the system prompt lists them. */
  groups: ToolGroup[]
}

/** Schemastery configuration for the tool-group plugin. */
export const Config: z<Config> = z.object({
  groups: z.array(z.object({
    name: z.string().required(),
    description: z.string().required(),
    tools: z.array(z.string()).required(),
  })).required(),
})

/**
 * Reject group declarations that would hide the wrong tools or leave the model without a way to
 * ask for them.
 * @param config - raw plugin configuration.
 * @returns the validated groups.
 * @throws when there are no groups, a name or description is blank, a name repeats, a group has no
 * tools, a tool sits in two groups, or a group names `enable_tools` itself.
 */
export function resolveGroups(config: Config): readonly ToolGroup[] {
  if (config.groups.length === 0) throw new Error('tool-groups: `groups` must name at least one group')
  const groupNames = new Set<string>()
  const owners = new Map<string, string>()
  for (const group of config.groups) {
    if (group.name.trim() === '') throw new Error('tool-groups: a group needs a non-empty `name`')
    if (group.description.trim() === '') throw new Error(`tool-groups: group "${group.name}" needs a non-empty \`description\``)
    if (groupNames.has(group.name)) throw new Error(`tool-groups: group "${group.name}" is declared twice`)
    groupNames.add(group.name)
    if (group.tools.length === 0) throw new Error(`tool-groups: group "${group.name}" needs at least one tool`)
    for (const tool of group.tools) {
      if (tool === ENABLE_TOOLS) throw new Error(`tool-groups: group "${group.name}" cannot contain ${ENABLE_TOOLS}`)
      const owner = owners.get(tool)
      if (owner !== undefined) throw new Error(`tool-groups: tool "${tool}" is in both "${owner}" and "${group.name}"`)
      owners.set(tool, group.name)
    }
  }
  return config.groups
}

/** One group as an agent resolves it when created. */
interface AgentGroup {
  /** The group's declaration. */
  readonly group: ToolGroup
  /** Group tools registered for the agent, in declared order. */
  readonly tools: readonly string[]
  /** Lifts the group's mask; absent once the group is enabled. */
  lift?: () => void
}

/**
 * Register `enable_tools`, the group list prompt section, and the per-agent masks.
 * @param ctx - preset-scope context carrying the tool and system-prompt registries.
 * @param config - the deployment's tool groups.
 */
export function apply(ctx: Context, config: Config): void {
  const groups = resolveGroups(config)
  /** The groups with at least one registered tool, per agent. */
  const resolved = new WeakMap<object, Map<string, AgentGroup>>()

  ctx.on('agent/created', ({ agent }) => {
    const logged = new Set(agent.session.requestHeader()?.tools?.map(tool => tool.name))
    const entries = new Map<string, AgentGroup>()
    for (const group of groups) {
      const tools = group.tools.filter(tool => ctx.tools.get(tool, agent) !== undefined)
      if (tools.length === 0) continue
      // A group any of whose tools the last logged request carried was enabled before the resume or fork.
      const enabled = tools.some(tool => logged.has(tool))
      entries.set(group.name, enabled
        ? { group, tools }
        : { group, tools, lift: agent.ctx.tools.restrict({ deny: tools }) })
    }
    resolved.set(agent, entries)
  })

  ctx.systemPrompt.section({
    name: 'tool-groups',
    order: ctx.systemPrompt.getSectionOrder('TOOL_GROUPS'),
    text: ({ scope }) => {
      const entries = scope === undefined ? undefined : resolved.get(scope)
      if (entries === undefined || entries.size === 0) return ''
      return [
        `More tools are off until you call ${ENABLE_TOOLS} with a group name. A group stays on for the rest of the session.`,
        ...[...entries.values()].map(({ group }) => `- ${group.name}: ${group.description}`),
      ].join('\n')
    },
  })

  ctx.tools.register(defineTool({
    name: ENABLE_TOOLS,
    description: 'Turn on a group of tools listed in the system prompt. Its tools are available from your next step.',
    parameters: {
      group: {
        type: 'string',
        required: true,
        enum: groups.map(group => group.name),
        description: 'The group to turn on.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          group: { type: 'string', required: true },
          tools: { type: 'array', required: true, items: { type: 'string' } },
          alreadyEnabled: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.alreadyEnabled
          ? `${value.group} is already enabled: ${value.tools.join(', ')}.`
          : `Enabled ${value.group}: ${value.tools.join(', ')}. Use them from your next step.`,
      }],
    },
    execute(args, exec) {
      const agent = exec.agent
      if (agent === undefined) throw new Error(`${ENABLE_TOOLS} requires a calling agent`)
      const entry = resolved.get(agent)?.get(args.group)
      if (entry === undefined) throw new Error(`group "${args.group}" has no tools in this mode`)
      const alreadyEnabled = entry.lift === undefined
      entry.lift?.()
      delete entry.lift
      return Promise.resolve({ group: args.group, tools: [...entry.tools], alreadyEnabled })
    },
    presentCall: args => ({ card: 'generic', title: `Enable ${args.group} tools`, kind: 'other', rawInput: args }),
  }))
}
