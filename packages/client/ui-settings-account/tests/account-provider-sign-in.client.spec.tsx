// @vitest-environment jsdom
/** Account sign-in action on the Models page row. */
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { AccountView, SignInAttemptId } from '@deepseek-ai/dsh-deepseek-account/types'
import { AccountProviderSignIn, type AccountProviderSignInProps } from '../src/client/AccountProviderSignIn.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const links = { usageUrl: 'https://example.test/usage', topUpUrl: 'https://example.test/top_up' }

function mount(view: AccountView | undefined, start = vi.fn(async () => {}), loginFailed = false) {
  const snapshot = { view, details: undefined, avatar: undefined, failed: false, ...loginFailed ? { loginFailed } : {} }
  const props = {
    start, t: (key: keyof typeof en) => en[key], useAccount: (select: (value: typeof snapshot) => unknown) => select(snapshot),
  } as unknown as AccountProviderSignInProps
  render(<AccountProviderSignIn {...props} />)
  return start
}

it('starts the account login from the row while signed out', async () => {
  const start = mount({ status: 'signed-out', attempt: null, links })
  expect(screen.getByRole('status').textContent).toBe(en.providerSignIn)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.signIn })) })
  expect(start).toHaveBeenCalledOnce()
})

it('renders nothing before the first account frame and while signed in', () => {
  mount(undefined)
  expect(screen.queryByRole('button')).toBeNull()
  cleanup()
  mount({ status: 'credential-stored', attempt: null, links })
  expect(screen.queryByRole('button')).toBeNull()
})

it('disables the action while an attempt runs', () => {
  mount({ status: 'signed-out', attempt: { id: 'a' as SignInAttemptId, phase: 'waiting-browser' }, links })
  expect(screen.getByRole('button', { name: en.signIn }).hasAttribute('disabled')).toBe(true)
})

it('allows another attempt after the previous one ended', () => {
  mount({ status: 'signed-out', attempt: { id: 'a' as SignInAttemptId, phase: 'expired', errorCode: 'expired' }, links })
  expect(screen.getByRole('button', { name: en.signIn }).hasAttribute('disabled')).toBe(false)
})

it('reports a refused start and a failure the snapshot already carries', async () => {
  mount({ status: 'signed-out', attempt: null, links }, vi.fn(async () => { throw new Error('refused') }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.signIn })) })
  expect(screen.getByRole('status').textContent).toBe(en.failed)
  cleanup()
  mount({ status: 'signed-out', attempt: null, links }, vi.fn(async () => {}), true)
  expect(screen.getByRole('status').textContent).toBe(en.failed)
})
