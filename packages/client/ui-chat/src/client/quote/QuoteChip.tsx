/** Quote chips: the sent-bubble chip, the composer dock, and their shared glyph. */
import type { ReactNode } from 'react'
import { IconCloseOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { NO_QUOTES, type ChatQuoteState } from './quotes.ts'
import css from './Quote.module.css'

/** Widest tooltip showing a full quote, in pixels. */
const QUOTE_TOOLTIP_WIDTH = 420

/**
 * Opening quotation mark drawn at the chip's text size.
 * @returns the decorative glyph.
 */
export function QuoteGlyph(): ReactNode {
  return (
    <svg className={css.glyph} width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M3.2 13C1.9 13 1 11.9 1 10.4c0-3 1.9-5.9 4.8-7.4l.7 1.1C4.9 5.1 3.9 6.6 3.7 8c.3-.1.6-.2.9-.2 1.4 0 2.4 1 2.4 2.5S5.9 13 4.4 13H3.2Zm7.7 0c-1.3 0-2.2-1.1-2.2-2.6 0-3 1.9-5.9 4.8-7.4l.7 1.1c-1.6 1-2.6 2.5-2.8 3.9.3-.1.6-.2.9-.2 1.4 0 2.4 1 2.4 2.5S13.6 13 12.1 13h-1.2Z" />
    </svg>
  )
}

/**
 * Show one quote of a sent message as a truncated chip whose tooltip holds the full text.
 * @param props.text - Full quote text.
 * @returns the inline chip.
 */
export function SentQuoteChip({ text }: { text: string }): ReactNode {
  return (
    <Tooltip label={text} side="top" portal maxWidth={QUOTE_TOOLTIP_WIDTH} delayMs={300}>
      <span className={css.chip} data-message-quote="">
        <QuoteGlyph />
        <span className={css.text}>{text}</span>
      </span>
    </Tooltip>
  )
}

/** Business face of the composer quote dock. */
export interface QuoteDockInjected {
  readonly hooks: {
    /** Unsent quotes of every Session. */
    readonly quotes: HostObservable<ChatQuoteState>
  }
  /**
   * Remove one unsent quote.
   * @param sessionId - Session that holds the quote.
   * @param id - Quote identity.
   */
  removeQuote: (sessionId: PropsRuntime<'conversation.input.dock'>['sessionId'], id: number) => void
}

/**
 * Show this Session's unsent quotes above the composer; the next plain message carries them.
 * @param props - Session identity, quote memory, removal, and copy.
 * @returns the chip row, or null without quotes.
 */
export function QuoteDock({ sessionId, useQuotes, removeQuote, t }: Pick<PropsRuntime<'conversation.input.dock'>, 'sessionId'>
  & InjectFace<QuoteDockInjected> & PropsLocale<'chat'>) {
  const quotes = useQuotes(state => state[sessionId] ?? NO_QUOTES)
  if (quotes.length === 0) return null
  return (
    <div className={css.dock} role="list" aria-label={t('quote.dock')} data-quote-dock="">
      {quotes.map(quote => (
        <div key={quote.id} role="listitem" className={`${css.chip} ${css.dockChip}`}>
          <QuoteGlyph />
          <Tooltip label={quote.text} side="top" portal maxWidth={QUOTE_TOOLTIP_WIDTH} delayMs={300}>
            <span className={css.text} tabIndex={0}>{quote.text}</span>
          </Tooltip>
          <button type="button" className={css.remove} aria-label={t('quote.remove')} title={t('quote.remove')}
            onClick={() => { removeQuote(sessionId, quote.id) }}>
            <IconCloseOutlineRegular size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
