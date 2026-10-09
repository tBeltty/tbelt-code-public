// @vitest-environment jsdom
/** Chat quotes: message encoding, the selection action, the composer dock, and sent-bubble chips. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { en } from '../src/client/locale.ts'
import { createChatQuotes, formatQuotes, normalizeQuoteText, splitQuotedMessage } from '../src/client/quote/quotes.ts'
import { QuoteDock } from '../src/client/quote/QuoteChip.tsx'
import { isQuoteShortcut, QuoteSelectionAction } from '../src/client/quote/QuoteSelectionAction.tsx'
import type { QuoteShortcut } from '../src/client/contract/slots.ts'
import { PendingSteeringBubble } from '../src/client/chat/MessageItem.tsx'

const t = makeTranslate(en, commonEn)
const SID = 'quote-session' as SessionId

afterEach(cleanup)

describe('quote message text', () => {
  it('normalizes selections before they become quotes', () => {
    expect(normalizeQuoteText('  a  \r\nb\t\r\n\r\n\r\n\r\nc \n')).toBe('a\nb\n\nc')
    expect(normalizeQuoteText(' \n\t ')).toBe('')
  })

  it('round-trips quotes through the message prefix', () => {
    const prefix = formatQuotes([{ text: 'Le quitó el llanto.\n\nLe dejó una obsesión.' }, { text: 'otra' }])
    expect(prefix).toBe('> Le quitó el llanto.\n>\n> Le dejó una obsesión.\n\n> otra')
    expect(splitQuotedMessage(`${prefix}\n\nSuena a contraste binario\n\n> mine`)).toEqual({
      quotes: ['Le quitó el llanto.\n\nLe dejó una obsesión.', 'otra'],
      body: 'Suena a contraste binario\n\n> mine',
    })
  })

  it('puts a quote comment right after its blockquote', () => {
    expect(formatQuotes([{ text: 'a\nb', comment: 'why?' }, { text: 'c' }])).toBe('> a\n> b\n\nwhy?\n\n> c')
    const quotes = createChatQuotes()
    quotes.add(SID, 'text', '  \r\n why?  ')
    quotes.add(SID, 'plain', '   ')
    expect(quotes.store.getSnapshot()[SID]).toEqual([{ id: 1, text: 'text', comment: 'why?' }, { id: 2, text: 'plain' }])
  })

  it('leaves messages without a leading quote block followed by text unchanged', () => {
    for (const text of ['plain', '> only a quote', '> quote\n\n  ', '>not a quote\n\ntext', '> excerpt\nplan comment\n\ntext']) {
      expect(splitQuotedMessage(text)).toEqual({ quotes: [], body: text })
    }
  })
})

describe('sent quote chips', () => {
  it('shows each leading quote as a chip before the typed text', () => {
    render(
      <PendingSteeringBubble content={[{ type: 'text', text: '> Le quitó el llanto.\n\nSuena a contraste binario' }]}
        renderMessageImages={() => null} t={t} />,
    )
    const chip = document.querySelector('[data-message-quote]')
    expect(chip?.textContent).toBe('Le quitó el llanto.')
    expect(chip?.parentElement?.textContent).toBe('Le quitó el llanto.Suena a contraste binario')
  })
})

describe('composer quote dock', () => {
  it('shows a quote comment beside its quote', () => {
    const quotes = createChatQuotes()
    quotes.add(SID, 'quoted', 'my note')
    render(<QuoteDock sessionId={SID} useQuotes={bindSnapshotSelector(quotes.store)} removeQuote={vi.fn()} t={t} />)
    expect(document.querySelector('[data-quote-comment]')?.textContent).toBe('my note')
  })

  it('lists this Session\'s quotes and removes one at a time', () => {
    const quotes = createChatQuotes()
    quotes.add(SID, 'first')
    quotes.add(SID, 'second')
    quotes.add('other' as SessionId, 'elsewhere')
    const removeQuote = vi.fn((sessionId: SessionId, id: number) => { quotes.remove(sessionId, [id]) })
    const view = render(<QuoteDock sessionId={SID} useQuotes={bindSnapshotSelector(quotes.store)} removeQuote={removeQuote} t={t} />)
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(['first', 'second'])
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove quote' })[0]!)
    expect(removeQuote).toHaveBeenCalledWith(SID, 1)
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(['second'])
    act(() => { quotes.remove('missing' as SessionId, [2]) })
    act(() => { quotes.remove(SID, [2]) })
    expect(view.container.querySelector('[data-quote-dock]')).toBeNull()
  })
})

describe('quote selection action', () => {
  // jsdom performs no layout, so Range geometry is supplied for the duration of each case.
  beforeEach(() => {
    const rect = { top: 10, bottom: 30, left: 40, right: 200, width: 160, height: 20, x: 40, y: 10, toJSON: () => ({}) }
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => rect })
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true, value: () => Object.assign([rect], { item: (index: number) => index === 0 ? rect : null }),
    })
  })
  afterEach(() => {
    window.getSelection()?.removeAllRanges()
    Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect')
    Reflect.deleteProperty(Range.prototype, 'getClientRects')
  })

  function Harness({ quote, shortcut }: { quote: (text: string) => void; shortcut: QuoteShortcut | undefined }) {
    const container = useRef<HTMLDivElement>(null)
    return (
      <>
        <div ref={container}>
          <div data-chat-quote-source=""><p>Le quitó el llanto. Le dejó una obsesión.</p></div>
          <div data-chat-quote-source=""><p>Second answer</p></div>
          <p>User text</p>
        </div>
        <QuoteSelectionAction container={container} quote={quote} shortcut={shortcut} t={t} />
      </>
    )
  }

  function select(text: string, start: number, end: number, endText = text): void {
    const range = document.createRange()
    range.setStart(screen.getByText(text).firstChild!, start)
    range.setEnd(screen.getByText(endText).firstChild!, end)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  }

  function settle(text: string): void {
    fireEvent.pointerDown(screen.getByText(text))
    fireEvent.pointerUp(document)
  }

  it('quotes a settled selection inside one assistant message from the button', () => {
    const quote = vi.fn()
    render(<Harness quote={quote} shortcut={{ keys: ['⌘', 'L'], mac: true }} />)
    const source = 'Le quitó el llanto. Le dejó una obsesión.'
    select(source, 20, 41)
    settle(source)
    const action = screen.getByRole('button', { name: /Quote/ })
    expect(action.textContent).toBe('Quote⌘L')
    expect(action.style.top).toBe('36px')
    fireEvent.mouseDown(action)
    fireEvent.click(action)
    expect(quote).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /^Quote/ })).toBeNull()
    const box = document.querySelector('[data-quote-comment-box]')!
    expect(box.textContent).toContain('Le dejó una obsesión.')
    const field = screen.getByPlaceholderText('Write a reply')
    expect(document.activeElement).toBe(field)
    fireEvent.change(field, { target: { value: 'Sounds binary' } })
    fireEvent.keyDown(field, { key: 'Enter', shiftKey: true })
    expect(quote).not.toHaveBeenCalled()
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(quote).toHaveBeenCalledWith('Le dejó una obsesión.', 'Sounds binary')
    expect(window.getSelection()?.isCollapsed).toBe(true)
    expect(document.querySelector('[data-quote-comment-box]')).toBeNull()
  })

  it('confirms with the send button, and adds a plain quote when the comment is empty', () => {
    const quote = vi.fn()
    render(<Harness quote={quote} shortcut={undefined} />)
    select('Second answer', 0, 6)
    settle('Second answer')
    fireEvent.click(screen.getByRole('button', { name: 'Quote' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add quote and comment' }))
    expect(quote).toHaveBeenCalledWith('Second', '')
  })

  it('cancels the comment box with Escape, a composing Enter, or a click outside it', () => {
    const quote = vi.fn()
    render(<Harness quote={quote} shortcut={undefined} />)
    const open = (): HTMLElement => {
      select('Second answer', 0, 6)
      settle('Second answer')
      fireEvent.click(screen.getByRole('button', { name: 'Quote' }))
      return screen.getByPlaceholderText('Write a reply')
    }
    let field = open()
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true })
    expect(document.querySelector('[data-quote-comment-box]')).not.toBeNull()
    fireEvent.pointerDown(field)
    expect(document.querySelector('[data-quote-comment-box]')).not.toBeNull()
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(document.querySelector('[data-quote-comment-box]')).toBeNull()
    field = open()
    fireEvent.pointerDown(screen.getByText('User text'))
    expect(document.querySelector('[data-quote-comment-box]')).toBeNull()
    expect(quote).not.toHaveBeenCalled()
  })

  it('opens the comment box with the platform shortcut and ignores other keys', () => {
    const quote = vi.fn()
    render(<Harness quote={quote} shortcut={{ keys: ['Ctrl', '+', 'L'], mac: false }} />)
    select('Second answer', 0, 6)
    fireEvent.keyUp(screen.getByText('Second answer'))
    fireEvent.keyDown(document, { code: 'KeyL', metaKey: true })
    expect(document.querySelector('[data-quote-comment-box]')).toBeNull()
    fireEvent.keyDown(document, { code: 'KeyL', ctrlKey: true })
    fireEvent.change(screen.getByPlaceholderText('Write a reply'), { target: { value: 'note' } })
    fireEvent.keyDown(screen.getByPlaceholderText('Write a reply'), { key: 'Enter' })
    expect(quote).toHaveBeenCalledWith('Second', 'note')
  })

  it('hides for selections outside one assistant message, on collapse, and on Escape', () => {
    const quote = vi.fn()
    render(<Harness quote={quote} shortcut={undefined} />)
    select('Le quitó el llanto. Le dejó una obsesión.', 0, 6, 'Second answer')
    settle('Second answer')
    expect(screen.queryByRole('button', { name: /Quote/ })).toBeNull()
    select('User text', 0, 4)
    settle('User text')
    expect(screen.queryByRole('button', { name: /Quote/ })).toBeNull()

    select('Second answer', 0, 6)
    settle('Second answer')
    expect(screen.getByRole('button', { name: 'Quote' })).toBeDefined()
    fireEvent.keyDown(document, { code: 'KeyL', ctrlKey: true })
    expect(quote).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: /Quote/ })).toBeNull()

    select('Second answer', 0, 6)
    settle('Second answer')
    act(() => {
      window.getSelection()!.collapseToStart()
      document.dispatchEvent(new Event('selectionchange'))
    })
    expect(screen.queryByRole('button', { name: /Quote/ })).toBeNull()
  })

  it('keeps the action through scrolling and settled selection changes, and quotes nothing once the selection is gone', () => {
    const quote = vi.fn()
    render(<Harness quote={quote} shortcut={{ keys: ['Ctrl', '+', 'L'], mac: false }} />)
    fireEvent.keyUp(screen.getByText('Second answer'))
    expect(screen.queryByRole('button', { name: /Quote/ })).toBeNull()
    select('Le quitó el llanto. Le dejó una obsesión.', 19, 20)
    settle('Second answer')
    expect(screen.queryByRole('button', { name: /Quote/ })).toBeNull()

    select('Second answer', 0, 6)
    fireEvent.pointerDown(screen.getByText('Second answer'))
    act(() => { document.dispatchEvent(new Event('selectionchange')) })
    expect(screen.queryByRole('button', { name: /Quote/ })).toBeNull()
    fireEvent.pointerUp(document)
    act(() => { document.dispatchEvent(new Event('selectionchange')) })
    fireEvent.scroll(window)
    expect(screen.getByRole('button', { name: /Quote/ })).toBeDefined()

    window.getSelection()!.removeAllRanges()
    fireEvent.keyDown(document, { code: 'KeyL', ctrlKey: true })
    expect(quote).not.toHaveBeenCalled()
  })

  it('matches only an unrepeated primary+L press', () => {
    const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', { code: 'KeyL', ...init })
    expect(isQuoteShortcut(key({ metaKey: true }), true)).toBe(true)
    expect(isQuoteShortcut(key({ ctrlKey: true }), true)).toBe(false)
    expect(isQuoteShortcut(key({ ctrlKey: true }), false)).toBe(true)
    expect(isQuoteShortcut(key({ ctrlKey: true, shiftKey: true }), false)).toBe(false)
    expect(isQuoteShortcut(key({ ctrlKey: true, repeat: true }), false)).toBe(false)
    expect(isQuoteShortcut(new KeyboardEvent('keydown', { code: 'KeyK', ctrlKey: true }), false)).toBe(false)
  })
})
