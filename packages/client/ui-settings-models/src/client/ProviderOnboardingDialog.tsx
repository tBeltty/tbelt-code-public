/**
 * First-run provider step, model-agnostic by design: readiness comes from
 * the same provider/settings/credential join the Models page uses, and ANY
 * usable provider ends the step — no route is named or preferred. When none
 * exists, the step leads with the Models page's catalog flow (pick a
 * provider, enter its key, choose models), with no provider preselected and
 * the list in alphabetical order; the local-server templates and the
 * custom-provider form follow as alternatives.
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelsSettingsState, ModelsSettingsStore } from './store.ts'
import { onboardingReadiness, protocolChoices } from './store.ts'
import type { ModelsOperations } from './operations.ts'
import type { SettingsSchemaOperations } from './schema-operations.ts'
import { CustomProviderCard } from './CustomProviderCard.tsx'
import { ProviderEditor } from './ProviderEditor.tsx'
import { LOCAL_PROVIDER_TEMPLATES } from './provider-templates.ts'
import type { ProviderTemplate } from './provider-templates.ts'
import type { en } from './locales.ts'
import { OnboardingModal } from './OnboardingModal.tsx'
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
  const namespace = state.namespaces.get('llm-pi-ai')

  if (customOpen && namespace !== undefined) {
    return (
      <OnboardingModal title={t('onboardingTitle')} focusTitle>
        <div className={onboardingStyles.editor}>
          <CustomProviderCard
            taken={state.rows.map(row => row.entry.provider)}
            protocols={protocols}
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

  // Catalog routes that can still take a key, alphabetical so no provider is favored.
  const addable = state.rows
    .flatMap((row) => {
      const rowNamespace = state.namespaces.get(row.entry.settingsNs)
      return rowNamespace === undefined || row.configured ? [] : [{ row, namespace: rowNamespace }]
    })
    .sort((a, b) => a.row.entry.displayName.localeCompare(b.row.entry.displayName))
  const chosen = addable.find(candidate => candidate.row.entry.provider === picked)
  const localOffered = namespace !== undefined && protocols.length > 0

  return (
    <OnboardingModal title={t('onboardingTitle')} focusTitle>
      <p className={onboardingStyles.description}>{t('onboardingDescription')}</p>
      {addable.length > 0 && (
        <div className={onboardingStyles['catalog']}>
          <label className={styles['field']}>
            <span className={styles['fieldLabel']}>{t('provider')}</span>
            <select
              className={`${styles['input']} ${styles['selectInput']}`}
              value={chosen?.row.entry.provider ?? ''}
              disabled={!state.writable}
              onChange={(event) => { setPicked(event.target.value === '' ? undefined : event.target.value) }}
            >
              <option value="" disabled>{t('onboardingChooseProvider')}</option>
              {addable.map(({ row }) => (
                <option key={row.entry.provider} value={row.entry.provider}>{row.entry.displayName}</option>
              ))}
            </select>
          </label>
          {chosen !== undefined && (
            <ProviderEditor
              key={chosen.row.entry.provider}
              provider={chosen.row.entry.provider}
              displayName={chosen.row.entry.displayName}
              hideTitle
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
          )}
        </div>
      )}
      {localOffered && <p className={onboardingStyles['alternatives']}>{t('onboardingAlternatives')}</p>}
      <div className={styles['addActions']}>
        {namespace !== undefined && protocols.length > 0 && LOCAL_PROVIDER_TEMPLATES.map(candidate => (
          <button
            key={candidate.id}
            type="button"
            className={styles['addButton']}
            disabled={!state.writable}
            onClick={() => {
              setTemplate(candidate)
              setCustomOpen(true)
            }}
          >
            {candidate.displayName}
          </button>
        ))}
        {namespace !== undefined && protocols.length > 0 && (
          <button
            type="button"
            className={styles['addButton']}
            disabled={!state.writable}
            onClick={() => {
              setTemplate(undefined)
              setCustomOpen(true)
            }}
          >
            {t('addCustom')}
          </button>
        )}
      </div>
      <button
        type="button"
        className={`${styles['secondaryButton']} ${onboardingStyles['later']}`}
        onClick={() => { complete() }}
      >
        {t('onboardingLater')}
      </button>
    </OnboardingModal>
  )
}
