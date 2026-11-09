/**
 * Quick-fill templates for a hand-declared provider. Cloud providers
 * OpenAI, Anthropic, Gemini, and DeepSeek are already reachable through the
 * generic catalog "Add" flow (`pi-ai`'s builtin provider catalog), so no
 * template duplicates them here. Local model servers are not in that
 * catalog and only reachable today through a hand-filled custom-provider
 * form or manual settings YAML, so this list covers those.
 * @module @deepseek-ai/dsh-presentation-settings/provider-templates
 */

/** One quick-fill template for the custom-provider form. */
export interface ProviderTemplate {
  /** Stable identity for the quick-add button and its default route id. */
  id: string
  /** Button label and default display name. */
  displayName: string
  /** Default route id (settings key / credential-name stem). */
  route: string
  /** Default base URL. */
  baseURL: string
  /** Default wire protocol; must be one the mounted adapter actually offers. */
  api: string
  /**
   * Placeholder credential pre-filled for a keyless local server whose
   * OpenAI-compatible implementation still requires a non-empty key or
   * `Authorization` value on the request (see `docs/guides/LOCAL_MODELS.md`).
   * Left unset for a template that needs the user's own real key.
   */
  placeholderKey?: string
}

/** Local model server templates, in display order. */
export const LOCAL_PROVIDER_TEMPLATES: readonly ProviderTemplate[] = [
  {
    id: 'ollama',
    displayName: 'Ollama',
    route: 'ollama',
    baseURL: 'http://localhost:11434/v1',
    api: 'openai-completions',
    placeholderKey: 'ollama',
  },
  {
    id: 'lmstudio',
    displayName: 'LM Studio',
    route: 'lmstudio',
    baseURL: 'http://localhost:1234/v1',
    api: 'openai-completions',
    placeholderKey: 'lmstudio',
  },
  {
    id: 'koboldcpp',
    displayName: 'KoboldCpp',
    route: 'koboldcpp',
    baseURL: 'http://localhost:5001/v1',
    api: 'openai-completions',
    placeholderKey: 'koboldcpp',
  },
]
