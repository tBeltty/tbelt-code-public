/**
 * The setup of one catalog provider on a single screen, shared by the
 * first-run step and the Models page's add card: the user pastes an API key,
 * the Host asks the provider which models that key can use (which also checks
 * the key), and the list appears below the field with no model selected.
 * Nothing is stored until the user confirms with at least one chosen model;
 * the profile and the key are then written in that order, followed by the
 * default model only where the caller asks for it.
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { LlmDiscoveredModel, SettingsNamespaceView, SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { apiKeyFailure } from './apiKey.ts'
import { adopt } from './ModelListEditor.tsx'
import { pathOps, refFor } from './ProviderEditor.tsx'
import type { ModelsOperations } from './operations.ts'
import type { SettingsSchemaOperations } from './schema-operations.ts'
import type { en } from './locales.ts'
import styles from './ModelsSection.module.css'
import onboardingStyles from './ProviderOnboardingDialog.module.css'

/** Quiet period after the last keystroke before the key is checked. */
const CHECK_DELAY_MS = 500

/** Props of {@link OnboardingProviderSetup}. */
export interface OnboardingProviderSetupProps {
  /** Provider route id. */
  provider: string
  /** The owning namespace view. */
  namespace: SettingsNamespaceView
  /** Path from the section root to this provider's profile. */
  settingsPath: readonly string[]
  /** Settings schema and immutable path operations. */
  schema: SettingsSchemaOperations
  /** Host operations that check the key and store the result. */
  operations: ModelsOperations
  /** Feature copy. */
  t: (key: keyof typeof en) => string
  /** Disable every control (read-only deployment). */
  readOnly: boolean
  /**
   * Whether the first chosen model becomes the default model. The first-run
   * step sets it because no model exists yet; adding a provider later leaves
   * the user's current default alone.
   */
  setDefault: boolean
  /** Copy key of the confirm button. */
  submitLabelKey: keyof typeof en
  /** Dismiss action shown beside the confirm button; absent where the step cannot be skipped from this panel. */
  onCancel?: () => void
  /** Called once per change with whether the save is in flight, so the owner can hold its surface still. */
  onBusyChange?: (busy: boolean) => void
  /** Called once the provider and its key are stored, and the default model where `setDefault` is set. */
  onDone: () => void
}

/** Where the key check stands. */
type KeyCheck =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'rejected'; readonly message: string }
  | { readonly kind: 'found'; readonly models: readonly LlmDiscoveredModel[] }

/**
 * Render the key field and, once the key is accepted, the model choice.
 * @param props - the provider profile, wire operations and copy.
 * @returns the setup panel.
 */
export function OnboardingProviderSetup(props: OnboardingProviderSetupProps): ReactNode {
  const { provider, namespace, settingsPath, schema, operations, t } = props
  const [keyDraft, setKeyDraft] = useState('')
  const [check, setCheck] = useState<KeyCheck>({ kind: 'idle' })
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  // The model ids the profile write already stored; a retry after a refused
  // credential skips that write, whose revision is no longer current.
  const writtenFor = useRef<string | undefined>(undefined)
  const { onBusyChange } = props
  const key = keyDraft.trim()
  const formatFailure = key.length === 0 ? undefined : apiKeyFailure(keyDraft)

  useEffect(() => { onBusyChange?.(saving) }, [saving, onBusyChange])

  useEffect(() => {
    setPicked(new Set())
    setQuery('')
    if (key.length === 0 || formatFailure !== undefined) {
      setCheck({ kind: 'idle' })
      return
    }
    let current = true
    setCheck({ kind: 'checking' })
    const timer = setTimeout(() => {
      void operations.discoverModels(namespace.ns, { provider, apiKey: key, live: true }).then((answer) => {
        if (!current) return
        if (answer.kind === 'found') {
          setCheck({ kind: 'found', models: answer.models })
          return
        }
        const message = answer.code === 'INVALID_CREDENTIAL'
          ? t('onboardingKeyRejected')
          : answer.code === 'QUOTA' ? t('onboardingKeyQuota') : answer.message
        setCheck({ kind: 'rejected', message })
      })
    }, CHECK_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [formatFailure, key, namespace.ns, operations, provider, t])

  const models = check.kind === 'found' ? check.models : []
  const needle = query.trim().toLowerCase()
  const visible = needle.length === 0
    ? models
    : models.filter(model => model.id.toLowerCase().includes(needle)
      || model.name?.toLowerCase().includes(needle) === true)

  const toggle = (id: string): void => {
    setPicked((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  const start = async (): Promise<void> => {
    const chosen = models.filter(model => picked.has(model.id))
    const first = chosen[0]
    /* v8 ignore next -- the start button is disabled until a model is chosen */
    if (first === undefined) return
    setSaving(true)
    setFailure(undefined)
    try {
      const keyRef = refFor(schema, namespace, settingsPath, provider)
      const chosenKey = chosen.map(model => model.id).join('\n')
      if (writtenFor.current !== chosenKey) {
        const before = schema.getPath(namespace.user, settingsPath)
        const stored = typeof before === 'object' && before !== null && !Array.isArray(before)
          ? before as Record<string, unknown>
          : undefined
        const after: Record<string, unknown> = {
          ...stored,
          apiKeyEnv: keyRef,
          models: chosen.map(adopt),
        }
        const ops: SettingsPathOpView[] = stored === undefined
          ? [{ op: 'set', path: [...settingsPath], value: after as JsonValue }]
          : pathOps(settingsPath, stored, after)
        const written = await operations.writeSettings(namespace.ns, ops, namespace.revision)
        if (written.kind !== 'written') {
          setFailure(written.kind === 'conflict' ? t('conflict') : written.message)
          return
        }
        writtenFor.current = chosenKey
      }
      const keyFailure = await operations.storeCredential(keyRef, key)
      if (keyFailure !== undefined) {
        setFailure(keyFailure)
        return
      }
      // The provider is usable once its key is stored; a refused default only
      // leaves the composer's picker to choose, so it does not hold the step.
      if (props.setDefault) await operations.setDefaultModel(provider, first.id)
      props.onDone()
    } finally {
      setSaving(false)
    }
  }

  const disabled = props.readOnly || saving
  return (
    <div className={onboardingStyles['setup']}>
      <div className={styles['field']}>
        <span className={styles['fieldLabel']}>{t('keyInput')}</span>
        <input
          className={styles['input']}
          type="password"
          autoComplete="new-password"
          value={keyDraft}
          placeholder={t('keyPlaceholder')}
          aria-label={t('keyInput')}
          aria-invalid={formatFailure !== undefined || check.kind === 'rejected'}
          autoFocus
          disabled={disabled}
          onChange={(event) => { setKeyDraft(event.target.value) }}
        />
        {formatFailure !== undefined
          ? <p className={styles['error']}>{t(formatFailure)}</p>
          : check.kind === 'checking'
            ? <p className={onboardingStyles['status']} role="status">{t('onboardingKeyChecking')}</p>
            : check.kind === 'rejected'
              ? <p className={styles['error']} role="alert">{check.message}</p>
              : null}
      </div>
      {check.kind === 'found'
        ? (
          <section className={onboardingStyles['modelPicker']} aria-label={t('onboardingModelsTitle')}>
            <span className={styles['fieldLabel']}>{t('onboardingModelsTitle')}</span>
            {models.length === 0
              ? <p className={styles['candidateEmpty']} role="status">{t('fetchEmpty')}</p>
              : (
                <>
                  <input
                    className={`${styles['input']} ${styles['candidateSearch']}`}
                    type="search"
                    value={query}
                    placeholder={t('fetchSearch')}
                    aria-label={t('fetchSearch')}
                    disabled={disabled}
                    onChange={(event) => { setQuery(event.target.value) }}
                  />
                  {visible.length === 0
                    ? <p className={styles['candidateEmpty']} role="status">{t('fetchNoMatches')}</p>
                    : (
                      <ul className={styles['candidateList']}>
                        {visible.map(model => (
                          <li key={model.id} className={styles['candidate']}>
                            <label className={styles['candidateLabel']}>
                              <input
                                type="checkbox"
                                checked={picked.has(model.id)}
                                disabled={disabled}
                                onChange={() => { toggle(model.id) }}
                              />
                              <span className={styles['candidateId']} title={model.name ?? model.id}>
                                {model.id}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                </>
              )}
          </section>
        )
        : null}
      {failure === undefined ? null : <p className={styles['error']} role="alert">{failure}</p>}
      {(check.kind === 'found' && models.length > 0) || props.onCancel !== undefined
        ? (
          <div className={onboardingStyles['setupFooter']}>
            <span className={onboardingStyles['status']}>
              {models.length === 0
                ? null
                : picked.size === 0 ? t('onboardingPickModel') : `${String(picked.size)} ${t('onboardingSelected')}`}
            </span>
            {props.onCancel === undefined
              ? null
              : <Button variant="outline" disabled={saving} onClick={props.onCancel}>{t('cancel')}</Button>}
            {models.length === 0
              ? null
              : (
                <Button disabled={disabled || picked.size === 0} onClick={() => { void start() }}>
                  {saving ? t('applying') : t(props.submitLabelKey)}
                </Button>
              )}
          </div>
        )
        : null}
    </div>
  )
}
