/**
 * Input lines: decides what a submitted message means before it is sent.
 * @module @deepseek-ai/dsh-terminal-views/input
 */

/** The configuration screens a slash command opens. */
export type ConfigScreenName = 'providers' | 'web-search' | 'settings' | 'plugins' | 'agents' | 'permissions'

const CONFIG_SCREENS: ReadonlySet<string> = new Set<ConfigScreenName>(['providers', 'web-search', 'settings', 'plugins', 'agents', 'permissions'])

/** The panels a slash command opens: views and actions over the session's queue, files, work in progress and workspace. */
export type PanelName =
  | 'queue' | 'skills' | 'subagents' | 'jobs' | 'schedule' | 'goal' | 'deliverables' | 'trajectory' | 'feedback'
  | 'fork' | 'organize' | 'status' | 'workspaces' | 'worktrees' | 'open' | 'budget' | 'plan' | 'commands'

const PANELS: ReadonlySet<string> = new Set<PanelName>([
  'queue', 'skills', 'subagents', 'jobs', 'schedule', 'goal', 'deliverables', 'trajectory', 'feedback', 'fork', 'organize',
  'status', 'workspaces', 'worktrees', 'open', 'budget', 'plan', 'commands',
])

/** Panels that open only for the bare command; `/goal <objective>`, `/budget 5` and `/feedback <text>` still go to the session. */
const BARE_ONLY: ReadonlySet<string> = new Set<PanelName>(['goal', 'budget', 'feedback'])

/**
 * The panel a command name and argument open.
 * @param name - the word after the slash.
 * @param argument - the trimmed text after the name.
 * @returns the panel, or undefined when the line is a command for the session; `/plan` opens its panel only as `/plan show`.
 */
function panelFor(name: string, argument: string): PanelName | undefined {
  if (!PANELS.has(name)) return undefined
  if (name === 'plan') return argument === 'show' ? 'plan' : undefined
  if (argument !== '' && BARE_ONLY.has(name)) return undefined
  return name as PanelName
}

/** What a submitted line asks for. */
export type SubmittedInput =
  | { readonly kind: 'prompt'; readonly text: string }
  | { readonly kind: 'help' }
  | { readonly kind: 'exit' }
  | { readonly kind: 'sessions' }
  | { readonly kind: 'model'; readonly asDefault: boolean }
  | { readonly kind: 'config'; readonly screen: ConfigScreenName }
  | { readonly kind: 'panel'; readonly panel: PanelName; readonly argument: string }
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
  const panel = panelFor(name, argument)
  if (panel !== undefined) return { kind: 'panel', panel, argument }
  if (name === 'rename') return { kind: 'rename', title: argument }
  if (name === 'new') return { kind: 'new', directory: argument }
  if (name === 'attach') return { kind: 'attach', path: argument }
  if (name === 'detach') return { kind: 'detach' }
  return name === '' ? { kind: 'prompt', text } : { kind: 'command', line: text }
}
