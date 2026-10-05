/**
 * The web-search page's staged form: which search provider the `web`
 * namespace pins, and that provider's API key.
 *
 * The key never lives in the section: its literal never rides a response, so
 * the page learns only whether one is configured and writes it through the
 * credentials domain, under the reference the Host lists for the provider.
 * Before anything is written, a staged key is checked against the provider by
 * the Host, so a rejected key is reported and never stored.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote merge into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  SettingsFormModel, settingsTextField,
  type SettingsFieldState, type SettingsFormActions, type SettingsFormScope, type SettingsFormShell,
} from '@deepseek-ai/dsh-client-ui-primitives'

/**
 * Namespace of the web service, whose volatile `searchProvider` pins the
 * provider. Spelled here rather than imported: a client package must not
 * depend on a Host package.
 */
export const WEB_NS = 'web'

/** Form field the provider choice stages under. */
const PROVIDER_FIELD = 'searchProvider'

/** Form field the credential control stages under. */
const API_KEY_FIELD = 'apiKey'

/** The `web` section fields this page edits. */
export interface WebSearchSettings {
  /** Pinned search provider id; absent lets the service auto-select. */
  searchProvider?: string
}

/** One provider the page offers. */
export interface WebSearchProviderOption {
  /** Provider id the choice writes. */
  id: string
  /** Credential reference its key is written to. */
  credentialRef: string
  /** Whether the Host reports a key configured for it. */
  configured: boolean
  /** Whether `credentials/set` can affect it; false disables the key control. */
  writable: boolean
}

/**
 * Where the last save stopped, as the page reports it. `missing` is a choice
 * saved without a key the provider has; `auth`, `quota`, and `error` are the
 * Host's verdict on a staged key, with the provider's message.
 */
export type WebSearchKeyStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'missing' }
  | { kind: 'auth' | 'quota' | 'error'; message: string }

/** What the web-search page renders. */
export interface WebSearchCardState extends SettingsFormShell {
  /** Providers the Host lists, in its order. */
  providers: WebSearchProviderOption[]
  /** The staged or stored provider choice; empty while none is pinned. */
  provider: SettingsFieldState
  /** The staged key, which starts blank on every load. */
  apiKey: SettingsFieldState
  /** The last key check or save refusal. */
  keyStatus: WebSearchKeyStatus
}

/** The registration-side face the web-search page's slot entry injects. */
export interface WebSearchCardFace extends SettingsFormActions {
  hooks: {
    /** Page snapshot bound by the renderer as useWebSearchCard. */
    webSearchCard: SnapshotStore<WebSearchCardState>
  }
}

/** Bridges the `web` scope, the provider list, and the credentials domain onto the page. */
export class WebSearchCardController {
  private readonly form: SettingsFormModel<WebSearchSettings>
  private readonly store: SnapshotStore<WebSearchCardState>
  private providers: WebSearchProviderOption[] = []
  private keyStatus: WebSearchKeyStatus = { kind: 'idle' }

  /**
   * @param scope - the bound settings scope for the `web` namespace.
   * @param ctx - the page plugin's context, whose `remote.web` lists providers
   * and checks keys, and whose `remote.credentials` stores and describes them.
   */
  constructor(scope: SettingsFormScope<WebSearchSettings>, private readonly ctx: ClientContext) {
    this.form = new SettingsFormModel(
      scope,
      [settingsTextField(PROVIDER_FIELD)],
      [{ field: API_KEY_FIELD, write: text => this.writeKey(text) }],
    )
    this.store = this.form.bind(() => this.projection())
    void this.readProviders()
  }

  private projection(): WebSearchCardState {
    return {
      ...this.form.shell(),
      providers: this.providers,
      provider: this.form.field(PROVIDER_FIELD),
      apiKey: this.form.field(API_KEY_FIELD),
      keyStatus: this.keyStatus,
    }
  }

  private publish(): void { this.store.set(this.projection()) }

  /** The provider the form currently names, staged or stored. */
  private selected(): WebSearchProviderOption | undefined {
    const id = this.form.field(PROVIDER_FIELD).text
    return this.providers.find(provider => provider.id === id)
  }

  /** Ask the Host which providers take a key, then which keys exist. */
  private async readProviders(): Promise<void> {
    const response = await this.ctx.remote.web.searchProviders()
    if (!response.ok) return
    this.providers = response.value.map(info => ({ ...info, configured: false, writable: true }))
    this.publish()
    await this.readCredentials()
  }

  /** Re-read every listed provider's key state. */
  private async readCredentials(): Promise<void> {
    if (this.providers.length === 0) return
    const response = await this.ctx.remote.credentials.describe(this.providers.map(provider => provider.credentialRef))
    if (!response.ok) return
    this.providers = this.providers.map((provider) => {
      const view = response.value[provider.credentialRef]
      // An unknown reference stays writable: the Host is what refuses, rather
      // than the page guessing a refusal.
      return { ...provider, configured: view?.configured ?? false, writable: view?.writable ?? true }
    })
    this.publish()
  }

  /**
   * Re-read after the Host reports a change to a reference a provider uses.
   * A key can be written from somewhere else, and no settings section changes
   * when it is.
   * @param ref - the reference the Host reports as changed.
   */
  refreshCredential(ref: string): void {
    if (this.providers.some(provider => provider.credentialRef === ref)) void this.readCredentials()
  }

  /**
   * Build the face the page's slot registration injects. Choosing another
   * provider drops a key typed for the previous one, and any edit clears the
   * last verdict.
   * @returns the page's snapshot and its form actions.
   */
  inject(): WebSearchCardFace {
    const actions = this.form.actions()
    return {
      hooks: { webSearchCard: this.store },
      ...actions,
      edit: (field, text) => {
        this.keyStatus = { kind: 'idle' }
        if (field === PROVIDER_FIELD && text !== this.form.field(PROVIDER_FIELD).text) actions.edit(API_KEY_FIELD, '')
        actions.edit(field, text)
      },
      save: () => { void this.save() },
      discard: () => {
        this.keyStatus = { kind: 'idle' }
        actions.discard()
      },
    }
  }

  /**
   * Check a staged key with the Host, then write the choice and the key. A key
   * the provider rejects, or a choice without any key, stops the save with
   * nothing written; a key accepted with no quota left is saved and reported.
   * @returns settlement after the check and every write.
   */
  async save(): Promise<void> {
    const provider = this.selected()
    const key = this.form.field(API_KEY_FIELD).text.trim()
    if (provider !== undefined && key.length > 0) {
      this.keyStatus = { kind: 'checking' }
      this.publish()
      const response = await this.ctx.remote.web.checkSearchKey(provider.id, key)
      const check = response.ok ? response.value : { ok: false as const, reason: 'error' as const, message: response.error.message }
      if (!check.ok && check.reason !== 'quota') {
        this.keyStatus = { kind: check.reason, message: check.message }
        this.publish()
        return
      }
      this.keyStatus = check.ok ? { kind: 'idle' } : { kind: 'quota', message: check.message }
    } else if (provider !== undefined && !provider.configured) {
      this.keyStatus = { kind: 'missing' }
      this.publish()
      return
    }
    await this.form.save()
  }

  /**
   * Write the staged key for the chosen provider, then re-read whether the Host now holds one.
   * @param value - the staged credential literal.
   * @returns whether the Host reports a configured credential afterwards.
   */
  private async writeKey(value: string): Promise<boolean> {
    const provider = this.selected()
    if (provider === undefined) return false
    // Refusals surface through the re-read below: the Host is the only
    // authority on whether the key now exists.
    await this.ctx.remote.credentials.set(provider.credentialRef, value)
    await this.readCredentials()
    return this.providers.find(candidate => candidate.id === provider.id)?.configured ?? false
  }

  /** Release configuration subscriptions. */
  dispose(): void { this.form.dispose() }
}
