/**
 * The side-conversation dialog and its delivery and failure toasts, rendered
 * as one entry of `conversation.input.overlay` so each Session owns exactly
 * one. The Modal and the Toast portal to `document.body`; the overlay slot
 * only supplies the per-session controller and the composer card the toast
 * centers over. The agent keeps running while the dialog is open.
 * @module @deepseek-ai/dsh-client-ui-btw/client/BtwDialog
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Button, IconWarningOutlineRegular, Modal, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BtwDialogProps } from './slots.ts'
import css from './BtwDialog.module.css'

/** Failure codes with their own copy; every other code reads the generic line. */
const FAILURE_COPY: Partial<Record<string, 'error.busy' | 'error.noRoute' | 'error.model'>> = {
  'busy': 'error.busy',
  'no-route': 'error.noRoute',
  'model-failed': 'error.model',
}

/**
 * Render one Session's side-conversation dialog and toasts.
 * @param props - the dialog hook, the verbs, and the locale seat.
 * @returns the modal while open and either toast while it is showing.
 */
export function BtwDialog({
  useDialog, edit, ask, send, clear, dismiss, dismissFailure, dismissToast, t,
}: BtwDialogProps) {
  const state = useDialog(s => s)
  // The toasts center over the composer card this entry renders inside of.
  const probeRef = useRef<HTMLSpanElement>(null)
  const [card, setCard] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    setCard(probeRef.current?.closest<HTMLElement>('[data-composer-card]') ?? null)
  }, [])
  const toast = state.toast
  const onToastDone = useCallback(() => { dismissToast(toast) }, [dismissToast, toast])
  useEffect(() => () => { dismissToast(toast) }, [dismissToast, toast])
  const failureCode = state.failure
  const failure = failureCode === null ? null : t(FAILURE_COPY[failureCode] ?? 'error.generic')
  const onFailureDone = useCallback(() => { dismissFailure() }, [dismissFailure])

  // Keep the newest exchange in view as the thread grows.
  const threadRef = useRef<HTMLDivElement>(null)
  const turnCount = state.turns.length
  useEffect(() => {
    const node = threadRef.current
    if (node !== null) node.scrollTop = node.scrollHeight
  }, [turnCount, state.pending])

  const busy = state.pending !== null || state.sending
  const unsent = state.turns.length - state.sentTurns
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    void ask()
  }

  return (
    <>
      <span ref={probeRef} hidden />
      {toast > 0 && failure === null && (
        <Toast key={toast} text={t('toast.sent')} tone="success" anchor={card} onDone={onToastDone} />
      )}
      {failure !== null && (
        <Toast
          key={`failure-${failureCode}`}
          text={failure}
          icon={<IconWarningOutlineRegular />}
          anchor={card}
          holdMs={6000}
          onDone={onFailureDone}
        />
      )}
      <Modal
        open={state.open}
        title={t('dialog.title')}
        description={t('dialog.description')}
        closeLabel={t('close')}
        onClose={dismiss}
        className={css.dialog as string}
        footer={(
          <div className={css.actions}>
            <Button variant="ghost" disabled={busy || state.turns.length === 0} onClick={() => { void clear() }}>
              {t('action.clear')}
            </Button>
            <Button variant="outline" disabled={busy || unsent === 0} onClick={() => { void send() }}>
              {state.sending ? t('action.sending') : t('action.send')}
            </Button>
          </div>
        )}
      >
        <div ref={threadRef} className={css.thread} role="log" aria-label={t('thread.label')}>
          {state.turns.length === 0 && state.pending === null && <p className={css.empty}>{t('thread.empty')}</p>}
          {state.turns.map((turn, index) => (
            <div key={index} className={css.turn}>
              <p className={css.question}>
                <span className={css.who}>{t('thread.you')}</span>
                {turn.question}
              </p>
              <p className={css.answer}>
                <span className={css.who}>{t('thread.assistant')}</span>
                {turn.answer}
              </p>
              {index < state.sentTurns && <span className={css.sent}>{t('thread.sent')}</span>}
            </div>
          ))}
          {state.pending !== null && (
            <div className={css.turn}>
              <p className={css.question}>
                <span className={css.who}>{t('thread.you')}</span>
                {state.pending}
              </p>
              <p className={css.waiting}>{t('thread.pending')}</p>
            </div>
          )}
        </div>
        <div className={css.compose}>
          <textarea
            className={css.field}
            data-modal-autofocus
            aria-label={t('input.label')}
            placeholder={t('input.placeholder')}
            value={state.draft}
            onChange={(event) => { edit(event.target.value) }}
            onKeyDown={onKeyDown}
          />
          <Button
            variant="primary"
            className={css.ask}
            disabled={state.pending !== null || state.sending || state.draft.trim().length === 0}
            onClick={() => { void ask() }}
          >
            {state.pending === null ? t('action.ask') : t('action.asking')}
          </Button>
        </div>
      </Modal>
    </>
  )
}
