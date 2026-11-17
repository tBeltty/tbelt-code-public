/**
 * First-run provider step, model-agnostic by design: readiness comes from
 * the same provider/settings/credential join the Models page uses, and ANY
 * usable provider ends the step — no route is named or preferred. When none
 * exists, the step shows one searchable list: the catalog routes in
 * popular providers first, then the local-server templates, the other catalog
 * routes alphabetically and the custom-provider form, with nothing preselected. A pi-ai catalog route is set up on the same
 * screen: the key is checked as it is typed and the models it can use are
 * listed below it, none selected.
 *
 * The step opens on a short question, "do you already have an account or
 * key?", whose answers weigh the same. A person with a key picks its provider
 * or opens the full list; a person with none sees the providers that offer a
 * free key, each with a link to create one.
 */

import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelsSettingsState, ModelsSettingsStore } from './store.ts'
import { onboardingReadiness, protocolChoices, reasoningLevelChoices } from './store.ts'
import type { ModelsOperations } from './operations.ts'
import type { SettingsSchemaOperations } from './schema-operations.ts'
import { CustomProviderCard } from './CustomProviderCard.tsx'
import { ProviderEditor } from './ProviderEditor.tsx'
import { LOCAL_PROVIDER_TEMPLATES } from './provider-templates.ts'
import { FREE_KEY_PROVIDERS, HAVE_KEY_PROVIDERS, POPULAR_PROVIDERS, providerDisplayName } from './provider-names.ts'
import type { ProviderTemplate } from './provider-templates.ts'
import type { en } from './locales.ts'
import { OnboardingModal } from './OnboardingModal.tsx'
import { OnboardingProviderSetup } from './OnboardingProviderSetup.tsx'
import styles from './ModelsSection.module.css'
import onboardingStyles from './ProviderOnboardingDialog.module.css'

/** Registration-side dependencies of {@link ProviderOnboardingDialog}. */
export interface ProviderOnboardingInjected {
  hooks: {
    /** Shared Models-page join state, bound by the slot renderer. */
    models: SnapshotStore<ModelsSettingsState>
  }
  /** Shared Models-page join controller. */
  controller: ModelsSettingsStore
  /** The Host operations the reused custom-provider card writes through. */
  operations: ModelsOperations
  /** Settings schema and immutable path callbacks. */
  schema: SettingsSchemaOperations
  /** Feature copy. */
  t: (key: keyof typeof en) => string
}

/** Slot owner props plus the feature's injected dependencies. */
export type ProviderOnboardingDialogProps =
  PropsRuntime<'settings.onboarding'> & InjectFace<ProviderOnboardingInjected>

/** Order of the list groups. */
const GROUPS = ['popular', 'local', 'other', 'custom'] as const

/** Which screen of the step is showing. */
type OnboardingStage = 'have' | 'none' | 'all'

/** A list group. */
type OnboardingGroup = typeof GROUPS[number]

/** One entry of the provider list: a catalog route, a local-server template, or the custom form. */
interface OnboardingChoice {
  /** Stable list key; a catalog route's key is its provider id. */
  key: string
  /** Name shown in the list. */
  label: string
  /** Secondary text shown beside the name; empty for a catalog route. */
  detail: string
  /** Group the entry is listed under. */
  group: OnboardingGroup
  /** Route id, matched by the search without being shown. */
  search: string
  /** Select this entry. */
  pick: () => void
}

/**
 * Reader-facing name of a catalog route.
 * @param entry - the route's directory entry.
 * @returns its name, never the bare id.
 */
function nameOf(entry: { provider: string; displayName: string }): string {
  return providerDisplayName(entry.provider, entry.displayName)
}

/**
 * Position of a route in the popular list; routes outside it sort after it.
 * @param provider - route id.
 * @returns the rank used to order the catalog routes.
 */
function popularRank(provider: string): number {
  const index = POPULAR_PROVIDERS.indexOf(provider)
  return index === -1 ? POPULAR_PROVIDERS.length : index
}

/* v8 ignore next 3 -- closed-union defaults only defend future source widening */
function assertNever(_value: never): never {
  throw new Error('unexpected provider onboarding state')
}

/**
 * Prompt a first-run user to configure any provider while none can serve
 * requests yet. Offers the local-server templates and the custom-provider
 * form; skipping leaves the step's normal completion path for the Models
 * page itself.
 * @param props - settings-shell owner state and Models feature dependencies.
 * @returns the onboarding modal or null when onboarding needs no intervention.
 */
export function ProviderOnboardingDialog(props: ProviderOnboardingDialogProps): ReactNode {
  const { complete, controller, useModels, operations, schema, t } = props
  const state = useModels(snapshot => snapshot)
  const readiness = onboardingReadiness(state)
  const [template, setTemplate] = useState<ProviderTemplate | undefined>(undefined)
  const [customOpen, setCustomOpen] = useState(false)
  const [picked, setPicked] = useState<string | undefined>(undefined)
  const [query, setQuery] = useState('')
  const [stage, setStage] = useState<OnboardingStage>('have')
  const listId = useId()

  useEffect(() => {
    if (state.status === 'idle') void controller.load()
  }, [controller, state.status])

  useEffect(() => {
    if (readiness.kind === 'provider-ready' || readiness.kind === 'unavailable') complete()
  }, [complete, readiness.kind])

  switch (readiness.kind) {
    case 'loading':
    case 'provider-ready':
    case 'unavailable':
      return null
    case 'choose-provider':
      break
    /* v8 ignore next -- every current readiness variant is handled above */
    default:
      return assertNever(readiness)
  }

  const protocols = protocolChoices(state.namespaces.get('llm-pi-ai'), schema)
  const reasoningLevels = reasoningLevelChoices(state.namespaces.get('llm-pi-ai'), schema)
  const namespace = state.namespaces.get('llm-pi-ai')

  if (customOpen && namespace !== undefined) {
    return (
      <OnboardingModal title={t('onboardingTitle')} focusTitle>
        <div className={onboardingStyles.editor}>
          <CustomProviderCard
            taken={state.rows.map(row => row.entry.provider)}
            protocols={protocols}
            reasoningLevels={reasoningLevels}
            revision={namespace.revision}
            operations={operations}
            t={t}
            readOnly={!state.writable}
            initial={template}
            onClose={(changed) => {
              setCustomOpen(false)
              setTemplate(undefined)
              if (changed) void controller.load()
              else complete()
            }}
          />
        </div>
      </OnboardingModal>
    )
  }

  // Catalog routes that can still take a key: the popular ones in their fixed
  // order, the rest alphabetical.
  const addable = state.rows
    .flatMap((row) => {
      const rowNamespace = state.namespaces.get(row.entry.settingsNs)
      return rowNamespace === undefined || row.configured ? [] : [{ row, namespace: rowNamespace }]
    })
    .sort((a, b) => nameOf(a.row.entry).localeCompare(nameOf(b.row.entry)))
    .sort((a, b) => popularRank(a.row.entry.provider) - popularRank(b.row.entry.provider))
  const chosen = addable.find(candidate => candidate.row.entry.provider === picked)
  const localOffered = namespace !== undefined && protocols.length > 0
  const choices: readonly OnboardingChoice[] = [
    ...addable.map(({ row }): OnboardingChoice => ({
      key: row.entry.provider, label: nameOf(row.entry), detail: '', search: row.entry.provider,
      group: POPULAR_PROVIDERS.includes(row.entry.provider) ? 'popular' : 'other',
      pick: () => { setPicked(row.entry.provider) },
    })),
    ...localOffered
      ? ([
        ...LOCAL_PROVIDER_TEMPLATES.map((candidate): OnboardingChoice => ({
          key: `local:${candidate.id}`, label: candidate.displayName, detail: '', search: candidate.id, group: 'local',
          pick: () => {
            setTemplate(candidate)
            setCustomOpen(true)
          },
        })),
        {
          key: 'custom', label: t('addCustom'), detail: t('onboardingCustomTag'), search: 'custom', group: 'custom',
          pick: () => {
            setTemplate(undefined)
            setCustomOpen(true)
          },
        },
      ] satisfies OnboardingChoice[])
      : [],
  ]
  const setup = chosen === undefined
    ? null
    : chosen.namespace.ns === 'llm-pi-ai'
      ? (
        <OnboardingProviderSetup
          key={chosen.row.entry.provider}
          provider={chosen.row.entry.provider}
          namespace={chosen.namespace}
          settingsPath={chosen.row.entry.settingsPath}
          schema={schema}
          operations={operations}
          t={t}
          readOnly={!state.writable}
          setDefault
          submitLabelKey="onboardingStart"
          onDone={() => {
            setPicked(undefined)
            void controller.load()
          }}
        />
      )
      : (
        <ProviderEditor
          key={chosen.row.entry.provider}
          provider={chosen.row.entry.provider}
          displayName={chosen.row.entry.displayName}
          hideTitle
          {...chosen.row.entry.defaultBaseURL === undefined ? {} : { defaultBaseURL: chosen.row.entry.defaultBaseURL }}
          {...chosen.row.nativeEnv === undefined ? {} : { nativeEnv: chosen.row.nativeEnv }}
          namespace={chosen.namespace}
          schema={schema}
          settingsPath={chosen.row.entry.settingsPath}
          operations={operations}
          t={t}
          readOnly={!state.writable}
          credentialRequired
          autoFocusCredential
          onClose={(changed) => {
            setPicked(undefined)
            if (changed) void controller.load()
          }}
        />
      )
  const later = (
    <button
      type="button"
      className={`${styles['secondaryButton']} ${onboardingStyles['later']}`}
      onClick={() => { complete() }}
    >
      {t('onboardingLater')}
    </button>
  )
  const go = (next: OnboardingStage): void => {
    setPicked(undefined)
    setQuery('')
    setStage(next)
  }

  if (stage === 'have') {
    const offered = HAVE_KEY_PROVIDERS.flatMap(provider => addable.filter(candidate => candidate.row.entry.provider === provider))
    return (
      <OnboardingModal title={t('onboardingHaveTitle')} focusTitle>
        <p className={onboardingStyles.description}>{t('onboardingHaveDescription')}</p>
        <ul className={onboardingStyles['providerList']} aria-label={t('provider')}>
          {offered.map(({ row }) => (
            <li key={row.entry.provider}>
              <button
                type="button"
                className={`${onboardingStyles['providerItem']} ${row.entry.provider === picked ? onboardingStyles['providerItemActive'] : ''}`}
                aria-label={nameOf(row.entry)}
                aria-pressed={row.entry.provider === picked}
                disabled={!state.writable}
                onClick={() => { setPicked(row.entry.provider) }}
              >
                <span className={onboardingStyles['providerName']}>{nameOf(row.entry)}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className={onboardingStyles['providerItem']}
              aria-label={t('onboardingAnother')}
              disabled={!state.writable}
              onClick={() => { go('all') }}
            >
              <span className={onboardingStyles['providerName']}>{t('onboardingAnother')}</span>
              <span className={onboardingStyles['providerDetail']}>{t('onboardingAnotherTag')}</span>
            </button>
          </li>
        </ul>
        {setup}
        <div className={onboardingStyles['stepLinks']}>
          <button type="button" className={styles['secondaryButton']} disabled={!state.writable} onClick={() => { go('none') }}>
            {t('onboardingNoKey')}
          </button>
          {later}
        </div>
      </OnboardingModal>
    )
  }

  if (stage === 'none') {
    const offered = FREE_KEY_PROVIDERS.flatMap(free => addable
      .filter(candidate => candidate.row.entry.provider === free.provider)
      .map(candidate => ({ free, row: candidate.row })))
    return (
      <OnboardingModal title={t('onboardingNoneTitle')} focusTitle>
        <p className={onboardingStyles.description}>{t('onboardingNoneDescription')}</p>
        <ul className={onboardingStyles['providerList']} aria-label={t('provider')}>
          {offered.map(({ free, row }) => (
            <li key={free.provider} className={onboardingStyles['freeItem']}>
              <button
                type="button"
                className={`${onboardingStyles['providerItem']} ${free.provider === picked ? onboardingStyles['providerItemActive'] : ''}`}
                aria-label={nameOf(row.entry)}
                aria-pressed={free.provider === picked}
                aria-describedby={`${listId}-${free.provider}`}
                disabled={!state.writable}
                onClick={() => { setPicked(free.provider) }}
              >
                <span id={`${listId}-${free.provider}-name`} className={onboardingStyles['providerName']}>{nameOf(row.entry)}</span>
                <span id={`${listId}-${free.provider}`} className={onboardingStyles['freeLimit']}>
                  {t(free.limitKey)}
                  {free.privacyKey === undefined ? null : ` ${t(free.privacyKey)}`}
                </span>
              </button>
              <a
                className={onboardingStyles['freeLink']}
                href={free.keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-describedby={`${listId}-${free.provider}-name`}
              >
                {t('onboardingGetKey')}
              </a>
            </li>
          ))}
        </ul>
        {setup}
        <div className={onboardingStyles['stepLinks']}>
          <button type="button" className={styles['secondaryButton']} onClick={() => { go('have') }}>
            {t('onboardingBack')}
          </button>
          {later}
        </div>
      </OnboardingModal>
    )
  }

  const needle = query.trim().toLowerCase()
  const visible = needle.length === 0
    ? choices
    : choices.filter(choice => choice.label.toLowerCase().includes(needle)
      || choice.search.toLowerCase().includes(needle)
      || choice.detail.toLowerCase().includes(needle))
  const groupLabels: Record<OnboardingGroup, string | undefined> = {
    popular: t('onboardingGroupPopular'), local: t('onboardingGroupLocal'), other: t('onboardingGroupOther'),
    custom: undefined,
  }

  return (
    <OnboardingModal title={t('onboardingTitle')} focusTitle>
      <p className={onboardingStyles.description}>{t('onboardingDescription')}</p>
      <input
        className={`${styles['input']} ${onboardingStyles['providerSearch']}`}
        type="search"
        value={query}
        placeholder={t('onboardingSearchProviders')}
        aria-label={t('onboardingSearchProviders')}
        disabled={!state.writable}
        onChange={(event) => { setQuery(event.target.value) }}
      />
      {visible.length === 0
        ? <p className={styles['candidateEmpty']} role="status">{t('onboardingNoProviders')}</p>
        : (
          <ul className={onboardingStyles['providerList']} aria-label={t('provider')}>
            {GROUPS.flatMap((group) => {
              const entries = visible
                .filter(choice => choice.group === group)
                .toSorted((a, b) => group === 'popular'
                  ? POPULAR_PROVIDERS.indexOf(a.key) - POPULAR_PROVIDERS.indexOf(b.key)
                  : 0)
              if (entries.length === 0) return []
              const heading = groupLabels[group]
              return [
                ...heading === undefined ? [] : [
                  <li key={`group:${group}`} role="presentation" className={onboardingStyles['providerGroup']}>{heading}</li>,
                ],
                ...entries.map(choice => (
                  <li key={choice.key}>
                    <button
                      type="button"
                      className={`${onboardingStyles['providerItem']} ${choice.key === picked ? onboardingStyles['providerItemActive'] : ''}`}
                      aria-label={choice.label}
                      aria-describedby={choice.detail === '' ? undefined : `${listId}-${choice.key}`}
                      aria-pressed={choice.key === picked}
                      disabled={!state.writable}
                      onClick={choice.pick}
                    >
                      <span className={onboardingStyles['providerName']}>{choice.label}</span>
                      {choice.detail === ''
                        ? null
                        : <span id={`${listId}-${choice.key}`} className={onboardingStyles['providerDetail']}>{choice.detail}</span>}
                    </button>
                  </li>
                )),
              ]
            })}
          </ul>
        )}
      {setup}
      <div className={onboardingStyles['stepLinks']}>
        <button type="button" className={styles['secondaryButton']} onClick={() => { go('have') }}>
          {t('onboardingBack')}
        </button>
        {later}
      </div>
    </OnboardingModal>
  )
}
