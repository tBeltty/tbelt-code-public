/** Composer takeover for one pending approval waterfall. */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Button, IconChevronDownOutlineRegular, Menu, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { approvalModel } from '@deepseek-ai/dsh-presentation-approval'
import type { ApprovalComposerProps, ApprovalDecision, PendingApproval } from './contract/slots.ts'
import css from './ApprovalPanel.module.css'

/**
 * Render one pending approval and its optional Tool-owned detail.
 * @param props - selector-matched request and standard Slot props.
 * @returns The approval composer takeover.
 */
export function ApprovalPanel(props: ApprovalComposerProps) {
  const approval = props.matched
  const detail = approval.callId === undefined
    ? null
    : props.renderSlot('conversation.approval.detail', { callId: approval.callId })
  const reason = approval.displayReason === undefined ? approval.reason : props.resolveReason(approval.displayReason)
  return <ApprovalFlow key={approval.key} pending={approval} reason={reason} detail={detail} t={props.t} />
}

function ApprovalFlow({ pending, reason, detail, t }: {
  pending: PendingApproval
  reason: string | undefined
  detail: ReactNode
  t: ApprovalComposerProps['t']
}) {
  const [answered, setAnswered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const model = approvalModel({ toolName: pending.toolName, callId: pending.callId, reason })
  const menuChoices = model.choices.filter(choice => choice.role === 'menu')
  const waiting = useRef(false)
  const active = useRef(true)
  const composing = useRef(false)
  const compositionEnded = useRef(false)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  const answer = (outcome: ApprovalDecision): void => {
    if (waiting.current || !pending.answerable) return
    waiting.current = true
    setAnswered(true)
    void pending.answer(outcome).catch(() => {
      if (!active.current || !pending.answerable) return
      waiting.current = false
      setAnswered(false)
    })
  }
  const keydown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const element = event.target as Element
    if (event.defaultPrevented || !event.currentTarget.contains(document.activeElement)
      || element.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]') !== null) return
    if (event.key !== 'Enter' && event.key !== 'Escape') return
    if (event.key === 'Enter' && element.closest('button, a[href], [role="button"]') !== null) return
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    event.preventDefault()
    event.stopPropagation()
    // oxlint-disable-next-line typescript/no-deprecated -- IME 229 covers engines without isComposing.
    if (event.repeat || composing.current || compositionEnded.current || event.nativeEvent.isComposing || event.keyCode === 229) return
    answer(event.key === 'Enter' ? 'allowed-once' : 'rejected')
  }
  return (
    <div className={css.root} data-approval-key={pending.key} aria-busy={answered}
      onKeyDown={keydown}
      onKeyUpCapture={() => { compositionEnded.current = false }}
      onCompositionStartCapture={() => { composing.current = true }}
      onCompositionEndCapture={() => { composing.current = false; compositionEnded.current = true }}>
      <div className={css.card}>
        <div className={css.strip}><StateDot state={answered ? 'ongoing' : 'warning'} />{t('waiting')}</div>
        <div
          className={css.body}
          data-approval-scroll=""
          tabIndex={0}
          role="group"
          aria-label={t('detail.aria')}
        >
          <div className={css.headline}>{t(model.needKey)}</div>
          {model.because !== null && <div className={css.because}>{t('because', { reason: model.because })}</div>}
          <details className={css.technical}>
            <summary>{t('technical')}</summary>
            <div className={css.technicalTool}>{t('technical.tool', { toolName: model.technical.toolName })}</div>
            {detail !== null && <div className={css.command}>{detail}</div>}
          </details>
        </div>
        <div className={css.actionRow}>
          <Button variant="outline" className={css.reject} disabled={answered} onClick={() => { answer('rejected') }}>
            {t('reject')}
          </Button>
          <div className={css.allowGroup}>
            <Button variant="primary" disabled={answered} onClick={() => { answer('allowed-once') }}>
              {t('allowOnce')}
            </Button>
            <Menu
              open={menuOpen}
              onClose={() => { setMenuOpen(false) }}
              items={menuChoices.map(choice => ({ id: choice.id, label: t(choice.labelKey) }))}
              onSelect={(id) => {
                setMenuOpen(false)
                const choice = menuChoices.find(candidate => candidate.id === id)
                if (choice !== undefined) answer(choice.id)
              }}
              align="end"
              portal
              anchor={(
                <Button
                  variant="primary" className={css.allowMore} disabled={answered}
                  aria-haspopup="menu" aria-expanded={menuOpen} aria-label={t('allowMenu')}
                  onClick={() => { setMenuOpen(open => !open) }}
                >
                  <IconChevronDownOutlineRegular />
                </Button>
              )}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
