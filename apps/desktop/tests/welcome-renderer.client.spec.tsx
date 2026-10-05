// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { Welcome } from '../src/client/WelcomePage.tsx'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDesktopLocale } from '../src/locale.ts'
import type { AccountView } from '@deepseek-ai/dsh-deepseek-account/types'
import type { WelcomeSaveResult, WelcomeNotice } from '../src/welcome-api.ts'

const html = readFileSync(join(import.meta.dirname, '../renderer/welcome.html'), 'utf8')
afterEach(cleanup)

function mount(language = 'zh-CN') {
  cleanup()
  const signedOut: AccountView = { links: { usageUrl: 'http://localhost/usage', topUpUrl: 'http://localhost/top_up' }, status: 'signed-out', attempt: null }
  const api = {
    takeNotice: vi.fn<() => Promise<WelcomeNotice | undefined>>().mockResolvedValue(undefined),
    analytics: vi.fn(async (_event: string, _attributes: object) => {}),
    analyticsEnabled: async () => true,
    onAccountState: vi.fn((_listener: (state: AccountView) => void) => () => {}),
    startSignIn: vi.fn(async () => signedOut),
    cancelSignIn: vi.fn(async () => signedOut),
    copySignInLink: vi.fn(async () => undefined),
    ...resolveDesktopLocale(language),
    saveApiKey: vi.fn<(value: string) => Promise<WelcomeSaveResult>>().mockResolvedValue({ ok: true }),
    skip: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }
  const mounted = render(<Welcome api={api} />)
  const start = document.querySelector<HTMLButtonElement>('#get-started')!
  const error = document.querySelector<HTMLElement>('#start-error')!
  const copy = () => [
    document.title, document.querySelector('img')!.alt, document.getElementById('welcome-heading')!.textContent,
    document.querySelector('#welcome-description')!.textContent,
    ...[...document.querySelectorAll('button')].map(item => `${item.textContent}${item.disabled ? ' [disabled]' : ''}`),
    '',
  ].join('\n')
  return { document, api, start, error, copy, unmount: mounted.unmount }
}

describe('desktop welcome presentation', () => {
  it.each(['zh-CN', 'en'])('renders the %s entry without a provider account or key form', async (language) => {
    const view = mount(language)
    expect(view.document.documentElement.lang).toBe(language)
    expect(view.document.querySelector('img')!.getAttribute('src')).toBe('assets/welcome-brand.svg')
    expect(view.document.querySelector('input')).toBeNull()
    await expect(view.copy()).toMatchFileSnapshot(`./expected/welcome/${language}.expected.txt`)
  })

  it('opens the workspace once while a start is pending', async () => {
    const view = mount()
    const entered = Promise.withResolvers<undefined>()
    view.api.skip.mockReturnValue(entered.promise)
    fireEvent.click(view.start)
    fireEvent.click(view.start)
    expect(view.start.disabled).toBe(true)
    expect(view.api.skip).toHaveBeenCalledOnce()
    entered.resolve(undefined)
    await vi.waitFor(() => { expect(view.start.disabled).toBe(false) })
    expect(view.api.saveApiKey).not.toHaveBeenCalled()
    expect(view.api.startSignIn).not.toHaveBeenCalled()
  })

  it('reports a failed start and allows retry', async () => {
    const view = mount('en')
    view.api.skip.mockRejectedValueOnce(new Error('closed'))
    fireEvent.click(view.start)
    await vi.waitFor(() => { expect(view.error.hidden).toBe(false) })
    expect(view.error.textContent).toBe(view.api.messages.welcomeContinueFailed)
    fireEvent.click(view.start)
    await vi.waitFor(() => { expect(view.error.hidden).toBe(true) })
    expect(view.api.skip).toHaveBeenCalledTimes(2)
  })

  it('does not update state after unmount', async () => {
    const view = mount()
    const entered = Promise.withResolvers<undefined>()
    view.api.skip.mockReturnValue(entered.promise)
    fireEvent.click(view.start)
    view.unmount()
    entered.reject(new Error('closed'))
    await Promise.resolve()
    expect(view.api.skip).toHaveBeenCalledOnce()
  })

  it('keeps visible copy in the shell dictionaries and denies network access', () => {
    expect([...html.matchAll(/>([^<]*\p{L}[^<]*)</gu)]).toEqual([])
    expect(html).toContain("default-src 'none'")
    expect(html).toContain("form-action 'none'")
  })
})
