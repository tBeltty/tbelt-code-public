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
import { OnboardingProviderSetup } from '../src/client/OnboardingProviderSetup.tsx'
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

const DeepSeekConfig = Schema.object({
  profiles: Schema.dict(Schema.object({
    apiKeyEnv: Schema.string().role('credential-ref'),
    baseURL: Schema.string(),
  })),
})

/** A non-pi-ai namespace with no stored profile, so its catalog route is set up through the provider editor. */
const deepSeekNamespace: SettingsNamespaceView = {
  ns: 'llm-deepseek',
  schema: JSON.parse(JSON.stringify(DeepSeekConfig.toJSON())) as JsonValue,
  value: { profiles: {} },
  base: {},
  user: {},
  autoGenerate: true, applies: 'live',
  secrets: [],
  revision: 0,
}

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
  catalog?: readonly { provider: string; displayName: string; settingsNs?: string; settingsPath?: string[] }[]
  /** Namespaces described beside llm-pi-ai. */
  extraNamespaces?: readonly SettingsNamespaceView[]
  discovery?: ReturnType<typeof remoteOk<{ id: string; name?: string }[]>> | { ok: false; error: RemoteError }
  writeFailure?: RemoteError
  credentialFailure?: string
  defaultModelFailure?: string
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
          : (options.catalog ?? []).map(entry => ({
            settingsNs: 'llm-pi-ai', settingsPath: ['providers', entry.provider], ...entry,
          })),
      )),
      discoverModels: vi.fn((_ns: string, _request: Record<string, unknown>) => Promise.resolve(
        options.discovery ?? remoteOk([] as { id: string; name?: string }[]),
      )),
    },
    settings: {
      describe: () => {
        const namespaceProviders: Record<string, JsonValue> = usable
          ? { openai: { apiKeyEnv: 'OPENAI_API_KEY', baseURL: 'https://api.openai.com/v1', api: 'openai-completions' } }
          : {}
        const namespaces = [
          ...namespacePresent ? [piAiNamespace(namespaceProviders)] : [],
          ...options.extraNamespaces ?? [],
        ]
        return Promise.resolve(remoteOk({
          writable: options.settingsWritable ?? true,
          hasDocument: false,
          namespaces,
        }))
      },
      mutate: vi.fn((_ns: string, _ops: unknown[], _revision: number) => Promise.resolve(
        options.writeFailure === undefined ? remoteOk(undefined) : { ok: false as const, error: options.writeFailure },
      )),
    },
    credentials: {
      describe: (refs: string[]) => Promise.resolve(remoteOk(
        Object.fromEntries(refs.map(ref => [ref, { configured: usable, writable: true }])),
      )),
      set: vi.fn((_ref: string, _value: string) => Promise.resolve(
        options.credentialFailure === undefined ? remoteOk(undefined) : remoteFail(options.credentialFailure),
      )),
    },
    session: {
      setDefaultModel: vi.fn((_request: { provider: string; model: string }) => Promise.resolve(
        options.defaultModelFailure === undefined ? remoteOk(undefined) : remoteFail(options.defaultModelFailure),
      )),
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
    discover: face.llm.discoverModels, setDefaultModel: face.session.setDefaultModel,
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

  it('lists every provider in one searchable list, catalog first and alphabetical, none picked', async () => {
    const h = harness({ catalog: [
      { provider: 'zeta', displayName: 'Zeta AI' },
      { provider: 'acme', displayName: 'Acme Models' },
    ] })
    render(<ProviderOnboardingDialog {...h.props} />)
    const list = await screen.findByRole('list', { name: en.provider })
    const names = [...list.querySelectorAll('button')].map(button => button.getAttribute('aria-label'))
    expect(names).toEqual([
      'Acme Models', 'Zeta AI', ...LOCAL_PROVIDER_TEMPLATES.map(template => template.displayName), en.addCustom,
    ])
    expect(list.querySelector('[aria-pressed="true"]')).toBeNull()

    const search = screen.getByRole('searchbox', { name: en.onboardingSearchProviders })
    fireEvent.change(search, { target: { value: 'ZETA' } })
    expect([...list.querySelectorAll('button')].map(button => button.getAttribute('aria-label'))).toEqual(['Zeta AI'])
    fireEvent.change(search, { target: { value: 'no such provider' } })
    expect(screen.getByText(en.onboardingNoProviders)).toBeTruthy()
    fireEvent.change(search, { target: { value: '' } })

    fireEvent.click(screen.getByRole('button', { name: 'Acme Models' }))
    expect(screen.getByRole('button', { name: 'Acme Models' }).getAttribute('aria-pressed')).toBe('true')
    expect(await screen.findByLabelText(en.keyInput)).toBeTruthy()
  })

  it('checks a typed key and lists its models below, none selected, then stores the choice', async () => {
    const h = harness({
      catalog: [{ provider: 'acme', displayName: 'Acme Models' }],
      discovery: remoteOk([{ id: 'acme-large' }, { id: 'acme-small' }]),
    })
    render(<ProviderOnboardingDialog {...h.props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Acme Models' }))
    fireEvent.change(await screen.findByLabelText(en.keyInput), { target: { value: ' sk-acme ' } })
    expect(screen.getByText(en.onboardingKeyChecking)).toBeTruthy()

    const small = await screen.findByRole('checkbox', { name: 'acme-small' })
    expect(h.discover).toHaveBeenCalledWith('llm-pi-ai', { provider: 'acme', apiKey: 'sk-acme', live: true })
    expect(screen.getAllByRole('checkbox').every(box => !(box as HTMLInputElement).checked)).toBe(true)
    const startButton = screen.getByRole('button', { name: en.onboardingStart })
    expect((startButton as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(en.onboardingPickModel)).toBeTruthy()

    fireEvent.click(small)
    expect((startButton as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(startButton)
    await waitFor(() => { expect(h.setDefaultModel).toHaveBeenCalledWith({ provider: 'acme', model: 'acme-small' }) })
    expect(h.mutate).toHaveBeenCalledWith('llm-pi-ai', [{
      op: 'set',
      path: ['providers', 'acme'],
      value: { apiKeyEnv: 'ACME_API_KEY', models: [{ id: 'acme-small' }] },
    }], 0)
    expect(h.set).toHaveBeenCalledWith('ACME_API_KEY', 'sk-acme')
  })

  it.each([
    ['INVALID_CREDENTIAL', en.onboardingKeyRejected],
    ['QUOTA', en.onboardingKeyQuota],
    [undefined, 'the endpoint is down'],
  ])('reports a key the provider refuses (%s) without listing models', async (code, shown) => {
    const h = harness({
      catalog: [{ provider: 'acme', displayName: 'Acme Models' }],
      discovery: {
        ok: false,
        error: new RemoteError('llm/model-discovery-rejected', 'the endpoint is down', {
          settingsNs: 'llm-pi-ai', ...code === undefined ? {} : { code },
        }),
      },
    })
    render(<ProviderOnboardingDialog {...h.props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Acme Models' }))
    fireEvent.change(await screen.findByLabelText(en.keyInput), { target: { value: 'sk-bad' } })
    expect((await screen.findByRole('alert')).textContent).toBe(shown)
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: en.onboardingStart })).toBeNull()
  })

  it('does not ask the provider about a key it can already refuse locally', async () => {
    const h = harness({ catalog: [{ provider: 'acme', displayName: 'Acme Models' }] })
    render(<ProviderOnboardingDialog {...h.props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Acme Models' }))
    fireEvent.change(await screen.findByLabelText(en.keyInput), { target: { value: 'sk\u00e9' } })
    await new Promise(resolve => setTimeout(resolve, 700))
    expect(h.discover).not.toHaveBeenCalled()
  })

  it('ignores a key check answered after the key changed', async () => {
    const h = harness({
      catalog: [{ provider: 'acme', displayName: 'Acme Models' }],
      discovery: remoteOk([{ id: 'acme-current' }]),
    })
    let answerStale: (models: { id: string }[]) => void = () => {}
    h.discover.mockImplementationOnce(() => new Promise((resolve) => {
      answerStale = (models) => { resolve(remoteOk(models)) }
    }))
    render(<ProviderOnboardingDialog {...h.props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Acme Models' }))
    const keyInput = await screen.findByLabelText(en.keyInput)
    fireEvent.change(keyInput, { target: { value: 'sk-old' } })
    await waitFor(() => { expect(h.discover).toHaveBeenCalledOnce() })

    fireEvent.change(keyInput, { target: { value: 'sk-new' } })
    await act(async () => { answerStale([{ id: 'acme-stale' }]) })
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByText(en.onboardingKeyChecking)).toBeTruthy()

    expect(await screen.findByRole('checkbox', { name: 'acme-current' })).toBeTruthy()
    expect(h.discover).toHaveBeenLastCalledWith('llm-pi-ai', { provider: 'acme', apiKey: 'sk-new', live: true })
    expect(screen.queryByRole('checkbox', { name: 'acme-stale' })).toBeNull()
  })

  it('filters the listed models by id or name and says when none match', async () => {
    const h = harness({
      catalog: [{ provider: 'acme', displayName: 'Acme Models' }],
      discovery: remoteOk([{ id: 'acme-large', name: 'Acme Large' }, { id: 'acme-small' }, { id: 'a-3', name: 'Turbo' }]),
    })
    render(<ProviderOnboardingDialog {...h.props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Acme Models' }))
    fireEvent.change(await screen.findByLabelText(en.keyInput), { target: { value: 'sk-acme' } })
    await screen.findByRole('checkbox', { name: 'acme-large' })
    const search = screen.getByRole('searchbox', { name: en.fetchSearch })
    const listed = (): string[] => screen.queryAllByRole('checkbox').map(box => box.parentElement?.textContent ?? '')

    fireEvent.change(search, { target: { value: 'SMALL' } })
    expect(listed()).toEqual(['acme-small'])
    fireEvent.change(search, { target: { value: 'turbo' } })
    expect(listed()).toEqual(['a-3'])
    fireEvent.change(search, { target: { value: 'nothing like it' } })
    expect(listed()).toEqual([])
    expect(screen.getByText(en.fetchNoMatches)).toBeTruthy()
  })

  it('unchecks a picked model, leaving nothing to start with', async () => {
    const h = harness({
      catalog: [{ provider: 'acme', displayName: 'Acme Models' }],
      discovery: remoteOk([{ id: 'acme-large' }]),
    })
    render(<ProviderOnboardingDialog {...h.props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Acme Models' }))
    fireEvent.change(await screen.findByLabelText(en.keyInput), { target: { value: 'sk-acme' } })
    const large = await screen.findByRole<HTMLInputElement>('checkbox', { name: 'acme-large' })
    const startButton = screen.getByRole<HTMLButtonElement>('button', { name: en.onboardingStart })

    fireEvent.click(large)
    expect(large.checked).toBe(true)
    expect(screen.getByText(`1 ${en.onboardingSelected}`)).toBeTruthy()
    fireEvent.click(large)
    expect(large.checked).toBe(false)
    expect(startButton.disabled).toBe(true)
    expect(screen.getByText(en.onboardingPickModel)).toBeTruthy()
  })

  it('says when the key can use no models and offers nothing to start', async () => {
    const h = harness({
      catalog: [{ provider: 'acme', displayName: 'Acme Models' }],
      discovery: remoteOk([]),
    })
    render(<ProviderOnboardingDialog {...h.props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Acme Models' }))
    fireEvent.change(await screen.findByLabelText(en.keyInput), { target: { value: 'sk-acme' } })
    expect(await screen.findByText(en.fetchEmpty)).toBeTruthy()
    expect(screen.queryByRole('searchbox', { name: en.fetchSearch })).toBeNull()
    expect(screen.queryByRole('button', { name: en.onboardingStart })).toBeNull()
  })

  /** Pick acme, type a key, choose its one listed model and start. */
  async function startWithAcme(h: ReturnType<typeof harness>): Promise<void> {
    render(<ProviderOnboardingDialog {...h.props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Acme Models' }))
    fireEvent.change(await screen.findByLabelText(en.keyInput), { target: { value: 'sk-acme' } })
    fireEvent.click(await screen.findByRole('checkbox', { name: 'acme-large' }))
    fireEvent.click(screen.getByRole('button', { name: en.onboardingStart }))
  }

  it('edits a profile the user already stores for the provider instead of replacing it', async () => {
    const h = harness({ discovery: remoteOk([{ id: 'acme-large' }]) })
    const onDone = vi.fn()
    render(
      <OnboardingProviderSetup
        provider="acme"
        namespace={piAiNamespace({ acme: { baseURL: 'https://acme.example/v1' } })}
        settingsPath={['providers', 'acme']}
        schema={settingsSchema}
        operations={h.props.operations}
        t={h.props.t}
        readOnly={false}
        setDefault
        submitLabelKey="onboardingStart"
        onDone={onDone}
      />,
    )
    fireEvent.change(screen.getByLabelText(en.keyInput), { target: { value: 'sk-acme' } })
    fireEvent.click(await screen.findByRole('checkbox', { name: 'acme-large' }))
    fireEvent.click(screen.getByRole('button', { name: en.onboardingStart }))
    await waitFor(() => { expect(onDone).toHaveBeenCalledOnce() })
    const ops = h.mutate.mock.calls[0]?.[1]
    expect(ops).toContainEqual({ op: 'set', path: ['providers', 'acme', 'apiKeyEnv'], value: 'ACME_API_KEY' })
    expect(ops).toContainEqual({ op: 'set', path: ['providers', 'acme', 'models'], value: [{ id: 'acme-large' }] })
    expect(ops?.some(op => JSON.stringify(op).includes('baseURL'))).toBe(false)
  })

  it.each([
    ['conflict', new RemoteError('settings/conflict', 'changed elsewhere', { ns: 'llm-pi-ai', expected: 0, actual: 1 }), en.conflict],
    ['rejection', new RemoteError('settings/rejected', 'the profile is invalid', { ns: 'llm-pi-ai' }), 'the profile is invalid'],
  ])('reports a profile write %s without storing the key', async (_kind, writeFailure, shown) => {
    const h = harness({
      catalog: [{ provider: 'acme', displayName: 'Acme Models' }],
      discovery: remoteOk([{ id: 'acme-large' }]),
      writeFailure,
    })
    await startWithAcme(h)
    expect((await screen.findByRole('alert')).textContent).toBe(shown)
    expect(h.set).not.toHaveBeenCalled()
    expect(h.setDefaultModel).not.toHaveBeenCalled()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: en.onboardingStart }).disabled).toBe(false)
  })

  it('reports a key the Host could not store and leaves the default model alone', async () => {
    const h = harness({
      catalog: [{ provider: 'acme', displayName: 'Acme Models' }],
      discovery: remoteOk([{ id: 'acme-large' }]),
      credentialFailure: 'the keychain is locked',
    })
    await startWithAcme(h)
    expect((await screen.findByRole('alert')).textContent).toBe('the keychain is locked')
    expect(h.mutate).toHaveBeenCalledOnce()
    expect(h.setDefaultModel).not.toHaveBeenCalled()
  })

  it('retries only the key after the Host refused it, and writes again for a changed model choice', async () => {
    const h = harness({
      catalog: [{ provider: 'acme', displayName: 'Acme Models' }],
      discovery: remoteOk([{ id: 'acme-large' }, { id: 'acme-small' }]),
      credentialFailure: 'the keychain is locked',
    })
    await startWithAcme(h)
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: en.onboardingStart }))
    await waitFor(() => { expect(h.set).toHaveBeenCalledTimes(2) })
    expect(h.mutate).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('checkbox', { name: 'acme-small' }))
    fireEvent.click(screen.getByRole('button', { name: en.onboardingStart }))
    await waitFor(() => { expect(h.mutate).toHaveBeenCalledTimes(2) })
  })

  it('finishes the setup even when the default model is refused', async () => {
    const h = harness({
      catalog: [{ provider: 'acme', displayName: 'Acme Models' }],
      discovery: remoteOk([{ id: 'acme-large' }]),
      defaultModelFailure: 'no session is open',
    })
    const load = vi.spyOn(h.controller, 'load')
    await startWithAcme(h)
    await waitFor(() => { expect(screen.queryByLabelText(en.keyInput)).toBeNull() })
    expect(h.setDefaultModel).toHaveBeenCalledOnce()
    expect(load).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('refuses a custom route a catalog provider uses and reloads once a custom provider is created', async () => {
    const h = harness({ catalog: [{ provider: 'acme', displayName: 'Acme Models' }] })
    render(<ProviderOnboardingDialog {...h.props} />)
    fireEvent.click(await screen.findByRole('button', { name: en.addCustom }))
    fireEvent.change(await screen.findByLabelText(en.customRoute), { target: { value: 'acme' } })
    expect(screen.getByText(en.customRouteTaken)).toBeTruthy()

    const load = vi.spyOn(h.controller, 'load')
    fireEvent.change(screen.getByLabelText(en.customRoute), { target: { value: 'acme-gateway' } })
    fireEvent.change(screen.getByLabelText(en.baseUrl), { target: { value: 'https://gateway.example/v1' } })
    fireEvent.change(screen.getByLabelText(en.keyInput), { target: { value: 'gw-key' } })
    fireEvent.click(screen.getByRole('button', { name: en.addModel }))
    fireEvent.change(screen.getByLabelText(`${en.modelId} 1`), { target: { value: 'gw-model' } })
    fireEvent.click(screen.getByText(en.create))

    await waitFor(() => { expect(load).toHaveBeenCalled() })
    expect(h.setDefaultModel).toHaveBeenCalledWith({ provider: 'acme-gateway', model: 'gw-model' })
    expect(await screen.findByRole('button', { name: en.addCustom })).toBeTruthy()
    expect(h.complete).not.toHaveBeenCalled()
  })

  it('sets up a catalog route of another namespace in the provider editor, skipping routes with no namespace', async () => {
    const h = harness({
      catalog: [
        { provider: 'deepseek-eu', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: ['profiles', 'deepseek-eu'] },
        { provider: 'ghost', displayName: 'Ghost', settingsNs: 'llm-ghost', settingsPath: [] },
      ],
      extraNamespaces: [deepSeekNamespace],
    })
    render(<ProviderOnboardingDialog {...h.props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'DeepSeek' }))
    expect(screen.queryByRole('button', { name: 'Ghost' })).toBeNull()
    const load = vi.spyOn(h.controller, 'load')

    fireEvent.click(await screen.findByRole('button', { name: en.cancel }))
    expect(screen.queryByLabelText(en.keyInput)).toBeNull()
    expect(screen.getByRole('button', { name: 'DeepSeek' }).getAttribute('aria-pressed')).toBe('false')
    expect(load).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'DeepSeek' }))
    fireEvent.change(await screen.findByLabelText(en.keyInput), { target: { value: 'sk-deepseek' } })
    fireEvent.click(screen.getByRole('button', { name: en.apply }))
    await waitFor(() => { expect(load).toHaveBeenCalled() })
    expect(h.set).toHaveBeenCalledWith('DEEPSEEK_EU_API_KEY', 'sk-deepseek')
    expect(screen.queryByLabelText(en.keyInput)).toBeNull()
  })

  it('warns that a custom endpoint on another machine over http would send the key in plain text', async () => {
    const h = harness()
    render(<ProviderOnboardingDialog {...h.props} />)
    fireEvent.click(await screen.findByRole('button', { name: en.addCustom }))
    const baseUrl = await screen.findByLabelText<HTMLInputElement>(en.baseUrl)
    fireEvent.change(baseUrl, { target: { value: 'http://192.168.1.5:11434/v1' } })
    expect(screen.getByText(en.customHttpWarning)).toBeTruthy()
    for (const local of ['http://localhost:11434/v1', 'http://127.0.0.1:1234/v1', 'https://gateway.example/v1']) {
      fireEvent.change(baseUrl, { target: { value: local } })
      expect(screen.queryByText(en.customHttpWarning)).toBeNull()
    }
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
