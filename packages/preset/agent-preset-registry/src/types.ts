/** Client-safe payloads and event declarations owned by the agent-preset domain. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'


/**
 * One declared preset as a client reads it.
 */
export interface AgentPresetRow {
  /** Stable identifier; also the label's fallback. */
  readonly id: string
  /** Whether a session naming no preset composes this one. */
  readonly isDefault: boolean
  /** Display name the preset published. */
  readonly name?: string
  /** One sentence on what this preset is for. */
  readonly description?: string
  /** Why this preset cannot compose a session; absent when it can. */
  readonly broken?: string
}

/** The roster one deployment currently supplies. */
export interface AgentPresetRoster {
  /** Every current declaration, including activation failures. */
  readonly presets: readonly AgentPresetRow[]
}

/** One agent file of the authoring folder and why it did not load, when it did not. */
export interface AgentFileEntry {
  /** Preset id the file registers; the file name without `.md`. */
  readonly id: string
  /** Why the file is not a loaded preset; absent when it loaded. */
  readonly error?: string
}

/** The agent files of the authoring folder, in name order; empty when no folder is configured. */
export interface AgentFileRoster {
  readonly files: readonly AgentFileEntry[]
}

/** One agent file's source text, front matter included. */
export interface AgentFileDocument {
  readonly id: string
  readonly text: string
}

/** Reads and writes the agent files of the one folder agents are authored in. */
export interface AgentFileStore {
  /** Every agent file in the folder, with its load status. */
  list(): Promise<readonly AgentFileEntry[]>
  /** One file's text, or undefined when the folder holds no such file. */
  read(id: string): Promise<string | undefined>
  /** Validate and replace one file, then reload the folder; rejects with the reason when the text is invalid. */
  write(id: string, text: string): Promise<AgentFileEntry>
  /** Remove one file and unload its preset. */
  remove(id: string): Promise<void>
}

/** One preset's declared composition, rendered for reading. */
export interface AgentPresetDocument {
  /** The preset the composition belongs to. */
  readonly agentPreset: string
  /** The declared child plugin list as entry-list YAML, `!!js` expressions included. */
  readonly content: string
  /** Display name the preset published. */
  readonly name?: string
  /** One sentence on what this preset is for. */
  readonly description?: string
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No declaration supplies the requested identity. */
    'agent-preset/not-found': { readonly agentPreset: string; readonly available: readonly string[] }
    /** The id is unusable, already taken, or its composition cannot be installed. */
    'agent-preset/invalid': { readonly agentPreset: string; readonly reason: string }
    /** The session's conversation has started, so its composition is fixed. */
    'agent-preset/locked': { readonly sessionId: SessionId; readonly agentPreset: string }
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Preset the Session runs, or null when the deployment composes none. */
    agentPreset: string | null
  }
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * One session committed a different agent preset to its durable log.
     * Consumers invalidate only state derived from that session's composition.
     * @mode emit
     * @param sessionId - the session whose composition changed.
     * @param agentPreset - the preset recorded by the committed selection.
     */
    'agent-preset/selected'(sessionId: SessionId, agentPreset: string): void
    /**
     * An agent-file preset was registered or removed. Delegation tools rebuild the choices they offer
     * from `agentFileDefinitions()`.
     * @mode emit
     */
    'agent-preset/change'(): void
  }
}

export {}
