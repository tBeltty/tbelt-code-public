/**
 * Input lines: decides what a submitted message means before it is sent.
 * @module @deepseek-ai/dsh-terminal-views/input
 */

/** The configuration screens a slash command opens. */
export type ConfigScreenName = 'providers' | 'web-search' | 'settings' | 'plugins' | 'agents' | 'permissions'

const CONFIG_SCREENS: ReadonlySet<string> = new Set<ConfigScreenName>(['providers', 'web-search', 'settings', 'plugins', 'agents', 'permissions'])

/** What a submitted line asks for. */
export type SubmittedInput =
  | { readonly kind: 'prompt'; readonly text: string }
  | { readonly kind: 'help' }
  | { readonly kind: 'exit' }
  | { readonly kind: 'sessions' }
  | { readonly kind: 'model'; readonly asDefault: boolean }
  | { readonly kind: 'config'; readonly screen: ConfigScreenName }
  | { readonly kind: 'rename'; readonly title: string }
  | { readonly kind: 'new'; readonly directory: string }
  | { readonly kind: 'attach'; readonly path: string }
  | { readonly kind: 'detach' }
  | { readonly kind: 'command'; readonly line: string }

/**
 * Classify a submitted message.
 * @param text - the trimmed message from the composer.
 * @returns a prompt for the agent, a command the terminal handles itself, or a slash command the session runs.
 */
export function classifyInput(text: string): SubmittedInput {
  if (!text.startsWith('/') || text.includes('\n')) return { kind: 'prompt', text }
  const name = text.slice(1).split(/\s+/u, 1)[0] as string
  const argument = text.slice(1 + name.length).trim()
  if (name === 'help') return { kind: 'help' }
  if (name === 'exit' || name === 'quit') return { kind: 'exit' }
  if (name === 'sessions') return { kind: 'sessions' }
  if (name === 'model') return { kind: 'model', asDefault: argument === 'default' }
  if (CONFIG_SCREENS.has(name)) return { kind: 'config', screen: name as ConfigScreenName }
  if (name === 'rename') return { kind: 'rename', title: argument }
  if (name === 'new') return { kind: 'new', directory: argument }
  if (name === 'attach') return { kind: 'attach', path: argument }
  if (name === 'detach') return { kind: 'detach' }
  return name === '' ? { kind: 'prompt', text } : { kind: 'command', line: text }
}
