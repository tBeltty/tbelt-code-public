/**
 * Resolves the two run choices the command line names by text: the Session
 * `--resume` points at and the model `--model` points at. Both match the
 * terminal profile's choices, so a script and a person reach the same Session
 * and model with the same words.
 * @module @deepseek-ai/dsh-headless/choose
 */

import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import type { LlmCallConfig, LlmModelInfo, LlmProviderInfo } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'

/** The fields of a stored Session this choice reads. */
export interface ResumeCandidate {
  readonly id: SessionId
  /** Subagent Sessions belong to a parent and are never resumed directly. */
  readonly origin?: 'subagent' | undefined
}

/** How many ids an error lists before it counts the rest. */
const LISTED = 8

/** Shorten a list of names for one error line. */
function summarize(names: readonly string[]): string {
  if (names.length <= LISTED) return names.join(', ')
  return `${names.slice(0, LISTED).join(', ')} and ${String(names.length - LISTED)} more`
}

/**
 * Pick the stored Session a `--resume` value names.
 * @param spec - a full Session id, or the start of one with or without the `session-` prefix.
 * @param candidates - the Sessions the store lists.
 * @returns the matching Session id.
 * @throws when no Session matches or the start matches several.
 */
export function resolveResume(spec: string, candidates: readonly ResumeCandidate[]): SessionId {
  const openable = candidates.filter(candidate => candidate.origin !== 'subagent')
  const exact = openable.find(candidate => candidate.id === spec)
  if (exact !== undefined) return exact.id
  const matches = openable.filter(candidate => candidate.id.startsWith(spec) || candidate.id.startsWith(`session-${spec}`))
  if (matches.length === 1) return (matches[0] as ResumeCandidate).id
  if (matches.length === 0) throw new Error(`no stored session starts with "${spec}"`)
  throw new Error(`"${spec}" matches several sessions: ${summarize(matches.map(match => match.id))}`)
}

/** The model registry calls the model choice reads. */
export interface ModelRegistry {
  /** Providers with a registered route. */
  listProviders(): readonly LlmProviderInfo[]
  /** Models one provider offers; rejects when the provider cannot be asked. */
  listModels(provider: string): Promise<readonly LlmModelInfo[]>
  /** Validate a route and fill adapter defaults such as the reasoning effort. */
  resolveCallConfig(config: LlmCallConfig): Promise<LlmCallConfig>
}

/** Models of one provider, or why they could not be read. */
async function modelsOf(registry: ModelRegistry, provider: string): Promise<readonly LlmModelInfo[] | Error> {
  try {
    return await registry.listModels(provider)
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error))
  }
}

/**
 * Pick the provider and model a `--model` value names. `provider/model` names
 * both; a bare model id is accepted when exactly one provider offers it.
 * @param spec - the `--model` text.
 * @param registry - the model registry.
 * @returns the validated selection, with the reasoning effort the adapter defaults to when it has one.
 * @throws when no provider offers the model, several do, or the route is refused.
 */
export async function resolveModel(spec: string, registry: ModelRegistry): Promise<ModelSelection> {
  const providers = registry.listProviders()
  const slash = spec.indexOf('/')
  const named = slash === -1 ? undefined : providers.find(provider => provider.id === spec.slice(0, slash))
  const found: { provider: string; model: string }[] = []
  const unreadable = new Set<string>()
  if (named !== undefined) {
    const models = await modelsOf(registry, named.id)
    const model = spec.slice(slash + 1)
    if (models instanceof Error) unreadable.add(`${named.id} (${models.message})`)
    else if (models.some(candidate => candidate.id === model)) found.push({ provider: named.id, model })
  }
  if (found.length === 0) {
    // A model id may contain a slash itself, so the whole text is also tried as a bare id.
    for (const provider of providers) {
      const models = await modelsOf(registry, provider.id)
      if (models instanceof Error) unreadable.add(`${provider.id} (${models.message})`)
      else if (models.some(candidate => candidate.id === spec)) found.push({ provider: provider.id, model: spec })
    }
  }
  if (found.length === 0) {
    const reasons = unreadable.size === 0 ? '' : `; could not list ${summarize([...unreadable])}`
    throw new Error(`no provider offers model "${spec}"; name it as provider/model${reasons}`)
  }
  if (found.length > 1) {
    throw new Error(`model "${spec}" is offered by several providers: ${summarize(found.map(match => `${match.provider}/${match.model}`))}; name one as provider/model`)
  }
  const { provider, model } = found[0] as { provider: string; model: string }
  const resolved = await registry.resolveCallConfig({ provider, model })
  return {
    provider: resolved.provider,
    model: resolved.model,
    ...resolved.reasoningEffort === undefined ? {} : { reasoningEffort: resolved.reasoningEffort },
  }
}
