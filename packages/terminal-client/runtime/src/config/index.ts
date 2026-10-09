/**
 * The configuration screens of the terminal: providers and keys, web search,
 * settings, plugins, agents, permissions and the default model. Each screen is
 * a flow over the Remote namespaces the GUI settings pages use.
 * @module @deepseek-ai/dsh-terminal-client/config
 */
import type { RemotePort, RemoteResultPort } from '../ports.ts'
import { runAgents } from './agents.ts'
import { runDefaultModel } from './models.ts'
import { runPermissions } from './permissions.ts'
import { runPlugins } from './plugins.ts'
import { runProviders } from './providers.ts'
import { runSettings } from './settings.ts'
import type { FlowUi } from './ui.ts'
import { runWebSearch } from './web-search.ts'

export type { FlowUi } from './ui.ts'

/** A configuration screen the person can open. */
export type ConfigScreen = 'providers' | 'web-search' | 'settings' | 'plugins' | 'agents' | 'permissions' | 'default-model'

/** What a screen reads about the session it was opened in. */
export interface ConfigSession {
  readonly sessionId: string
  /** Runs a slash command line in the session. */
  readonly command: (line: string) => Promise<RemoteResultPort<{ readonly matched: boolean }>>
}

/**
 * Run one configuration screen.
 * @param screen - which screen to open.
 * @param remote - the Remote namespaces of the connected client.
 * @param ui - where questions and messages go.
 * @param session - the open session.
 * @returns settles when the person finished or left the screen.
 */
export async function runConfigScreen(screen: ConfigScreen, remote: RemotePort, ui: FlowUi, session: ConfigSession): Promise<void> {
  switch (screen) {
    case 'providers':
      await runProviders(remote, ui)
      return
    case 'web-search':
      await runWebSearch(remote, ui)
      return
    case 'settings':
      await runSettings(remote, ui)
      return
    case 'plugins':
      await runPlugins(remote, ui)
      return
    case 'agents':
      await runAgents(remote, ui, session.sessionId)
      return
    case 'permissions':
      await runPermissions(remote, ui, session.command)
      return
    case 'default-model':
      await runDefaultModel(remote, ui)
      return
  }
}
