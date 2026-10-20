/** Deployment-owned preset choices for one delegation tool. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type { SubagentCapabilities, SubagentProvider } from '@deepseek-ai/dsh-subagent'

/** Optional default and model-selectable preset ids for a spawn tool. */
export interface PresetSelectionConfig {
  /** Default independent preset; omission inherits the parent when the model makes no selection. */
  agentPreset?: string
  /**
   * Explicit allowlist exposing agent_preset to the model, in addition to user agent files; omission
   * exposes only the agent files.
   */
  allowedAgentPresets?: string[] | undefined
}

/** One preset declared by a user agent file, offered to the model without configuration. */
export interface AgentFileChoice {
  readonly id: string
  readonly description?: string | undefined
  /** Agent files run one task, so their children accept no follow-up messages. */
  readonly oneShot: boolean
}

/** Provider facts that decide whether a child may take an independent preset. */
export interface PresetProviderFacts {
  readonly capabilities: Pick<SubagentCapabilities, 'agentPreset'>
  readonly inheritsParentContext: boolean
}

/** Untrusted preset selection from model/tool JSON. */
export interface PresetSelectionRequest {
  readonly agent_preset?: unknown
}

const ONE_TASK_NOTE = ' Runs one task and accepts no follow-up messages.'

/** Validates configured references and resolves model input against the choices a provider admits. */
export class SubagentPresetSelection {
  private readonly explicitDescriptions = new Map<string, string>()

  /**
   * @param config - deployment default and explicit allowlist.
   * @param agentFiles - current agent-file presets; read at each choice, so a change is seen by the next mount.
   */
  constructor(
    private readonly config: PresetSelectionConfig,
    private readonly agentFiles: () => readonly AgentFileChoice[] = () => [],
  ) {
    const { agentPreset, allowedAgentPresets } = config
    if (allowedAgentPresets === undefined) return
    if (new Set(allowedAgentPresets).size !== allowedAgentPresets.length) {
      throw new Error('tool-subagent: allowedAgentPresets contains duplicate preset ids')
    }
    if (agentPreset !== undefined && !allowedAgentPresets.includes(agentPreset)) {
      throw new Error('tool-subagent: agentPreset must be included in allowedAgentPresets')
    }
  }

  /** Whether this tool requires the preset service and an independently composing provider. */
  get configured(): boolean {
    return this.config.agentPreset !== undefined || this.config.allowedAgentPresets !== undefined
  }

  /**
   * Preset ids the model may pass for a child of one provider: the explicit allowlist plus agent files,
   * which only a provider that composes independent children admits.
   * @param provider - provider that will start the child.
   * @returns the ids, or undefined when the model may select no preset.
   */
  choicesFor(provider: PresetProviderFacts): readonly string[] | undefined {
    const explicit = this.config.allowedAgentPresets
    const files = this.admitsAgentFiles(provider) ? this.agentFiles().map(file => file.id) : []
    if (explicit === undefined && files.length === 0) return undefined
    return [...new Set([...explicit ?? [], ...files])]
  }

  /**
   * Model-visible selection guidance with the descriptions of the offered presets.
   * @param provider - provider that will start the child.
   * @returns the agent_preset parameter description.
   */
  descriptionFor(provider: PresetProviderFacts): string {
    const fallback = this.config.agentPreset === undefined
      ? 'Omit to inherit the parent agent\'s current preset.'
      : `Omit to use ${this.config.agentPreset}.`
    const described = (this.choicesFor(provider) ?? []).flatMap((id) => {
      const text = this.descriptionOf(id)
      return text === undefined ? [] : [`${id}: ${text}`]
    })
    return `Agent preset for this child. ${fallback}`
      + (described.length === 0 ? '' : ` Available presets: ${described.join('; ')}`)
  }

  /**
   * Read configured preset declarations before publishing the tool; mounting validates their activation.
   * @param ctx - Tool composition containing the preset service.
   */
  async validate(ctx: Context): Promise<void> {
    const presets = ctx.get('agentPresets')
    if (presets === undefined) throw new Error('tool-subagent: agent preset selection requires the agent-presets service')
    const ids = new Set([
      ...this.config.agentPreset === undefined ? [] : [this.config.agentPreset],
      ...this.config.allowedAgentPresets ?? [],
    ])
    this.explicitDescriptions.clear()
    for (const id of ids) {
      const preset = await presets.readDocument(id)
      if (this.config.allowedAgentPresets?.includes(id) && preset.description !== undefined) {
        const oneShot = presets.definitionOf(id)?.oneShot === true
        this.explicitDescriptions.set(id, `${preset.description}${oneShot ? ONE_TASK_NOTE : ''}`)
      }
    }
  }

  /**
   * Reject independent selection for providers that inherit conversation history or lack support.
   * @param provider - Currently registered delegation provider.
   */
  assertProvider(provider: SubagentProvider): void {
    if (this.configured && (!provider.capabilities.agentPreset || provider.inheritsParentContext)) {
      throw new Error(`tool-subagent: provider "${provider.name}" does not support independent agent preset selection`)
    }
  }

  /**
   * Validate model input and apply the deployment default.
   * @param request - Model-supplied tool arguments.
   * @param provider - provider that will start the child.
   * @returns Selected preset id, or omission to inherit the parent.
   */
  resolve(request: PresetSelectionRequest, provider: PresetProviderFacts): string | undefined {
    const id = request.agent_preset
    if (id === undefined) return this.config.agentPreset
    const choices = this.choicesFor(provider)
    if (choices === undefined) throw new Error('agent_preset selection is disabled for this tool instance')
    if (typeof id !== 'string' || !choices.includes(id)) {
      throw new Error(`agent_preset must be one of: ${choices.join(', ')}`)
    }
    return id
  }

  private admitsAgentFiles(provider: PresetProviderFacts): boolean {
    return provider.capabilities.agentPreset && !provider.inheritsParentContext
  }

  private descriptionOf(id: string): string | undefined {
    const file = this.agentFiles().find(candidate => candidate.id === id)
    if (file !== undefined) {
      const text = `${file.description ?? ''}${file.oneShot ? ONE_TASK_NOTE : ''}`.trim()
      return text === '' ? undefined : text
    }
    return this.explicitDescriptions.get(id)
  }
}
