// @vitest-environment jsdom
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { allowAllAccess, bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { LanguageRow } from '../src/client/LanguageRow.tsx'
import type { LanguageRowComponentProps } from '../src/client/LanguageRow.tsx'
import { createLanguageRowStore } from '../src/client/settings-store.ts'

// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

afterEach(cleanup)

const OPTIONS = [{ id: 'en', label: 'English' }, { id: 'es', label: 'Español' }]
const COPY: Record<string, string> = { 'language.title': 'Language', 'language.auto': 'Automatic' }

function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
  return bindSnapshotSelector(store)
}
function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  })
  return bindSnapshotSelector(store)
}

type AttentionSnapshot = Parameters<Parameters<LanguageRowComponentProps['useSessionStatus']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionStatus: LanguageRowComponentProps['useSessionStatus'] = selector => selector(noAttention)

function mount(preference: string | null = 'en') {
  // Real store instance — the sanctioned zero-machinery path for tests.
  const store = createLanguageRowStore().create()
  store.actions.sync(preference ?? 'en', preference ?? undefined, OPTIONS, 0)
  const setLocale = vi.fn()
  const clearLocale = vi.fn()
  const props: LanguageRowComponentProps = {
    useSessions: emptySessions(),
    useSessionStatus,
    usePanelInfo, useSessionRetainInfo: () => undefined, useResource,
    useWorkspaces: emptyWorkspaces(),
    ...allowAllAccess,
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: (key: string) => COPY[key] ?? key,
    setLocale,
    clearLocale,
  }
  render(<LanguageRow {...props} />)
  return { store, setLocale, clearLocale }
}

describe('LanguageRow', () => {
  it('shows the title and the active locale label on the selector pill', () => {
    mount('en')
    expect(screen.getByText('Language')).toBeDefined()
    const trigger = screen.getByRole('button', { name: /English/ })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('opens the menu, selects a locale, and closes', () => {
    const b = mount('en')
    const trigger = screen.getByRole('button', { name: /English/ })
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Español' }))
    expect(b.setLocale).toHaveBeenCalledWith('es')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('menuitem', { name: 'Español' })).toBeNull()
  })

  it('closes on outside pointerdown without selecting', () => {
    const b = mount('en')
    fireEvent.click(screen.getByRole('button', { name: /English/ }))
    expect(screen.getByRole('menuitem', { name: 'Español' })).toBeDefined()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menuitem', { name: 'Español' })).toBeNull()
    expect(b.setLocale).not.toHaveBeenCalled()
  })

  it('follows store changes; an unknown active id falls back to the id itself', () => {
    const b = mount('en')
    act(() => { b.store.actions.sync('es', 'es', OPTIONS, 1) })
    expect(screen.getByRole('button', { name: /Español/ })).toBeDefined()
    act(() => { b.store.actions.sync('fr', 'fr', OPTIONS, 2) })
    expect(screen.getByRole('button', { name: /fr/ })).toBeDefined()
  })

  it('shows Automatic without a saved preference and clears the preference when picked', () => {
    const b = mount(null)
    const trigger = screen.getByRole('button', { name: /Automatic/ })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'English' }))
    expect(b.setLocale).toHaveBeenCalledWith('en')
    act(() => { b.store.actions.sync('en', 'en', OPTIONS, 1) })
    fireEvent.click(screen.getByRole('button', { name: /English/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Automatic' }))
    expect(b.clearLocale).toHaveBeenCalledTimes(1)
    expect(b.setLocale).toHaveBeenCalledTimes(1)
  })
})
