// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { FoldedText } from '@deepseek-ai/dsh-client-ui-action-cards/src/client/Card.tsx'
import type { ActionCardFields, ActionCardResult } from '@deepseek-ai/dsh-action-cards/types'
import { PageCardBody, type PageCardProps } from '../src/client/Card.tsx'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en, es } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
const callId = ToolCallId('creation-1')
const ACTION = 'create_personalized_page'
type Act = (verb: string, payload?: ActionCardFields) => Promise<ActionCardResult | undefined>

function props(decision?: { phase: string; data?: ActionCardFields }, chinese = true, details: ActionCardFields = { slot: 'sidebar-right' }): PageCardProps & { act: ReturnType<typeof vi.fn<Act>> } {
  const proposal = { callId, turn: 1, action: ACTION, title: 'Counter', brief: 'Keep my task count visible.', details }
  return { proposal, decision: decision === undefined ? undefined : { callId, action: ACTION, ...decision },
    sessionId: SessionId('session-1'), summary: <><strong>{proposal.title}</strong><p>{proposal.brief}</p></>, Folded: FoldedText,
    act: vi.fn<Act>(async () => ({ status: 'accepted' })), infoDismissed: createSnapshotStore(true),
    t: makeTranslate(chinese ? es : en) }
}

it('starts with the recommended location, lets the user change it, and starts only on Create', async () => {
  const value = props()
  render(<PageCardBody {...value} />)
  expect(screen.getByText('Counter')).toBeTruthy()
  const location = screen.getByRole('button', { name: 'Añadir a: Barra lateral derecha' })
  expect(screen.queryByRole('menu')).toBeNull()
  fireEvent.click(location)
  expect(screen.getAllByRole('menuitem')).toHaveLength(4)
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()
  fireEvent.click(location)
  fireEvent.click(screen.getByRole('menuitem', { name: /Pestaña de la sesión/ }))
  expect(screen.queryByRole('menu')).toBeNull()
  expect(value.act).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
  await waitFor(() => { expect(value.act).toHaveBeenCalledExactlyOnceWith('create', { slot: 'page' }) })
})

it('requires a written location, preserves its draft, and passes only the chosen location on Create', async () => {
  const value = props()
  const { rerender } = render(<PageCardBody {...value} />)
  fireEvent.click(screen.getByRole('button', { name: 'Añadir a: Barra lateral derecha' }))
  fireEvent.click(screen.getByRole('menuitem', { name: /Describir otra ubicación/ }))
  const input = screen.getByRole('textbox', { name: es.customLabel })
  expect(screen.getByRole('button', { name: 'Crear' }).hasAttribute('disabled')).toBe(true)
  fireEvent.change(input, { target: { value: '  Entrada a la izquierda que abre un calendario a pantalla completa  ' } })
  expect(value.act).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
  await waitFor(() => { expect(value.act).toHaveBeenCalledWith('create', { slot: 'sidebar-right', customLocation: 'Entrada a la izquierda que abre un calendario a pantalla completa' }) })
  rerender(<PageCardBody {...value} />)
  fireEvent.click(screen.getByRole('button', { name: 'Añadir a: Describir otra ubicación' }))
  fireEvent.click(screen.getByRole('menuitem', { name: /Página global/ }))
  expect(screen.queryByRole('textbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
  await waitFor(() => { expect(value.act).toHaveBeenLastCalledWith('create', { slot: 'sidebar-left' }) })
  fireEvent.click(screen.getByRole('button', { name: 'Añadir a: Página global' }))
  fireEvent.click(screen.getByRole('menuitem', { name: /Describir otra ubicación/ }))
  expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('  Entrada a la izquierda que abre un calendario a pantalla completa  ')
})

it('shows the recorded placement once settled, not the location picked before the decision', () => {
  const value = props(undefined, false)
  const { rerender } = render(<PageCardBody {...value} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add to: Right sidebar' }))
  fireEvent.click(screen.getByRole('menuitem', { name: /Write your own/ }))
  fireEvent.change(screen.getByRole('textbox', { name: en.customLabel }), { target: { value: 'Next to the composer' } })
  rerender(<PageCardBody {...props({ phase: 'dismissed', data: { slot: 'sidebar-right' } }, false)} />)
  expect(screen.getByText('Add to · Right sidebar')).toBeTruthy()
  expect(screen.queryByText(/Next to the composer/)).toBeNull()
})

it('restores a written location after cancellation and preserves it on retry', async () => {
  const value = props({ phase: 'cancelled', data: { slot: 'page', customLocation: 'Ver el contexto de la sesión actual a la derecha' } })
  const { rerender } = render(<PageCardBody {...value} />)
  expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('Ver el contexto de la sesión actual a la derecha')
  fireEvent.click(screen.getByRole('button', { name: 'Crear de nuevo' }))
  await waitFor(() => { expect(value.act).toHaveBeenCalledWith('create', { slot: 'page', customLocation: 'Ver el contexto de la sesión actual a la derecha' }) })
  rerender(<PageCardBody {...props({ phase: 'installed', data: { slot: 'page', customLocation: 'Ver el contexto de la sesión actual a la derecha' } })} />)
  expect(screen.getByText('Añadir a · Ver el contexto de la sesión actual a la derecha')).toBeTruthy()
})

it('opens the cost notice until dismissed, remembers dismissal, and allows reopening', () => {
  const value = props()
  value.infoDismissed.set(false)
  const first = render(<PageCardBody {...value} />)
  expect(screen.getByRole('note').textContent).toContain(es.creationCost)
  fireEvent.click(screen.getByRole('button', { name: es.creationInfo }))
  expect(value.infoDismissed.getSnapshot()).toBe(true)
  expect(screen.queryByRole('note')).toBeNull()
  first.unmount()
  render(<PageCardBody {...value} />)
  expect(screen.queryByRole('note')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: es.creationInfo }))
  expect(screen.getByRole('note').textContent).toContain(es.creationBackground)
  expect(value.act).not.toHaveBeenCalled()
})

it('disables pending decisions, labels only a pending Create as starting, and supports dismissal without starting a child', async () => {
  const value = props()
  value.infoDismissed.set(false)
  const dismissal = Promise.withResolvers<ActionCardResult | undefined>()
  const creation = Promise.withResolvers<ActionCardResult | undefined>()
  value.act.mockReturnValueOnce(dismissal.promise).mockReturnValueOnce(creation.promise)
  render(<PageCardBody {...value} />)
  fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
  expect(value.infoDismissed.getSnapshot()).toBe(true)
  expect(screen.getByRole('button', { name: 'Añadir a: Barra lateral derecha' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: 'Ahora no' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: 'Crear' }).hasAttribute('disabled')).toBe(true)
  expect(screen.queryByRole('button', { name: 'Iniciando…' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: es.creationInfo }))
  expect(screen.getByRole('note').textContent).toContain(es.creationCost)
  expect(value.act).toHaveBeenCalledWith('dismiss', { slot: 'sidebar-right' })
  await act(async () => { dismissal.resolve({ status: 'settled', decision: { callId, action: ACTION, phase: 'dismissed' } }) })
  fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
  expect(screen.getByRole('button', { name: 'Iniciando…' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: 'Ahora no' }).hasAttribute('disabled')).toBe(true)
  await act(async () => { creation.resolve({ status: 'accepted' }) })
  expect(screen.getByRole('button', { name: 'Crear' }).hasAttribute('disabled')).toBe(false)
})

it.each(['installing', 'dismissed', 'replaced'] as const)('restores %s without repeat actions', (phase) => {
  render(<PageCardBody {...props(phase === 'replaced' ? { phase } : { phase, data: { slot: 'sidebar-left' } }, false, { slot: 'sidebar-left' })} />)
  expect(screen.getByRole('status').textContent).toBe(en[phase])
  expect(screen.getAllByRole('button')).toEqual([screen.getByRole('button', { name: en.creationInfo })])
  expect(screen.getByText('Add to · Global page')).toBeTruthy()
})

it.each([true, false])('explains cost and background creation without starting work (Chinese: %s)', (chinese) => {
  const value = props(undefined, chinese)
  const copy = chinese ? es : en
  render(<PageCardBody {...value} />)
  const button = screen.getByRole('button', { name: copy.creationInfo })
  expect(screen.queryByRole('note')).toBeNull()
  expect(button.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(button)
  const note = screen.getByRole('note')
  expect(note.id).toBe(button.getAttribute('aria-controls'))
  expect(button.getAttribute('aria-expanded')).toBe('true')
  expect(note.textContent).toContain(copy.creationMethod)
  expect(note.textContent).toContain(copy.creationCost)
  expect(note.textContent).toContain(copy.creationBackground)
  expect(screen.getByRole('button', { name: copy.create }).hasAttribute('disabled')).toBe(false)
  fireEvent.click(button)
  expect(screen.queryByRole('note')).toBeNull()
  expect(value.act).not.toHaveBeenCalled()
})

it('offers cancellation during generation, then waits for cleanup before retrying', async () => {
  const value = props({ phase: 'creating', data: { slot: 'page', bundleName: '@dsh-local/view-fixture' } })
  const pending = Promise.withResolvers<ActionCardResult | undefined>()
  value.act.mockImplementation(() => pending.promise)
  const { rerender } = render(<PageCardBody {...value} />)
  expect(screen.queryByText(es.sourceRetained)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: es.creationInfo }))
  expect(screen.getByText(es.sourceRetained)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar creación' }))
  expect(value.act).toHaveBeenCalledWith('cancel', undefined)
  expect(screen.getByRole('button', { name: 'Cancelando…' }).hasAttribute('disabled')).toBe(true)
  expect(screen.queryByRole('button', { name: 'Crear de nuevo' })).toBeNull()
  await act(async () => { pending.resolve({ status: 'accepted' }) })
  rerender(<PageCardBody {...props({ phase: 'cancelled', data: { slot: 'page' } })} />)
  expect(screen.getByRole('button', { name: 'Crear de nuevo' })).toBeTruthy()
  rerender(<PageCardBody {...props({ phase: 'installing', data: { slot: 'page' } })} />)
  expect(screen.getByRole('status').textContent).toBe(es.installing)
  expect(screen.queryByRole('button', { name: 'Cancelar creación' })).toBeNull()
})

it.each(['failed', 'interrupted', 'cancelled', 'unconfirmed'] as const)('offers an explicit retry after %s', async (phase) => {
  const value = props({ phase, data: { slot: 'page' } })
  render(<PageCardBody {...value} />)
  fireEvent.click(screen.getByRole('button', { name: 'Crear de nuevo' }))
  await waitFor(() => { expect(value.act).toHaveBeenCalledWith('create', { slot: 'page' }) })
})

it('retains installed and kept plugins with an Undo action and the actual application outcome', async () => {
  const value = props({ phase: 'installed', data: { slot: 'page', application: 'applied' } })
  const { rerender } = render(<PageCardBody {...value} />)
  expect(screen.getAllByRole('status')).toHaveLength(1)
  expect(screen.getByText(es.scope)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Conservar' }))
  await waitFor(() => { expect(value.act).toHaveBeenCalledWith('keep', undefined) })
  const kept = props({ phase: 'kept', data: { slot: 'page', application: 'restart-required' } })
  rerender(<PageCardBody {...kept} />)
  expect(screen.queryByRole('button', { name: 'Conservar' })).toBeNull()
  expect(screen.getByText(es['restart-required'])).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
  await waitFor(() => { expect(kept.act).toHaveBeenCalledWith('undo', undefined) })
})

it('offers only Restore on a removed card, labels it while pending and explains missing page files', async () => {
  const value = props({ phase: 'removed', data: { slot: 'page', bundleName: '@dsh-local/view-fixture', application: 'applied' } })
  const pending = Promise.withResolvers<ActionCardResult | undefined>()
  value.act.mockImplementation(() => pending.promise)
  render(<PageCardBody {...value} />)
  expect(screen.getByRole('status').textContent).toBe(es.removed)
  const restore = screen.getByRole('button', { name: es.restore })
  expect(screen.getAllByRole('button')).toEqual([screen.getByRole('button', { name: es.creationInfo }), restore])
  expect(restore.closest('footer')).not.toBeNull()
  fireEvent.click(restore)
  expect(value.act).toHaveBeenCalledExactlyOnceWith('restore', undefined)
  expect(screen.getByRole('button', { name: es.restoring }).hasAttribute('disabled')).toBe(true)
  await act(async () => { pending.resolve({ status: 'refused', reason: 'source-missing' }) })
  expect(screen.getByRole('alert').textContent).toBe(es['source-missing'])
  expect(screen.getByRole('button', { name: es.restore }).hasAttribute('disabled')).toBe(false)
})

it.each([
  ['installed', 'failed', es.applicationFailed],
  ['kept', 'cancelled', es.applicationCancelled],
  ['removed', 'overridden', es.overridden],
] as const)('describes a %s receipt whose change ended %s with application copy, not phase copy', (phase, application, text) => {
  render(<PageCardBody {...props({ phase, data: { slot: 'page', application } })} />)
  expect(screen.getAllByRole('status').map(status => status.textContent)).toEqual([es[phase], text])
})

it('leaves a failed creation to its phase line when the change also failed to apply', () => {
  render(<PageCardBody {...props({ phase: 'failed', data: { slot: 'page', application: 'failed' } })} />)
  expect(screen.getAllByRole('status').map(status => status.textContent)).toEqual([es.failed])
})

it('keeps uncertain actions recoverable on refusal and connection loss', async () => {
  const value = props()
  value.act.mockResolvedValueOnce({ status: 'refused', reason: 'unavailable' })
    .mockResolvedValueOnce({ status: 'refused', reason: 'read-only' })
    .mockResolvedValueOnce({ status: 'unconfirmed', reason: 'later-reason' })
    .mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('disconnected'))
  render(<PageCardBody {...value} />)
  for (const text of [es.unavailable, es['read-only'], es.unavailable, es.transport, es.transport]) {
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(text) })
  }
})

it('shows supplied initial content as folded data below the plan and omits it otherwise', () => {
  const view = render(<PageCardBody {...props()} />)
  expect(screen.queryByText('Comienza con')).toBeNull()
  const items = '1. Exportación correcta\n2. Aviso claro sin conexión'
  view.rerender(<PageCardBody {...props(undefined, true, { slot: 'sidebar-right', initialContent: items })} />)
  expect(screen.getByText('Comienza con')).toBeTruthy()
  expect(screen.getByText(/Exportación correcta/).textContent).toBe(items)
  expect(screen.queryByRole('button', { name: 'Ver todo el contenido' })).toBeNull()
  view.rerender(<PageCardBody {...props(undefined, true, { slot: 'sidebar-right', initialContent: '条'.repeat(131) })} />)
  fireEvent.click(screen.getByRole('button', { name: 'Ver todo el contenido' }))
  expect(screen.getByRole('button', { name: 'Contraer contenido' }).getAttribute('aria-expanded')).toBe('true')
})

it('falls back to the summary for invalid fields and ignores unknown phases and invalid data', () => {
  const invalid = render(<PageCardBody {...props(undefined, true, { slot: 'elsewhere' })} />)
  expect(screen.getByText('Counter')).toBeTruthy()
  expect(screen.queryByRole('button')).toBeNull()
  invalid.unmount()
  render(<PageCardBody {...props({ phase: 'archived', data: { slot: 'elsewhere' } }, false)} />)
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getByText('Add to · Right sidebar')).toBeTruthy()
})
