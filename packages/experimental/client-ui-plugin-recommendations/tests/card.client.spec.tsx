// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { LocalizedText } from '@deepseek-ai/dsh-package-manifest'
import { FoldedText } from '@deepseek-ai/dsh-client-ui-action-cards/src/client/Card.tsx'
import type { ActionCardFields, ActionCardResult } from '@deepseek-ai/dsh-action-cards/types'
import type { RecommendationDetails } from '@deepseek-ai/dsh-plugin-recommendations/types'
import { PluginCardBody, type CatalogDetails, type PluginCardProps } from '../src/client/Card.tsx'
import { en, es, el, fr } from '../src/client/locales.ts'

afterEach(cleanup)
const callId = ToolCallId('call-plugin-1')
const ACTION = 'enable_official_plugin'
type Act = (verb: string, payload?: ActionCardFields) => Promise<ActionCardResult | undefined>
type Describe = PluginCardProps['describe']
const available: RecommendationDetails = {
  status: 'available', title: { en: 'Session search', es: 'Búsqueda de sesiones' }, description: { en: 'Search past conversations', es: 'Busca en conversaciones pasadas' }, enabled: false,
}
const proposal = { callId, turn: 1, action: ACTION, title: 'Buscar sesiones antiguas', brief: 'Te ayuda a encontrar el plan comentado la semana pasada', details: { name: 'official-search' } as ActionCardFields }

function catalog() {
  return createSnapshotStore<Readonly<Record<string, CatalogDetails>>>({})
}

function props(decision?: { phase: string; data?: ActionCardFields }, details: RecommendationDetails = available, store = catalog()) {
  return {
    proposal, decision: decision === undefined ? undefined : { callId, action: ACTION, ...decision },
    sessionId: SessionId('session-1'), summary: <strong>{proposal.title}</strong>, Folded: FoldedText,
    act: vi.fn<Act>(async () => ({ status: 'settled', decision: { callId, action: ACTION, phase: 'enabled' } })),
    catalog: store, describe: vi.fn<Describe>(async () => details), openDetails: vi.fn<(name: string) => void>(),
    resolveText: (text: LocalizedText) => typeof text === 'string' ? text : text.es ?? text.en,
    t: makeTranslate(es),
  } satisfies PluginCardProps
}

async function shown(value: PluginCardProps) {
  const view = render(<PluginCardBody {...value} />)
  await waitFor(() => { expect(value.describe).toHaveBeenCalledWith('session-1', callId) })
  await act(async () => {})
  return view
}

/** Text a screen reader announces as the element's description. */
function description(element: HTMLElement) {
  return element.getAttribute('aria-describedby')?.split(' ').map(id => document.getElementById(id)?.textContent)
}

it('keeps every dictionary aligned', () => {
  for (const dictionary of [en, el, fr]) expect(Object.keys(dictionary).sort()).toEqual(Object.keys(es).sort())
})

it('shows the catalog title and description as one details target with the official badge, and enables only on click', async () => {
  const value = props()
  await shown(value)
  expect(screen.getByText('Complemento recomendado')).toBeTruthy()
  expect(screen.getByText('Oficial')).toBeTruthy()
  const details = screen.getByRole('button', { name: 'Ver detalles: Búsqueda de sesiones' })
  expect(details.textContent).toBe('Búsqueda de sesionesBusca en conversaciones pasadas')
  // The details label names the plugin; the catalog description stays readable as its description. The model's brief is not shown.
  expect(description(details)).toEqual(['Busca en conversaciones pasadas'])
  expect(screen.queryByText(proposal.brief)).toBeNull()
  expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual([details.textContent, 'Ahora no', 'Habilitar'])
  expect(screen.getByText('Disponible en todas las conversaciones una vez habilitado')).toBeTruthy()
  expect(value.act).not.toHaveBeenCalled()
  fireEvent.click(details)
  expect(value.openDetails).toHaveBeenCalledWith('official-search')
  fireEvent.click(screen.getByRole('button', { name: 'Habilitar' }))
  await waitFor(() => { expect(value.act).toHaveBeenCalledExactlyOnceWith('enable') })
})

it.each([
  ['dismiss', 'Ahora no', 'Habilitar'],
  ['enable', 'Habilitar', 'Ahora no'],
] as const)('marks only the clicked %s action as working and disables both until the request settles', async (verb, clicked, other) => {
  const value = props()
  const pending = Promise.withResolvers<ActionCardResult | undefined>()
  value.act = vi.fn<Act>(() => pending.promise)
  await shown(value)
  fireEvent.click(screen.getByRole('button', { name: clicked }))
  expect(value.act).toHaveBeenCalledWith(verb)
  expect(screen.getByRole('button', { name: 'Procesando…' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: other }).hasAttribute('disabled')).toBe(true)
  await act(async () => { pending.resolve({ status: 'settled', decision: { callId, action: ACTION, phase: 'dismissed' } }) })
  expect(screen.getByRole('button', { name: clicked }).hasAttribute('disabled')).toBe(false)
})

it.each([
  [{ phase: 'enabled' }, es.enabled],
  [{ phase: 'enabled', data: { application: 'restart-required' } }, es['restart-required']],
  [{ phase: 'already-enabled' }, es['already-enabled']],
  [{ phase: 'dismissed' }, es.dismissed],
  [{ phase: 'replaced' }, es.replaced],
] as const)('shows the settled %j state without actions', async (decision, copy) => {
  await shown(props(decision))
  expect(screen.getByRole('status').textContent).toBe(copy)
  expect(screen.queryByRole('button', { name: 'Habilitar' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Reintentar habilitación' })).toBeNull()
})

it('names no status for a phase it does not know, and offers no action', async () => {
  await shown(props({ phase: 'future-phase', data: { application: 42 } }))
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Habilitar' })).toBeNull()
})

it.each([
  [{ phase: 'failed' }, es.failed, undefined],
  [{ phase: 'failed', data: { errorCode: 'incompatible-version' } }, es.failed, es['version-error']],
  [{ phase: 'failed', data: { errorCode: 'operation-error' } }, es.failed, es['management-error']],
  [{ phase: 'unconfirmed' }, es.unconfirmed, undefined],
] as const)('offers a retry after %j', async (decision, status, alert) => {
  const value = props(decision)
  await shown(value)
  expect(screen.getByRole('status').textContent).toBe(status)
  expect(screen.queryByRole('alert')?.textContent).toBe(alert)
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar habilitación' }))
  await waitFor(() => { expect(value.act).toHaveBeenCalledWith('enable') })
})

it('shows a plugin already selected in Plugins as enabled without actions', async () => {
  await shown(props(undefined, { ...available, enabled: true }))
  expect(screen.getByRole('status').textContent).toBe(es['already-enabled'])
  expect(screen.queryByRole('button', { name: 'Habilitar' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Ahora no' })).toBeNull()
})

it.each([
  [{ status: 'refused', reason: 'unavailable' }, es.unavailable],
  [{ status: 'refused', reason: 'closing' }, es.closing],
  [undefined, es['lookup-failed']],
  ['offline', es['lookup-failed']],
] as const)('offers Not now and a retry of the lookup, but not Enable, after the lookup answers %j', async (answer, message) => {
  const value = props()
  value.describe = vi.fn<Describe>(async () => available).mockImplementationOnce(async () => {
    if (answer === 'offline') throw new Error('offline')
    return answer
  })
  await shown(value)
  expect(screen.getByRole('alert').textContent).toBe(message)
  const details = screen.getByRole('button', { name: 'Ver detalles: Buscar sesiones antiguas' })
  expect(description(details)).toBeUndefined()
  expect(screen.queryByRole('button', { name: 'Habilitar' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
  await waitFor(() => { expect(value.act).toHaveBeenCalledExactlyOnceWith('dismiss') })
  fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
  await waitFor(() => { expect(screen.getByRole('button', { name: 'Habilitar' }).hasAttribute('disabled')).toBe(false) })
  expect(value.describe).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Intentar de nuevo' })).toBeNull()
})

it('keeps the recorded outcome of an enabled card whose plugin has left the catalog', async () => {
  await shown(props({ phase: 'enabled' }, { status: 'refused', reason: 'unavailable' }))
  expect(screen.getByRole('status').textContent).toBe(es.enabled)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByRole('button', { name: 'Ver detalles: Buscar sesiones antiguas' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Intentar de nuevo' })).toBeNull()
})

it('holds the description and action lines while the first catalog lookup is pending', async () => {
  const loading = props()
  const lookup = Promise.withResolvers<RecommendationDetails | undefined>()
  loading.describe = vi.fn<Describe>(() => lookup.promise)
  const { container } = render(<PluginCardBody {...loading} />)
  const body = container.querySelector('[aria-busy="true"]')
  expect(body).not.toBeNull()
  const details = screen.getByRole('button', { name: 'Ver detalles: Buscar sesiones antiguas' })
  expect(within(details).getByText('Buscar sesiones antiguas')).toBeTruthy()
  expect(description(details)).toBeUndefined()
  expect(container.querySelectorAll('button span > span')).toHaveLength(1)
  expect(screen.getByText('Disponible en todas las conversaciones una vez habilitado')).toBeTruthy()
  for (const name of ['Ahora no', 'Habilitar']) expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(true)
  await act(async () => { lookup.resolve(available) })
  expect(body!.hasAttribute('aria-busy')).toBe(false)
  expect(within(screen.getByRole('button', { name: 'Ver detalles: Búsqueda de sesiones' })).getByText('Busca en conversaciones pasadas')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Habilitar' }).hasAttribute('disabled')).toBe(false)
  expect(loading.catalog.getSnapshot()).toEqual({ 'official-search': available })
  cleanup()
  const left = props()
  const late = Promise.withResolvers<RecommendationDetails | undefined>()
  left.describe = vi.fn<Describe>(() => late.promise)
  render(<PluginCardBody {...left} />).unmount()
  await act(async () => { late.resolve(available) })
  expect(left.catalog.getSnapshot()).toEqual({})
  const failing = props()
  const rejected = Promise.withResolvers<RecommendationDetails | undefined>()
  failing.describe = vi.fn<Describe>(() => rejected.promise)
  render(<PluginCardBody {...failing} />).unmount()
  await act(async () => { rejected.reject(new Error('late')) })
})

it('renders a remembered plugin at once on a later card while refusals and lost replies still decide its actions', async () => {
  const shared = catalog()
  await shown(props(undefined, available, shared))
  cleanup()
  const revisit = props(undefined, available, shared)
  const lookup = Promise.withResolvers<RecommendationDetails | undefined>()
  revisit.describe = vi.fn<Describe>(() => lookup.promise)
  const { container } = render(<PluginCardBody {...revisit} />)
  expect(container.querySelector('[aria-busy]')).toBeNull()
  expect(within(screen.getByRole('button', { name: 'Ver detalles: Búsqueda de sesiones' })).getByText('Busca en conversaciones pasadas')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Habilitar' }).hasAttribute('disabled')).toBe(false)
  await act(async () => { lookup.resolve({ ...available, enabled: true }) })
  expect(screen.getByRole('status').textContent).toBe(es['already-enabled'])
  cleanup()
  await shown(props(undefined, { status: 'refused', reason: 'unavailable' }, shared))
  expect(screen.getByRole('alert').textContent).toBe(es.unavailable)
  expect(screen.queryByRole('button', { name: 'Habilitar' })).toBeNull()
})

it('renders only the frame summary when the card names no plugin', () => {
  const value = { ...props(), proposal: { ...proposal, details: {} } }
  render(<PluginCardBody {...value} />)
  expect(screen.getByText('Buscar sesiones antiguas')).toBeTruthy()
  expect(screen.queryByRole('button')).toBeNull()
  expect(value.describe).not.toHaveBeenCalled()
})

it.each([
  [undefined, es.transport],
  [{ status: 'refused', reason: 'access-denied' }, es['access-denied']],
  [{ status: 'refused', reason: 'read-only' }, es.unavailable],
  [{ status: 'unconfirmed', reason: 'closing' }, es.closing],
] as const)('explains an unsuccessful click: %j', async (result, message) => {
  const value = props()
  value.act = vi.fn<Act>(async () => result)
  await shown(value)
  fireEvent.click(screen.getByRole('button', { name: 'Habilitar' }))
  expect((await screen.findByRole('alert')).textContent).toBe(message)
})

it('treats a lost reply as unconfirmed rather than failed', async () => {
  const value = props()
  value.act = vi.fn<Act>(async () => { throw new Error('connection reset') })
  await shown(value)
  fireEvent.click(screen.getByRole('button', { name: 'Habilitar' }))
  expect((await screen.findByRole('alert')).textContent).toBe(es.transport)
})
