/**
 * Browser sign-in for a provider whose subscription can authorize this client,
 * shown beside the API key field. The Host runs the flow and this panel relays
 * what it asks: the page to open, a code to enter, a pasted callback address.
 * A finished sign-in hands control to the owner, which stores the provider
 * profile; the token itself never reaches the page.
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  AuthorizationAttemptView, AuthorizationFlowView, AuthorizationMethodView,
} from '@deepseek-ai/dsh-api-remotes/client'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ModelsOperations } from './operations.ts'
import type { en } from './locales.ts'
import styles from './ModelsSection.module.css'
import onboardingStyles from './ProviderOnboardingDialog.module.css'

/** Delay between two reads of a running sign-in. */
const POLL_MS = 1000

/** Props of {@link ProviderSignIn}. */
export interface ProviderSignInProps {
  /** The sign-in flow of this provider. */
  flow: AuthorizationFlowView
  /** The flow method that opens the provider's account page. */
  method: AuthorizationMethodView
  /** Host operations that run and poll the flow. */
  operations: ModelsOperations
  /** Feature copy. */
  t: (key: keyof typeof en) => string
  /** Disable every control (read-only deployment or a save in flight). */
  disabled: boolean
  /** Called once when the sign-in finished and its credential is stored. */
  onSignedIn: () => void
}

/**
 * The page the person must open next, or undefined when the notice carries none.
 * @param attempt - the attempt's latest state.
 * @returns a link only when it is an http(s) address.
 */
function openableUrl(attempt: AuthorizationAttemptView): string | undefined {
  const url = attempt.notice?.url
  if (url === undefined) return undefined
  return /^https?:\/\//i.test(url) ? url : undefined
}

/**
 * Render the sign-in button and, while an attempt runs, what it is waiting on.
 * @param props - the flow, host operations and callbacks.
 * @returns the panel.
 */
export function ProviderSignIn(props: ProviderSignInProps): ReactNode {
  const { flow, method, operations, t } = props
  const [attempt, setAttempt] = useState<AuthorizationAttemptView | undefined>(undefined)
  const [starting, setStarting] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [answer, setAnswer] = useState('')
  const [copied, setCopied] = useState(false)
  const active = useRef<AuthorizationAttemptView | undefined>(undefined)
  active.current = attempt?.status === 'running' ? attempt : undefined
  const { onSignedIn } = props
  const attemptId = attempt?.id
  const running = attempt?.status === 'running'

  useEffect(() => {
    if (attemptId === undefined || !running) return
    let current = true
    const timer = setInterval(() => {
      void operations.readSignIn(flow.key, attemptId).then((view) => {
        if (!current) return
        if (view === undefined) {
          setAttempt(undefined)
          setFailure(t('signInFailed'))
          return
        }
        setAttempt(view)
      })
    }, POLL_MS)
    return () => {
      current = false
      clearInterval(timer)
    }
  }, [attemptId, flow.key, operations, running, t])

  // Leaving the card while a sign-in runs withdraws it, so no browser callback
  // lands on a card nobody is looking at.
  useEffect(() => () => {
    if (active.current !== undefined) void operations.cancelSignIn(flow.key)
  }, [flow.key, operations])

  const status = attempt?.status
  const reported = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (status === 'authorized') {
      if (reported.current === attemptId) return
      reported.current = attemptId
      onSignedIn()
    }
    else if (status === 'failed') setFailure(attempt?.failure ?? t('signInFailed'))
    else if (status === 'cancelled') setAttempt(undefined)
  }, [attempt?.failure, attemptId, onSignedIn, status, t])

  const begin = async (): Promise<void> => {
    setStarting(true)
    setFailure(undefined)
    setAttempt(undefined)
    try {
      const started = await operations.beginSignIn(flow.key, method.id)
      if (started.kind === 'refused') setFailure(started.message)
      else setAttempt(started.attempt)
    } finally {
      setStarting(false)
    }
  }
  const cancel = async (): Promise<void> => {
    await operations.cancelSignIn(flow.key)
    setAttempt(undefined)
  }
  const reply = async (id: string, promptId: string, value: string | null): Promise<void> => {
    setAnswer('')
    await operations.answerSignIn(flow.key, id, promptId, value)
  }
  const copyLink = async (url: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // A browser without clipboard access leaves the link visible to select.
      setCopied(false)
    }
  }

  if (status === 'authorized') return <p className={onboardingStyles['status']} role="status">{t('signInDone')}</p>
  if (running) {
    const url = openableUrl(attempt)
    const prompt = attempt.prompt
    return (
      <div className={styles['field']} role="status">
        <p className={onboardingStyles['status']}>{attempt.notice?.message ?? t('signInStarting')}</p>
        {attempt.notice?.code === undefined
          ? null
          : <p className={styles['fieldLabel']}>{t('signInCode').replace('{code}', attempt.notice.code)}</p>}
        {url === undefined ? null : (
          <div className={onboardingStyles['setupFooter']}>
            <a className={styles['secondaryButton']} href={url} target="_blank" rel="noopener noreferrer">
              {t('signInOpenPage')}
            </a>
            <Button variant="outline" onClick={() => { void copyLink(url) }}>
              {copied ? t('signInLinkCopied') : t('signInCopyLink')}
            </Button>
          </div>
        )}
        {prompt === undefined ? null : (
          <div className={styles['field']}>
            <span className={styles['fieldLabel']}>{prompt.message}</span>
            {prompt.kind === 'select'
              ? prompt.options.map(option => (
                <Button key={option.id} variant="outline" onClick={() => { void reply(attempt.id, prompt.id, option.id) }}>
                  {option.label}
                </Button>
              ))
              : (
                <>
                  <input
                    className={styles['input']}
                    type={prompt.kind === 'secret' ? 'password' : 'text'}
                    value={answer}
                    placeholder={prompt.placeholder}
                    aria-label={prompt.message}
                    autoComplete="off"
                    onChange={(event) => { setAnswer(event.target.value) }}
                  />
                  <Button disabled={answer.trim().length === 0} onClick={() => { void reply(attempt.id, prompt.id, answer.trim()) }}>
                    {t('signInContinue')}
                  </Button>
                </>
              )}
          </div>
        )}
        <Button variant="outline" onClick={() => { void cancel() }}>{t('signInCancel')}</Button>
      </div>
    )
  }
  return (
    <div className={styles['field']}>
      <Button variant="outline" disabled={props.disabled || starting} onClick={() => { void begin() }}>
        {starting ? t('signInStarting') : failure === undefined ? method.label : t('signInRetry')}
      </Button>
      <span className={styles['advancedHint']}>{t('signInHint')}</span>
      {failure === undefined ? null : <p className={styles['error']} role="alert">{failure}</p>}
    </div>
  )
}
