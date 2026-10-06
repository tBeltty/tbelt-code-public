/**
 * The Quote action for text selected in assistant messages. It appears after a
 * pointer or keyboard selection settles inside one `[data-chat-quote-source]`
 * element of the Chat column, follows the selection while the Chat scrolls,
 * and hides when the selection collapses or leaves assistant text.
 */
import { useCallback, useEffect, useState, type ReactNode, type RefObject } from 'react'
import { ShortcutKeys } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps, QuoteShortcut } from '../contract/slots.ts'
import { QuoteGlyph } from './QuoteChip.tsx'
import { normalizeQuoteText } from './quotes.ts'
import css from './Quote.module.css'

/** Attribute that marks assistant text a user can quote. */
export const QUOTE_SOURCE_ATTRIBUTE = 'data-chat-quote-source'

/** Gap between the selection's last line and the action, in pixels. */
const ACTION_GAP = 6
/** Room kept for the action at the viewport's right edge, in pixels. */
const ACTION_ROOM = 140

interface QuotableSelection {
  readonly text: string
  readonly top: number
  readonly left: number
}

/**
 * Read the current selection when both of its ends lie inside one quotable element of the container.
 * @param container - Chat column element.
 * @returns the normalized text and the action position below the selection's bottom-right corner, or undefined.
 */
export function readQuotableSelection(container: Element): QuotableSelection | undefined {
  const selection = window.getSelection()
  /* v8 ignore next -- getSelection() returns null only for a document without a browsing context. */
  if (selection === null || selection.rangeCount === 0) return undefined
  const range = selection.getRangeAt(0)
  const owner = [...container.querySelectorAll(`[${QUOTE_SOURCE_ATTRIBUTE}]`)]
    .find(source => source.contains(range.startContainer) && source.contains(range.endContainer))
  if (owner === undefined) return undefined
  const text = normalizeQuoteText(range.toString())
  if (text === '') return undefined
  const rect = range.getBoundingClientRect()
  return {
    text,
    top: rect.bottom + ACTION_GAP,
    left: Math.max(0, Math.min(rect.right - ACTION_ROOM / 2, window.innerWidth - ACTION_ROOM)),
  }
}

/**
 * Whether a keydown is the fixed Quote shortcut: Command+L on macOS, Control+L elsewhere.
 * @param event - Keyboard event.
 * @param mac - Whether the primary modifier is Command.
 * @returns true for an unrepeated, uncomposed primary+L press.
 */
export function isQuoteShortcut(event: KeyboardEvent, mac: boolean): boolean {
  return event.code === 'KeyL' && !event.repeat && !event.isComposing && !event.altKey && !event.shiftKey
    && (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)
}

/**
 * Track quotable selections in the container and render the Quote action.
 * @param props.container - Chat column element that owns the selections; render this action outside it.
 * @param props.quote - Add text to the Session's unsent quotes.
 * @param props.shortcut - Fixed shortcut, or undefined when the action has none.
 * @param props.t - Chat copy.
 * @returns the positioned action, or null without a quotable selection.
 */
export function QuoteSelectionAction({ container, quote, shortcut, t }: {
  container: RefObject<HTMLElement>
  quote: (text: string) => void
  shortcut: QuoteShortcut | undefined
  t: ChatViewSlotProps['t']
}): ReactNode {
  const [current, setCurrent] = useState<QuotableSelection | undefined>()
  const read = useCallback(
    /* v8 ignore next -- the column mounts with this action and never unmounts before it. */
    () => container.current === null ? undefined : readQuotableSelection(container.current),
    [container],
  )
  const refresh = useCallback(() => { setCurrent(read()) }, [read])
  const commit = useCallback((text: string) => {
    quote(text)
    window.getSelection()?.removeAllRanges()
    setCurrent(undefined)
  }, [quote])

  useEffect(() => {
    const element = container.current
    /* v8 ignore next -- the column mounts with this action and never unmounts before it. */
    if (element === null) return undefined
    let pointerDown = false
    const onPointerDown = (): void => { pointerDown = true; setCurrent(undefined) }
    const onPointerUp = (): void => { pointerDown = false; refresh() }
    // Keyboard selection settles on keyup; pointer selection waits for release.
    const onSelectionChange = (): void => {
      if (pointerDown) return
      if (window.getSelection()?.isCollapsed !== false) setCurrent(undefined)
    }
    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('keyup', refresh)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('selectionchange', onSelectionChange)
    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('keyup', refresh)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('selectionchange', onSelectionChange)
    }
  }, [container, refresh])

  const visible = current !== undefined
  useEffect(() => {
    if (!visible) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { setCurrent(undefined); return }
      if (shortcut === undefined || !isQuoteShortcut(event, shortcut.mac)) return
      const selection = read()
      if (selection === undefined) return
      event.preventDefault()
      event.stopPropagation()
      commit(selection.text)
    }
    // The action is viewport-positioned, so it follows the selection while any ancestor scrolls.
    window.addEventListener('scroll', refresh, true)
    window.addEventListener('resize', refresh)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('scroll', refresh, true)
      window.removeEventListener('resize', refresh)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [commit, read, refresh, shortcut, visible])

  if (current === undefined) return null
  return (
    <button type="button" className={css.selectionAction} style={{ top: current.top, left: current.left }}
      data-quote-selection-action=""
      onMouseDown={(event) => { event.preventDefault() }}
      onClick={() => { commit(current.text) }}>
      <QuoteGlyph />
      {t('quote.action')}
      {shortcut !== undefined && <ShortcutKeys keys={shortcut.keys} className={css.keys} />}
    </button>
  )
}
