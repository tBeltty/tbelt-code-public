/**
 * Reader-facing names for catalog provider routes. The catalog names a route
 * by its id, so the first-run list and the Models page would otherwise show
 * `amazon-bedrock` twice. A name the profile sets itself is kept.
 * @module @deepseek-ai/dsh-client-ui-settings-models/provider-names
 */

/** Names for the catalog routes whose title-cased id is not their product name. */
const KNOWN_NAMES: Readonly<Record<string, string>> = {
  'amazon-bedrock': 'Amazon Bedrock',
  'ant-ling': 'Ant Ling',
  'azure-openai-responses': 'Azure OpenAI',
  'cloudflare-ai-gateway': 'Cloudflare AI Gateway',
  'cloudflare-workers-ai': 'Cloudflare Workers AI',
  deepseek: 'DeepSeek',
  'github-copilot': 'GitHub Copilot',
  google: 'Google Gemini',
  'google-vertex': 'Google Vertex AI',
  huggingface: 'Hugging Face',
  'kimi-coding': 'Kimi Coding',
  minimax: 'MiniMax',
  'minimax-cn': 'MiniMax China',
  moonshotai: 'Moonshot AI',
  'moonshotai-cn': 'Moonshot AI China',
  nvidia: 'NVIDIA',
  'openai-codex': 'OpenAI Codex',
  openai: 'OpenAI',
  opencode: 'OpenCode',
  'opencode-go': 'OpenCode Go',
  openrouter: 'OpenRouter',
  'vercel-ai-gateway': 'Vercel AI Gateway',
  xai: 'xAI',
  zai: 'Z.ai',
  'zai-coding-cn': 'Z.ai Coding China',
}

/** Catalog routes listed first on the first-run screen, in display order. */
export const POPULAR_PROVIDERS: readonly string[] = [
  'openai', 'anthropic', 'google', 'openrouter', 'deepseek', 'xai', 'mistral', 'groq',
]

/** Catalog routes offered on the first-run screen for a person who already has a key, in display order. */
export const HAVE_KEY_PROVIDERS: readonly string[] = ['openai', 'anthropic', 'google', 'openrouter']

/** A provider that offers a free key, with the page that creates it. */
export interface FreeKeyProvider {
  /** Catalog route id. */
  provider: string
  /** Page where the person creates the key. */
  keyUrl: string
  /** Copy key of the one-line limits text. */
  limitKey: 'onboardingLimitOpenrouter' | 'onboardingLimitGroq' | 'onboardingLimitGoogle'
  /** Copy key of a privacy notice shown after the limits text. */
  privacyKey?: 'onboardingPrivacyGoogle'
}

/**
 * Providers shown to a person with no key, in display order. The limits copy
 * carries no figures; each provider changes them, so the text names only what
 * its documentation states as a rule.
 */
export const FREE_KEY_PROVIDERS: readonly FreeKeyProvider[] = [
  { provider: 'openrouter', keyUrl: 'https://openrouter.ai/settings/keys', limitKey: 'onboardingLimitOpenrouter' },
  { provider: 'groq', keyUrl: 'https://console.groq.com/keys', limitKey: 'onboardingLimitGroq' },
  { provider: 'google', keyUrl: 'https://aistudio.google.com/apikey', limitKey: 'onboardingLimitGoogle', privacyKey: 'onboardingPrivacyGoogle' },
]

/**
 * Name a provider route for display.
 * @param provider - route id.
 * @param declared - name the catalog or profile reports; equal to the id when nobody set one.
 * @returns the declared name when it differs from the id, else the known or title-cased name.
 */
export function providerDisplayName(provider: string, declared: string): string {
  if (declared !== provider) return declared
  const known = KNOWN_NAMES[provider]
  if (known !== undefined) return known
  return provider.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}
