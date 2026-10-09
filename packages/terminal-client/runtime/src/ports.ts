/**
 * The client services the terminal runtime uses, described by the members it
 * calls. The client tree is built from browser-format bundles whose Context
 * declarations cannot share a TypeScript program with the Host's, so these
 * interfaces are the whole contract; the contract suite runs the real services
 * against them.
 * @module @deepseek-ai/dsh-terminal-client/ports
 */
import type { TranscriptEvent } from '@deepseek-ai/dsh-terminal-views'
import type { ApprovalChoice } from '@deepseek-ai/dsh-presentation-approval'

/** A value with a synchronous snapshot and change notification. */
export interface ObservablePort<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** The fields of a session list row the terminal reads. */
export interface SessionSummaryPort {
  readonly id: string
  /** Host-computed or user-set title; absent for an unnamed session. */
  readonly title?: string | undefined
  readonly cwd?: string | undefined
  readonly origin?: 'subagent' | undefined
  readonly blank: boolean
  readonly updatedAt: number
}

/** The session list. */
export interface SessionListPort {
  readonly phase: string
  readonly ids: readonly string[]
  readonly byId: Readonly<Record<string, SessionSummaryPort>>
}

/** A Remote result: the value, or the failure with its stable code. */
export type RemoteResultPort<T> =
  | { readonly ok: true; readonly value: T }
  | {
    readonly ok: false
    readonly error: { readonly code: string; readonly message: string; readonly details?: { readonly code?: string } | undefined }
  }

/** The lifecycle fields of one session. */
export interface SessionSnapshotPort {
  readonly running: boolean
  readonly openState: 'cold' | 'loading' | 'open' | 'error'
  readonly openError: { readonly message: string } | null
}

/** One part of a prompt: text, or an image the Host promotes to a stored attachment. */
export type PromptPartPort =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image'; readonly mediaType: string; readonly data: string; readonly name?: string }

/** A stored image read back from the Host. */
export interface StoredImagePort {
  readonly attachment: {
    readonly mediaType: string
    readonly bytes: number
    readonly width: number
    readonly height: number
    readonly name?: string | undefined
  }
  readonly data: Uint8Array
}

/** The behavior of one session. */
export interface SessionFacePort extends ObservablePort<SessionSnapshotPort> {
  prompt(
    content: readonly PromptPartPort[],
    mode: 'queue' | 'steer',
  ): Promise<RemoteResultPort<{ readonly accepted: true }>>
  rename(title: string): Promise<RemoteResultPort<{ readonly title: string }>>
  readAttachment(attachmentId: string): Promise<RemoteResultPort<StoredImagePort>>
  cancel(): Promise<RemoteResultPort<{ readonly accepted: true }>>
  command(line: string): Promise<RemoteResultPort<{ readonly matched: boolean }>>
}

/** One row of a session's event window. */
export interface EventEntryPort {
  readonly type: 'event' | 'transient'
  readonly event: TranscriptEvent
}

/** The latest change to a session's event window. */
export type EventChangePort =
  | { readonly kind: 'replace' | 'prepend' | 'append'; readonly entries: readonly EventEntryPort[] }
  | { readonly kind: 'settle-assistant'; readonly entry?: EventEntryPort }

/** A session's contiguous event window. */
export interface EventWindowPort {
  readonly entries: readonly EventEntryPort[]
  readonly revision: number
  readonly change: EventChangePort
}

/** A retained session. */
export interface SessionBindingPort {
  readonly sessionId: string
  readonly session: SessionFacePort
  readonly eventSource: ObservablePort<EventWindowPort>
}

/** Ownership of a session for as long as it is not released. */
export interface SessionReferencePort {
  readonly sessionId: string
  readonly ready: Promise<SessionBindingPort>
  release(): void
}

/** The session service. */
export interface SessionsPort {
  readonly list: ObservablePort<SessionListPort>
  create(options: { readonly cwd?: string }): Promise<string>
  retain(target: string, options: { readonly source: string }): SessionReferencePort
  scopeOf(context: unknown): string | undefined
}

/** A permission request forwarded from the Host. */
export interface ApprovalRequestPort {
  readonly toolName: string
  readonly callId?: string | undefined
  readonly reason?: string | undefined
  readonly signal?: AbortSignal | undefined
}

/** The Host answer to a permission request. */
export type ApprovalOutcomePort = 'allowed-once' | 'rejected'

/** A listener for forwarded Host waterfalls; `this` is the Agent-scoped context that raised the event. */
export type ApprovalListenerPort = (
  this: unknown,
  request: ApprovalRequestPort,
  next: () => Promise<ApprovalOutcomePort>,
) => Promise<ApprovalOutcomePort>

/** The model catalog fields the terminal reads. */
export interface ModelCatalogPort {
  readonly default: { readonly provider: string; readonly model: string }
  readonly groups: readonly {
    readonly id: string
    readonly name: string
    readonly models: readonly { readonly id: string; readonly name: string }[]
  }[]
}

/** The `session` Remote namespace calls the terminal makes. */
export interface SessionRemotePort {
  modelCatalog(): Promise<RemoteResultPort<ModelCatalogPort>>
  selectModel(request: {
    readonly sessionId: string
    readonly provider: string
    readonly model: string
  }): Promise<RemoteResultPort<{ readonly selected: { readonly provider: string; readonly model: string } }>>
  setDefaultModel(request: {
    readonly provider: string
    readonly model: string
  }): Promise<RemoteResultPort<unknown>>
}

/** A model a provider disclosed when asked. */
export interface DiscoveredModelPort {
  readonly id: string
  readonly name?: string | undefined
  readonly contextWindow?: number | undefined
  readonly maxTokens?: number | undefined
  readonly inputModalities?: readonly string[] | undefined
  readonly pricing?: {
    readonly input: number
    readonly output: number
    readonly cacheRead?: number | undefined
    readonly cacheWrite?: number | undefined
  } | undefined
}

/** The `llm` Remote namespace calls the terminal makes. */
export interface LlmRemotePort {
  listProviders(): Promise<RemoteResultPort<readonly { readonly id: string; readonly name: string }[]>>
  listConfigurableProviders(): Promise<RemoteResultPort<readonly {
    readonly provider: string
    readonly displayName: string
    readonly settingsNs: string
    readonly settingsPath: readonly string[]
    readonly declared?: boolean | undefined
    readonly error?: string | undefined
  }[]>>
  discoverModels(settingsNs: string, request: {
    readonly provider?: string
    readonly baseURL?: string
    readonly api?: string
    readonly apiKey?: string
    readonly live?: boolean
  }): Promise<RemoteResultPort<readonly DiscoveredModelPort[]>>
}

/** What the Host knows about one credential reference; never the value. */
export interface CredentialInfoPort {
  readonly configured: boolean
  readonly writable: boolean
}

/** The `credentials` Remote namespace. */
export interface CredentialsRemotePort {
  describe(refs: readonly string[]): Promise<RemoteResultPort<Readonly<Record<string, CredentialInfoPort>>>>
  set(ref: string, value: string): Promise<RemoteResultPort<unknown>>
  unset(ref: string): Promise<RemoteResultPort<unknown>>
}

/** One settings namespace as the Host describes it, without secret values. */
export interface SettingsNamespacePort {
  readonly ns: string
  /** The namespace's schema in the form `schema.toJSON()` returns. */
  readonly schema: unknown
  /** The effective value after every layer. */
  readonly value: unknown
  /** The part of the value stored in the user layer. */
  readonly user?: unknown
  /** The value the layers below the user layer give. */
  readonly base?: unknown
  readonly secrets: readonly { readonly path: readonly string[]; readonly set: boolean }[]
  readonly revision: number
}

/** An edit to one namespace's user layer. */
export type SettingsOpPort =
  | { readonly op: 'set'; readonly path: readonly string[]; readonly value: unknown }
  | { readonly op: 'unset'; readonly path: readonly string[] }

/** The `settings` Remote namespace. */
export interface SettingsRemotePort {
  describe(): Promise<RemoteResultPort<{ readonly writable: boolean; readonly namespaces: readonly SettingsNamespacePort[] }>>
  update(
    ns: string,
    patch: Readonly<Record<string, unknown>>,
    expectedRevision: number | undefined,
  ): Promise<RemoteResultPort<SettingsNamespacePort>>
  mutate(
    ns: string,
    ops: readonly SettingsOpPort[],
    expectedRevision: number | undefined,
  ): Promise<RemoteResultPort<SettingsNamespacePort>>
  openSettingsDocument(): Promise<RemoteResultPort<{ readonly opened: true }>>
}

/** The `web` Remote namespace. */
export interface WebRemotePort {
  searchProviders(): Promise<RemoteResultPort<readonly { readonly id: string; readonly credentialRef: string }[]>>
  checkSearchKey(providerId: string, apiKey: string): Promise<RemoteResultPort<
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: 'auth' | 'quota' | 'error'; readonly message: string }
  >>
}

/** One bundle of plugins the profile installs or the installation supplies. */
export interface BundlePort {
  readonly name: string
  readonly version?: string | undefined
  readonly description?: string | undefined
  readonly enabled: boolean
  readonly installed: boolean
  readonly optional: boolean
  readonly removable: boolean
  readonly readOnlyReason?: string | undefined
  readonly error?: { readonly code: string; readonly diagnostic?: string | undefined } | undefined
}

/** One plugin entry of the running profile. */
export interface PluginPort {
  readonly entryId: string
  readonly moduleName: string
  readonly enabled: boolean
  readonly readOnlyReason?: string | undefined
}

/** How a plugin change ended. */
export interface ChangeResultPort {
  readonly changed: boolean
  readonly application: 'applied' | 'restart-required' | 'overridden' | 'failed' | 'cancelled'
  readonly target: string
  readonly error?: { readonly code: string; readonly diagnostic?: string | undefined } | undefined
  readonly warnings?: readonly string[] | undefined
  readonly pendingBuilds?: readonly string[] | undefined
}

/** What a package spec names, read before installing it. */
export type SpecInspectionPort =
  | {
    readonly status: 'accepted'
    readonly kind: string
    readonly name?: string | undefined
    readonly version?: string | undefined
    readonly description?: string | undefined
    readonly bundle: boolean | null
  }
  | { readonly status: 'refused'; readonly problem: string; readonly reason: string }

/** The `pluginManager` Remote namespace. */
export interface PluginManagerRemotePort {
  listBundles(): Promise<RemoteResultPort<readonly BundlePort[]>>
  listPlugins(): Promise<RemoteResultPort<readonly PluginPort[]>>
  inspect(spec: string): Promise<RemoteResultPort<SpecInspectionPort>>
  setBundleEnabled(name: string, enabled: boolean): Promise<RemoteResultPort<ChangeResultPort>>
  setPluginEnabled(id: string, enabled: boolean): Promise<RemoteResultPort<ChangeResultPort>>
  installBundle(spec: string, options?: { readonly enabled?: boolean }): Promise<RemoteResultPort<ChangeResultPort>>
  removeBundle(name: string): Promise<RemoteResultPort<ChangeResultPort>>
}

/** One agent preset, including the ones defined as Markdown files. */
export interface AgentPresetPort {
  readonly id: string
  readonly name?: string | undefined
  readonly description?: string | undefined
  readonly isDefault: boolean
  readonly broken?: string | undefined
}

/** The `agentPresets` Remote namespace. */
export interface AgentPresetsRemotePort {
  list(): Promise<RemoteResultPort<{ readonly presets: readonly AgentPresetPort[] }>>
  read(agentPreset: string): Promise<RemoteResultPort<{ readonly content: string }>>
  select(sessionId: string, agentPreset: string): Promise<RemoteResultPort<unknown>>
}

/** One permission preset a session can run under. */
export interface PermissionOptionPort {
  readonly value: string
  readonly name: string
  readonly description?: string | undefined
}

/** The `permissionPresets` Remote namespace. */
export interface PermissionPresetsRemotePort {
  catalog(): Promise<RemoteResultPort<{
    readonly options: readonly PermissionOptionPort[]
    readonly defaultOptions: readonly PermissionOptionPort[]
    readonly defaultPreset: string
  }>>
}

/** Forwarded Host events and Remote calls. */
export interface RemotePort {
  readonly session: SessionRemotePort
  readonly llm: LlmRemotePort
  readonly credentials: CredentialsRemotePort
  readonly settings: SettingsRemotePort
  readonly web: WebRemotePort
  readonly pluginManager: PluginManagerRemotePort
  readonly agentPresets: AgentPresetsRemotePort
  readonly permissionPresets: PermissionPresetsRemotePort
  $on(event: 'approval/request', listener: ApprovalListenerPort): () => void
}

/** The services of the client tree. */
export interface ClientServicesPort {
  readonly sessions: SessionsPort
  readonly remote: RemotePort
}

/** Result of asking the person for a decision. */
export type ApprovalDecision = ApprovalChoice
