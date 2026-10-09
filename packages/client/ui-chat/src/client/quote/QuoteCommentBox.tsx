/** Inline comment box that opens beside a selection when the user chooses Quote. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconSendOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import { QuoteGlyph } from './QuoteChip.tsx'
import css from './Quote.module.css'

/** Widest the box grows, in pixels; the action position keeps this much room at the viewport's right edge. */
export const COMMENT_BOX_WIDTH = 320

/**
 * Show the quoted text in small type above a focused reply field. Enter adds the quote with the comment, the send
 * button does the same, Escape cancels, and a click outside the box cancels.
 * @param props.text - Quoted text.
 * @param props.top - Viewport top of the box, in pixels.
 * @param props.left - Viewport left of the box, in pixels.
 * @param props.confirm - Add the quote with the typed comment, which may be empty.
 * @param props.cancel - Close the box without adding a quote.
 * @param props.t - Chat copy.
 * @returns the positioned box.
 */
export function QuoteCommentBox({ text, top, left, confirm, cancel, t }: {
  text: string
  top: number
  left: number
  confirm: (comment: string) => void
  cancel: () => void
  t: ChatViewSlotProps['t']
}): ReactNode {
  const [comment, setComment] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { field.current?.focus() }, [])
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && root.current?.contains(event.target) === true) return
      cancel()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => { document.removeEventListener('pointerdown', onPointerDown, true) }
  }, [cancel])
  return (
    <div ref={root} className={css.commentBox} style={{ top, left, width: COMMENT_BOX_WIDTH }}
      role="group" aria-label={t('quote.comment.label')} data-quote-comment-box="">
      <div className={css.commentQuote}>
        <QuoteGlyph />
        <span className={css.commentQuoteText}>{text}</span>
      </div>
      <div className={css.commentRow}>
        <textarea ref={field} className={css.commentField} rows={1} value={comment}
          placeholder={t('quote.comment.placeholder')} aria-label={t('quote.comment.placeholder')}
          onChange={(event) => { setComment(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              cancel()
              return
            }
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
            event.preventDefault()
            confirm(comment)
          }} />
        <button type="button" className={css.commentSend} aria-label={t('quote.comment.submit')}
          title={t('quote.comment.submit')} onClick={() => { confirm(comment) }}>
          <IconSendOutlineRegular size={14} />
        </button>
      </div>
    </div>
  )
}
