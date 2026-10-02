// @vitest-environment jsdom
/** First-run, model-agnostic provider prompt behavior over the shared Models join. */
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Schema from '@deepseek-ai/schemastery'
import type { SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { bindSnapshotSelector, RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { ProviderOnboardingDialog } from '../src/client/ProviderOnboardingDialog.tsx'
import type { ProviderOnboardingDialogProps } from '../src/client/ProviderOnboardingDialog.tsx'
import { SettingsDescribeMirror } from '@deepseek-ai/dsh-client-ui-settings/src/client/settings-mirror.ts'
import { ModelsSettingsStore } from '../src/client/store.ts'
import { createModelsOperations } from '../src/client/operations.ts'
import { LOCAL_PROVIDER_TEMPLATES } from '../src/client/provider-templates.ts'
import { en } from '../src/client/locales.ts'
import { settingsSchema } from './settings-schema.client.ts'

// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

afterEach(() => {
  cleanup()
  document.getElementById('root')?.remove()
})

/** Credentials/settings answers over the Remote carrier, which has no envelope. */
function remoteOk<T>(value: T) {
  return { ok: true as const, value }
}
function remoteFail(message: string) {
  return { ok: false as const, error: new RemoteError('gateway/internal', message, {}) }
}

const PiAiConfig = Schema.object({
  providers: Schema.dict(Schema.object({
    apiKeyEnv: Schema.string().role('credential-ref'),
    baseURL: Schema.string(),
    api: Schema.union(['openai-completions', 'openai-responses', 'anthropic-messages']),
    headers: Schema.dict(Schema.string()),
  })),
})

function piAiNamespace(providers: Record<string, JsonValue>): SettingsNamespaceView {
  const value = { providers }
  return {
    ns: 'llm-pi-ai',
    schema: JSON.parse(JSON.stringify(PiAiConfig.toJSON())) as JsonValue,
    value,
    base: {},
    user: value,
    autoGenerate: true, applies: 'live',
    secrets: [],
    revision: 0,
  }
}

type AttentionSnapshot = Parameters<Parameters<ProviderOnboardingDialogProps['useSessionStatus']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionStatus: ProviderOnboardingDialogProps['useSessionStatus'] = selector => selector(noAttention)

function harness(options: {
  usableProvider?: boolean
  settingsWritable?: boolean
  providersFailure?: string
  namespacePresent?: boolean
  catalog?: readonly { provider: string; displayName: string }[]
} = {}) {
  if (document.getElementById('root') === null) {
    const appRoot = document.createElement('div')
    appRoot.id = 'root'
    document.body.append(appRoot)
  }
  const namespacePresent = options.namespacePresent ?? true
  // Mutable so a test can flip this after the initial render, the way an
  // external credential/settings invalidation would.
  let usable = options.usableProvider ?? false
  const face = {
    llm: {
      listProviders: () => options.providersFailure !== undefined
        ? Promise.resolve(remoteFail(options.providersFailure))
        : Promise.resolve(remoteOk(usable ? [{ id: 'openai', name: 'openai' }] : [])),
      listConfigurableProviders: () => Promise.resolve(remoteOk(
        usable
          ? [{ provider: 'openai', displayName: 'openai', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openai'] }]
          : (options.catalog ?? []).map(entry => ({ ...entry, settingsNs: 'llm-pi-ai', settingsPath: ['providers', entry.provider] })),
      )),
      discoverModels: () => Promise.resolve(remoteOk([])),
    },
    settings: {
      describe: () => {
        const namespaceProviders: Record<string, JsonValue> = usable
          ? { openai: { apiKeyEnv: 'OPENAI_API_KEY', baseURL: 'https://api.openai.com/v1', api: 'openai-completions' } }
          : {}
        const namespaces = namespacePresent ? [piAiNamespace(namespaceProviders)] : []
        return Promise.resolve(remoteOk({
          writable: options.settingsWritable ?? true,
          hasDocument: false,
          namespaces,
        }))
      },
      mutate: vi.fn(() => Promise.resolve(remoteOk(undefined))),
    },
    credentials: {
      describe: (refs: string[]) => Promise.resolve(remoteOk(
        Object.fromEntries(refs.map(ref => [ref, { configured: usable, writable: true }])),
      )),
      set: vi.fn(() => Promise.resolve(remoteOk(undefined))),
    },
  }
  // The page plugin's context, scripted down to the namespaces it reaches.
  const ctx = { remote: face } as never
  const operations = createModelsOperations(ctx)
  const controller = new ModelsSettingsStore(ctx, settingsSchema, new SettingsDescribeMirror(ctx))
  const openSection = vi.fn()
  const complete = vi.fn()
  const unusedHook = (() => { throw new Error('unused standard hook') }) as never
  const props: ProviderOnboardingDialogProps = {
    stepId: 'provider-onboarding',
    complete,
    openSection,
    useSessions: unusedHook,
    useSessionStatus,
    usePanelInfo, useSessionRetainInfo: () => undefined, useResource,
    useWorkspaces: unusedHook,
    controller,
    useModels: bindSnapshotSelector(controller.store),
    operations,
    schema: settingsSchema,
    t: key => en[key],
  }
  return {
    controller, complete, openSection, props,
    mutate: face.settings.mutate, set: face.credentials.set,
    makeUsable: () => { usable = true },
  }
}

describe('ProviderOnboardingDialog', () => {
  it('renders when the shell root is absent', async () => {
    const h = harness()
    document.getElementById('root')!.remove()
    render(<ProviderOnboardingDialog {...h.props} />)
    expect(await screen.findByRole('dialog', { name: en.onboardingTitle })).toBeTruthy()
  })

  it('offers the local-server templates and the custom-provider button, inerting the product', async () => {
    const h = harness()
    render(<ProviderOnboardingDialog {...h.props} />)
    expect(await screen.findByRole('dialog', { name: en.onboardingTitle })).toBeTruthy()
    expect(document.getElementById('root')?.inert).toBe(true)
    expect(screen.getByText(en.onboardingDescription)).toBeTruthy()
    for (const template of LOCAL_PROVIDER_TEMPLATES) {
      expect(screen.getByRole('button', { name: template.displayName })).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: en.addCustom })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.onboardingLater })).toBeTruthy()
  })

  it('leads with the catalog: no provider preselected, alphabetical, key form after a pick', async () => {
    const h = harness({ catalog: [
      { provider: 'zeta', displayName: 'Zeta AI' },
      { provider: 'acme', displayName: 'Acme Models' },
    ] })
    render(<ProviderOnboardingDialog {...h.props} />)
    const select = await screen.findByRole<HTMLSelectElement>('combobox', { name: en.provider })
    expect(select.value).toBe('')
    expect([...select.options].map(option => option.text)).toEqual([en.onboardingChooseProvider, 'Acme Models', 'Zeta AI'])
    expect(screen.getByText(en.onboardingAlternatives)).toBeTruthy()
    fireEvent.change(select, { target: { value: 'acme' } })
    expect(select.value).toBe('acme')
    expect(await screen.findByRole('button', { name: en.cancel })).toBeTruthy()
  })

  it('hides the templates and the custom-provider button when no declarable namespace exists', async () => {
    const h = harness({ namespacePresent: false })
    render(<ProviderOnboardingDialog {...h.props} />)
    await screen.findByRole('dialog')
    for (const template of LOCAL_PROVIDER_TEMPLATES) {
      expect(screen.queryByRole('button', { name: template.displayName })).toBeNull()
    }
    expect(screen.queryByRole('button', { name: en.addCustom })).toBeNull()
    expect(screen.getByRole('button', { name: en.onboardingLater })).toBeTruthy()
  })

  it('cannot be dismissed implicitly and restores the previous inert state', async () => {
    const h = harness()
    const appRoot = document.getElementById('root')!
    appRoot.inert = true
    const view = render(<ProviderOnboardingDialog {...h.props} />)
    await screen.findByRole('dialog')

    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(document.querySelector('[class*="mask"]')!)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(h.complete).not.toHaveBeenCalled()

    view.unmount()
    expect(appRoot.inert).toBe(true)
  })

  it('opens the custom-provider card pre-filled from a chosen local template', async () => {
    const h = harness()
    render(<ProviderOnboardingDialog {...h.props} />)
    await screen.findByRole('dialog')
    const template = LOCAL_PROVIDER_TEMPLATES[0]!
    fireEvent.click(screen.getByRole('button', { name: template.displayName }))
    expect(await screen.findByLabelText(en.customRoute)).toBeTruthy()
    expect(screen.getByLabelText<HTMLInputElement>(en.customRoute).value).toBe(template.route)
    expect(screen.getByLabelText<HTMLInputElement>(en.baseUrl).value).toBe(template.baseURL)
    expect(h.complete).not.toHaveBeenCalled()
  })

  it('opens a blank custom-provider card from the custom-provider button', async () => {
    const h = harness()
    render(<ProviderOnboardingDialog {...h.props} />)
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: en.addCustom }))
    expect(await screen.findByLabelText(en.customRoute)).toBeTruthy()
    expect(screen.getByLabelText<HTMLInputElement>(en.customRoute).value).toBe('')
    expect(screen.getByLabelText<HTMLInputElement>(en.baseUrl).value).toBe('')
  })

  it('returns to the picker on cancel without completing the step', async () => {
    const h = harness()
    render(<ProviderOnboardingDialog {...h.props} />)
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: en.addCustom }))
    await screen.findByLabelText(en.customRoute)
    fireEvent.click(screen.getByRole('button', { name: en.cancel }))
    expect(await screen.findByRole('button', { name: en.addCustom })).toBeTruthy()
    expect(h.complete).toHaveBeenCalledOnce()
  })

  it('completes immediately once any provider is already usable', async () => {
    const h = harness({ usableProvider: true })
    const view = render(<ProviderOnboardingDialog {...h.props} />)
    await act(async () => { await h.controller.load() })
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => { expect(h.complete).toHaveBeenCalledOnce() })
    expect(h.openSection).not.toHaveBeenCalled()
    view.unmount()
  })

  it('does not block the product when the provider directory fails to load', async () => {
    const h = harness({ providersFailure: 'the provider directory is unavailable' })
    const view = render(<ProviderOnboardingDialog {...h.props} />)
    await act(async () => { await h.controller.load() })
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => { expect(h.complete).toHaveBeenCalledOnce() })
    view.unmount()
  })

  it('does not block the product when settings are read-only with no usable provider', async () => {
    const h = harness({ settingsWritable: false })
    const view = render(<ProviderOnboardingDialog {...h.props} />)
    await act(async () => { await h.controller.load() })
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => { expect(h.complete).toHaveBeenCalledOnce() })
    view.unmount()
  })

  it('allows configure-later dismissal without opening settings', async () => {
    const h = harness()
    render(<ProviderOnboardingDialog {...h.props} />)
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: en.onboardingLater }))
    expect(h.complete).toHaveBeenCalledOnce()
    expect(h.openSection).not.toHaveBeenCalled()
    expect(h.set).not.toHaveBeenCalled()
    expect(h.mutate).not.toHaveBeenCalled()
  })

  it('closes when an external invalidation makes a provider usable', async () => {
    const h = harness()
    render(<ProviderOnboardingDialog {...h.props} />)
    await screen.findByRole('dialog')
    h.makeUsable()
    await act(async () => { await h.controller.load() })
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    expect(h.complete).toHaveBeenCalledOnce()
  })
})
