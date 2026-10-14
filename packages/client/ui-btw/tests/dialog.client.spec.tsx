// @vitest-environment jsdom
/**
 * BtwDialog rendering: the modal shows the thread, the sent marker, the pending
 * question, and the field; Enter asks and Shift+Enter does not; the send
 * button carries the "Send context to chat" copy and is disabled when nothing
 * is unsent; clear and close route through the injected verbs; failure and
 * delivery toasts mount from state and retire through their verbs.
 */
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { es as commonEs } from '@deepseek-ai/dsh-client-locale/src/locales/es.ts'
import { BtwDialog } from '../src/client/BtwDialog.tsx'
import type { BtwDialogState } from '../src/client/controller.ts'
import { en, es } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(es, commonEs)

/** Render the entry over a fixed state and recording verbs. */
function mount(overrides: Partial<BtwDialogState> = {}) {
  const state: BtwDialogState = {
    open: true, turns: [], sentTurns: 0, draft: '', pending: null, sending: false, failure: null, toast: 0,
    ...overrides,
  }
  const verbs = {
    edit: vi.fn(),
    ask: vi.fn(() => Promise.resolve()),
    send: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve()),
    dismiss: vi.fn(),
    dismissFailure: vi.fn(),
    dismissToast: vi.fn(),
  }
  const useDialog = (<T,>(select: (v: BtwDialogState) => T): T =>
    useSyncExternalStore(() => () => {}, () => select(state))) as never
  const props = { useDialog, ...verbs, t } as Parameters<typeof BtwDialog>[0]
  return { ...render(<BtwDialog {...props} />), ...verbs }
}

describe('BtwDialog', () => {
  it('names the send button in both supported locales', () => {
    expect(en['action.send']).toBe('Send context to chat')
    expect(es['action.send']).toBe('Enviar contexto a chat')
  })

  it('renders nothing but the probe while closed', () => {
    const ui = mount({ open: false })
    expect(ui.queryByRole('dialog')).toBeNull()
  })

  it('shows the empty hint before any question', () => {
    const ui = mount()
    expect(ui.getByRole('dialog', { name: es['dialog.title'] })).toBeTruthy()
    expect(ui.getByText(es['thread.empty'])).toBeTruthy()
    expect(ui.getByRole('button', { name: es['action.send'] }).hasAttribute('disabled')).toBe(true)
    expect(ui.getByRole('button', { name: es['action.clear'] }).hasAttribute('disabled')).toBe(true)
  })

  it('lists exchanges, marks the delivered ones, and shows the pending question', () => {
    const ui = mount({
      turns: [{ question: 'first?', answer: 'one' }, { question: 'second?', answer: 'two' }],
      sentTurns: 1,
      pending: 'third?',
    })
    const log = ui.getByRole('log', { name: es['thread.label'] })
    expect(log.textContent).toContain('first?')
    expect(log.textContent).toContain('two')
    expect(ui.getAllByText(es['thread.sent'])).toHaveLength(1)
    expect(ui.getByText('third?')).toBeTruthy()
    expect(ui.getByText(es['thread.pending'])).toBeTruthy()
    expect(ui.getByRole('button', { name: es['action.asking'] }).hasAttribute('disabled')).toBe(true)
  })

  it('forwards typing, Enter, and the ask button; Shift+Enter only types', () => {
    const ui = mount({ draft: 'why?' })
    const field = ui.getByLabelText(es['input.label'])
    fireEvent.change(field, { target: { value: 'why not?' } })
    expect(ui.edit).toHaveBeenCalledWith('why not?')
    fireEvent.keyDown(field, { key: 'Enter', shiftKey: true })
    expect(ui.ask).not.toHaveBeenCalled()
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(ui.ask).toHaveBeenCalledTimes(1)
    fireEvent.click(ui.getByRole('button', { name: es['action.ask'] }))
    expect(ui.ask).toHaveBeenCalledTimes(2)
  })

  it('disables Ask for a blank field', () => {
    const ui = mount({ draft: '   ' })
    expect(ui.getByRole('button', { name: es['action.ask'] }).hasAttribute('disabled')).toBe(true)
  })

  it('sends the context, clears, and closes through the injected verbs', () => {
    const ui = mount({ turns: [{ question: 'q', answer: 'a' }] })
    fireEvent.click(ui.getByRole('button', { name: es['action.send'] }))
    expect(ui.send).toHaveBeenCalledTimes(1)
    fireEvent.click(ui.getByRole('button', { name: es['action.clear'] }))
    expect(ui.clear).toHaveBeenCalledTimes(1)
    fireEvent.click(ui.getByRole('button', { name: es.close }))
    expect(ui.dismiss).toHaveBeenCalledTimes(1)
  })

  it('shows the sending label while a delivery is in flight', () => {
    const ui = mount({ turns: [{ question: 'q', answer: 'a' }], sending: true })
    expect(ui.getByRole('button', { name: es['action.sending'] }).hasAttribute('disabled')).toBe(true)
  })

  it('renders the failure copy by code, falling back to the generic line', () => {
    const known = mount({ failure: 'no-route' })
    expect(known.getByText(es['error.noRoute'])).toBeTruthy()
    cleanup()
    const generic = mount({ failure: 'transport' })
    expect(generic.getByText(es['error.generic'])).toBeTruthy()
  })

  it('shows the delivery toast from the toast sequence', () => {
    const ui = mount({ toast: 3 })
    expect(ui.getByText(es['toast.sent'])).toBeTruthy()
  })

  it('retires the failure and delivery toasts through their verbs when they fade', () => {
    vi.useFakeTimers()
    try {
      const sent = mount({ toast: 1 })
      act(() => { vi.advanceTimersByTime(5000) })
      expect(sent.dismissToast).toHaveBeenCalledWith(1)
      cleanup()
      const failed = mount({ failure: 'transport' })
      act(() => { vi.advanceTimersByTime(8000) })
      expect(failed.dismissFailure).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
