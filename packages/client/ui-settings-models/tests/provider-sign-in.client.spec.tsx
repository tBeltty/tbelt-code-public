// @vitest-environment jsdom
/** The browser sign-in panel relays what the Host flow asks and reports how it ended. */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthorizationAttemptView } from '@deepseek-ai/dsh-api-remotes/client'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { ProviderSignIn } from '../src/client/ProviderSignIn.tsx'
import { createModelsOperations } from '../src/client/operations.ts'
import type { ModelsOperations, SignInStartOutcome } from '../src/client/operations.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const flow = { key: 'llm-pi-ai/acme', label: 'Acme', methods: [{ id: 'oauth', label: 'Sign in with Acme' }] }
const running = (extra: Partial<AuthorizationAttemptView> = {}): AuthorizationAttemptView =>
  ({ id: 'a1', key: flow.key, status: 'running', ...extra })

/** Operations whose reads come from `reads`, the last one repeating. */
function scripted(reads: readonly (AuthorizationAttemptView | undefined)[], start: AuthorizationAttemptView = running()) {
  const queue = [...reads]
  const operations = {
    beginSignIn: vi.fn((): Promise<SignInStartOutcome> => Promise.resolve({ kind: 'started', attempt: start })),
    readSignIn: vi.fn(() => Promise.resolve(queue.length > 1 ? queue.shift() : queue[0])),
    answerSignIn: vi.fn(() => Promise.resolve()),
    cancelSignIn: vi.fn(() => Promise.resolve()),
    signInFlows: vi.fn(() => Promise.resolve([flow])),
  }
  return operations satisfies Partial<ModelsOperations>
}

function mount(operations: ReturnType<typeof scripted>, onSignedIn = vi.fn()) {
  const view = render(<ProviderSignIn flow={flow} method={flow.methods[0]!} operations={operations as unknown as ModelsOperations}
    t={key => en[key]} disabled={false} onSignedIn={onSignedIn} />)
  return { ...view, onSignedIn }
}

const begin = async (): Promise<void> => {
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with Acme' }))
}

describe('ProviderSignIn', () => {
  it('shows a placeholder until the flow sends its first notice, and ignores a non-web address', async () => {
    const operations = scripted([running({ notice: { message: 'Open this', url: 'file:///etc/passwd' } })])
    mount(operations)
    await begin()
    expect(await screen.findByText(en.signInStarting)).toBeTruthy()
    expect(await screen.findByText('Open this', {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('answers a secret question with a masked field and a choice with its option id', async () => {
    const operations = scripted([
      running({ prompt: { id: 'p1', kind: 'secret', message: 'Token', placeholder: 'sk-…' } }),
      running({ prompt: { id: 'p2', kind: 'select', message: 'Account', options: [{ id: 'personal', label: 'Personal' }] } }),
    ])
    mount(operations)
    await begin()
    const field = await screen.findByLabelText('Token', {}, { timeout: 3000 })
    expect(field.getAttribute('type')).toBe('password')
    expect(screen.getByRole<HTMLButtonElement>('button', { name: en.signInContinue }).disabled).toBe(true)
    fireEvent.change(field, { target: { value: 'sk-1' } })
    fireEvent.click(screen.getByRole('button', { name: en.signInContinue }))
    await waitFor(() => { expect(operations.answerSignIn).toHaveBeenCalledWith(flow.key, 'a1', 'p1', 'sk-1') })
    fireEvent.click(await screen.findByRole('button', { name: 'Personal' }, { timeout: 3000 }))
    await waitFor(() => { expect(operations.answerSignIn).toHaveBeenCalledWith(flow.key, 'a1', 'p2', 'personal') })
  })

  it('copies the link and says so, and keeps the link visible when the clipboard refuses', async () => {
    const operations = scripted([running({ notice: { message: 'Go', url: 'https://auth.example/x' } })])
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'))
    Object.assign(navigator, { clipboard: { writeText } })
    mount(operations)
    await begin()
    fireEvent.click(await screen.findByRole('button', { name: en.signInCopyLink }, { timeout: 3000 }))
    expect(await screen.findByRole('button', { name: en.signInLinkCopied })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.signInLinkCopied }))
    await waitFor(() => { expect(writeText).toHaveBeenCalledTimes(2) })
    expect(await screen.findByRole('button', { name: en.signInCopyLink })).toBeTruthy()
  })

  it('reports each sign-in once and shows the finished state', async () => {
    const operations = scripted([{ id: 'a1', key: flow.key, status: 'authorized' }])
    const { onSignedIn } = mount(operations)
    await begin()
    expect(await screen.findByText(en.signInDone, {}, { timeout: 3000 })).toBeTruthy()
    expect(onSignedIn).toHaveBeenCalledTimes(1)
  })

  it('returns to the button when the Host cancels, and says so when the attempt vanishes', async () => {
    const cancelled = scripted([{ id: 'a1', key: flow.key, status: 'cancelled' }])
    mount(cancelled)
    await begin()
    expect(await screen.findByRole('button', { name: 'Sign in with Acme' }, { timeout: 3000 })).toBeTruthy()
    cleanup()
    const vanished = scripted([undefined])
    mount(vanished)
    await begin()
    expect(await screen.findByText(en.signInFailed, {}, { timeout: 3000 })).toBeTruthy()
  })

  it('reports a refusal to start, a failure without detail, and retries', async () => {
    const operations = scripted([{ id: 'a1', key: flow.key, status: 'failed' }])
    operations.beginSignIn.mockResolvedValueOnce({ kind: 'refused', message: 'already running' })
    mount(operations)
    await begin()
    expect(await screen.findByText('already running')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.signInRetry }))
    expect(await screen.findByText(en.signInFailed, {}, { timeout: 3000 })).toBeTruthy()
  })

  it('withdraws a running sign-in when the card goes away', async () => {
    const operations = scripted([running()])
    const { unmount } = mount(operations)
    await begin()
    await screen.findByRole('button', { name: en.signInCancel })
    unmount()
    expect(operations.cancelSignIn).toHaveBeenCalledWith(flow.key)
  })

  it('ignores a read that settles after the card went away', async () => {
    const late = Promise.withResolvers<AuthorizationAttemptView | undefined>()
    const operations = scripted([running()])
    operations.readSignIn.mockReturnValue(late.promise)
    const { unmount } = mount(operations)
    await begin()
    await waitFor(() => { expect(operations.readSignIn).toHaveBeenCalled() }, { timeout: 3000 })
    unmount()
    await act(async () => { late.resolve({ id: 'a1', key: flow.key, status: 'authorized' }) })
    expect(screen.queryByText(en.signInDone)).toBeNull()
  })

  it('reports an authorized attempt once even when the owner passes a new callback', async () => {
    const operations = scripted([{ id: 'a1', key: flow.key, status: 'authorized' }])
    const first = vi.fn()
    const view = mount(operations, first)
    await begin()
    await screen.findByText(en.signInDone, {}, { timeout: 3000 })
    const second = vi.fn()
    view.rerender(<ProviderSignIn flow={flow} method={flow.methods[0]!} operations={operations as unknown as ModelsOperations}
      t={key => en[key]} disabled={false} onSignedIn={second} />)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('does not withdraw anything when no sign-in ran', () => {
    const operations = scripted([running()])
    mount(operations).unmount()
    expect(operations.cancelSignIn).not.toHaveBeenCalled()
  })

  it('cancels from the button', async () => {
    const operations = scripted([running()])
    mount(operations)
    await begin()
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: en.signInCancel })) })
    expect(operations.cancelSignIn).toHaveBeenCalledWith(flow.key)
  })
})

describe('the sign-in operations over the authorization namespace', () => {
  const refusal = { ok: false as const, error: new RemoteError('gateway/bad-request', 'nope', {}) }
  const ctx = (authorization: object) => ({ remote: { authorization } }) as never

  it('answers empty or undefined when the Host refuses', async () => {
    const operations = createModelsOperations(ctx({
      flows: () => Promise.resolve(refusal),
      begin: () => Promise.resolve(refusal),
      read: () => Promise.resolve(refusal),
      answer: () => Promise.resolve(refusal),
      cancel: () => Promise.resolve(refusal),
    }))
    await expect(operations.signInFlows()).resolves.toEqual([])
    await expect(operations.beginSignIn('k', 'oauth')).resolves.toEqual({ kind: 'refused', message: 'nope' })
    await expect(operations.readSignIn('k', 'i')).resolves.toBeUndefined()
    await expect(operations.answerSignIn('k', 'i', 'p', null)).resolves.toBeUndefined()
    await expect(operations.cancelSignIn('k')).resolves.toBeUndefined()
  })

  it('passes the flow, attempt and answer through', async () => {
    const attempt = { id: 'i', key: 'k', status: 'running' as const }
    const calls = {
      flows: vi.fn(() => Promise.resolve({ ok: true as const, value: [flow] })),
      begin: vi.fn(() => Promise.resolve({ ok: true as const, value: attempt })),
      read: vi.fn(() => Promise.resolve({ ok: true as const, value: attempt })),
      answer: vi.fn(() => Promise.resolve({ ok: true as const, value: true })),
      cancel: vi.fn(() => Promise.resolve({ ok: true as const, value: undefined })),
    }
    const operations = createModelsOperations(ctx(calls))
    await expect(operations.signInFlows()).resolves.toEqual([flow])
    await expect(operations.beginSignIn('k', 'oauth')).resolves.toEqual({ kind: 'started', attempt })
    await expect(operations.readSignIn('k', 'i')).resolves.toEqual(attempt)
    await operations.answerSignIn('k', 'i', 'p', 'typed')
    await operations.cancelSignIn('k')
    expect(calls.begin).toHaveBeenCalledWith('k', 'oauth')
    expect(calls.answer).toHaveBeenCalledWith('k', 'i', 'p', 'typed')
    expect(calls.cancel).toHaveBeenCalledWith('k')
  })
})
