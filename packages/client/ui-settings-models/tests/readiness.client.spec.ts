/** Pure first-run readiness projection over the shared Models join. */
import { describe, expect, it } from 'vitest'
import type { CredentialInfo } from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelsSettingsState, ProviderRow } from '../src/client/store.ts'
import { onboardingReadiness, providerUsable } from '../src/client/store.ts'

const missingCredential: CredentialInfo = { configured: false, writable: true }

function row(overrides: Partial<ProviderRow> = {}): ProviderRow {
  return {
    entry: {
      provider: 'deepseek-official',
      displayName: 'DeepSeek',
      settingsNs: 'llm-deepseek',
      settingsPath: [],
      active: true,
    },
    configured: true,
    removable: false,
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    credential: missingCredential,
    ...overrides,
  }
}

/** A second provider the user configured themselves. */
function otherRow(overrides: Partial<ProviderRow> = {}): ProviderRow {
  return {
    entry: {
      provider: 'hfai',
      displayName: 'HFAI',
      settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'hfai'],
      active: true,
    },
    configured: true,
    removable: true,
    apiKeyEnv: 'HFAI_API_KEY',
    credential: { configured: true, source: 'file', writable: true },
    ...overrides,
  }
}

function state(overrides: Partial<ModelsSettingsState> = {}): ModelsSettingsState {
  return {
    status: 'ready',
    error: null,
    credentialError: null,
    writable: true,
    rows: [row()],
    namespaces: new Map(),
    ...overrides,
  }
}

describe('providerUsable', () => {
  it('requires a registered route and a stored key for every named reference', () => {
    expect(providerUsable(otherRow())).toBe(true)
    expect(providerUsable(otherRow({ entry: { ...otherRow().entry, active: false } }))).toBe(false)
    expect(providerUsable(otherRow({ credential: missingCredential }))).toBe(false)
    expect(providerUsable(otherRow({ credential: undefined }))).toBe(false)
  })

  it('treats a reference-free registered route as provider-native authentication', () => {
    expect(providerUsable(otherRow({ apiKeyEnv: undefined, credential: undefined }))).toBe(true)
  })
})

describe('onboardingReadiness', () => {
  it('waits for the first join before the row list settles', () => {
    expect(onboardingReadiness(state({ status: 'idle', rows: [] }))).toEqual({ kind: 'loading' })
    expect(onboardingReadiness(state({ status: 'loading', rows: [] }))).toEqual({ kind: 'loading' })
  })

  it('offers the provider picker, model-agnostically, once nothing is usable yet', () => {
    expect(onboardingReadiness(state({ rows: [] }))).toEqual({ kind: 'choose-provider' })
    expect(onboardingReadiness(state())).toEqual({ kind: 'choose-provider' })
    // A provider the user cannot reach yet leaves the picker in place.
    expect(onboardingReadiness(state({
      rows: [row(), otherRow({ credential: missingCredential })],
    }))).toEqual({ kind: 'choose-provider' })
  })

  it('ends onboarding once any registered provider can serve requests, no route preferred', () => {
    expect(onboardingReadiness(state({ rows: [row(), otherRow()] }))).toEqual({ kind: 'provider-ready' })
    expect(onboardingReadiness(state({ rows: [otherRow()] }))).toEqual({ kind: 'provider-ready' })
  })

  it('accepts file and process-environment credentials without prompting', () => {
    expect(onboardingReadiness(state({
      rows: [row({ credential: { configured: true, source: 'file', writable: true } })],
    }))).toEqual({ kind: 'provider-ready' })
    expect(onboardingReadiness(state({
      rows: [row({ credential: { configured: true, source: 'env', writable: false } })],
    }))).toEqual({ kind: 'provider-ready' })
  })

  it('turns missing capabilities into diagnostics that never block the product', () => {
    expect(onboardingReadiness(state({ status: 'error', error: 'settings down' }))).toEqual({
      kind: 'unavailable',
      reason: 'load-failed',
    })
    expect(onboardingReadiness(state({ writable: false }))).toEqual({
      kind: 'unavailable',
      reason: 'settings-read-only',
    })
    // A writable settings document with an unreachable provider still offers
    // the picker rather than reporting unavailable: the user can configure a
    // different provider from it.
    expect(onboardingReadiness(state({
      rows: [row({ entry: { ...row().entry, active: false } })],
    }))).toEqual({ kind: 'choose-provider' })
  })
})
