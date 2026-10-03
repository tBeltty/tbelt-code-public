// @vitest-environment jsdom
/** The web-search page as the Plugins page renders it: the provider choice, its key control, and the key verdict. */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsFieldState, SettingsFormShell } from '@deepseek-ai/dsh-client-ui-primitives'
import { WebSearchCard, type WebSearchCardProps } from '../src/client/WebSearchCard.tsx'
import type { WebSearchCardState } from '../src/client/web-search-card-controller.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const t = (key: keyof typeof en) => en[key]

const settled: SettingsFormShell = { available: true, writable: true, dirty: false, invalid: false, saving: false, failed: false }

function field(text: string): SettingsFieldState {
  return { text, overridden: false, invalid: false }
}

const providers = [
  { id: 'exa', credentialRef: 'EXA_API_KEY', configured: false, writable: true },
  { id: 'brave', credentialRef: 'BRAVE_API_KEY', configured: true, writable: true },
]

function renderWebSearch(state: Partial<WebSearchCardState> = {}, view: 'page' | 'summary' = 'page') {
  const store = createSnapshotStore<WebSearchCardState>({
    ...settled, providers, provider: field(''), apiKey: field(''), keyStatus: { kind: 'idle' }, ...state,
  })
  const actions = { edit: vi.fn(), resetField: vi.fn(), save: vi.fn(), discard: vi.fn() }
  const props = { ...actions, view, t, useWebSearchCard: bindSnapshotSelector(store) } as WebSearchCardProps
  render(<WebSearchCard {...props} />)
  return actions
}

describe('WebSearchCard', () => {
  it('renders its one-liner alone in the summary view', () => {
    renderWebSearch({}, 'summary')
    expect(document.body.textContent).toBe(en.description)
  })

  it('offers every listed provider and stages the one chosen', () => {
    const actions = renderWebSearch()
    expect(screen.queryByLabelText(new RegExp(en.apiKey))).toBeNull()

    fireEvent.click(screen.getByLabelText(en.providerBrave))

    expect(actions.edit).toHaveBeenCalledWith('searchProvider', 'brave')
  })

  it('shows the chosen provider’s key state without ever showing a key', () => {
    const actions = renderWebSearch({ provider: field('brave') })
    const key = screen.getByLabelText(`${en.apiKey} · ${en.providerBrave}`)
    expect(key).toHaveProperty('type', 'password')
    expect(screen.getByText(en.apiKeySet)).toBeTruthy()

    fireEvent.change(key, { target: { value: 'brave-secret' } })

    expect(actions.edit).toHaveBeenCalledWith('apiKey', 'brave-secret')
  })

  it('says a rejected key was not saved, with the provider’s reason', () => {
    renderWebSearch({ provider: field('exa'), keyStatus: { kind: 'auth', message: 'Exa rejected the API key (HTTP 401).' } })
    const status = screen.getByRole('status')
    expect(status.textContent).toBe(`${en.keyRejected}Exa rejected the API key (HTTP 401).`)
  })

  it('tells quota apart from a rejected key', () => {
    renderWebSearch({ provider: field('exa'), keyStatus: { kind: 'quota', message: 'plan limit' } })
    expect(screen.getByRole('status').textContent).toBe(`${en.keyQuota}plan limit`)
  })

  it('locks saving while a key is being checked', () => {
    renderWebSearch({ provider: field('exa'), dirty: true, keyStatus: { kind: 'checking' } })
    expect(screen.getByRole('button', { name: en.saving })).toHaveProperty('disabled', true)
  })

  it('says when no provider is installed', () => {
    renderWebSearch({ providers: [] })
    expect(screen.getByText(en.noProviders)).toBeTruthy()
  })
})
