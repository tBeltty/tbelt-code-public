// @vitest-environment jsdom
import { act, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DesktopAttentionSource } from '../src/client/desktop-attention-source.ts'
import type { DesktopAttentionBridge, DesktopAttentionSettings } from '../src/types.ts'

afterEach(cleanup)

const initial: DesktopAttentionSettings = { notifications: true, notifyWhenFocused: false, keepAwake: true }

function fixture(bridge: Partial<DesktopAttentionBridge> = {}) {
  const get = vi.fn(async () => initial)
  const set = vi.fn(async (patch: Partial<DesktopAttentionSettings>) => ({ ...initial, ...patch }))
  const source = new DesktopAttentionSource({ get, set, ...bridge })
  return { source, get, set }
}

it('loads the preferences from the shell', async () => {
  const { source } = fixture()
  await act(async () => { await Promise.resolve() })
  expect(source.store.getSnapshot()).toEqual(initial)
  source.dispose()
})

it('keeps the preferences hidden when the shell does not answer', async () => {
  const { source } = fixture({ get: () => Promise.reject(new Error('offline')) })
  await act(async () => { await Promise.resolve() })
  expect(source.store.getSnapshot()).toBeUndefined()
  source.dispose()
})

it('stores the shell answer after an edit and ignores answers after disposal', async () => {
  const { source, set } = fixture()
  await act(async () => { await Promise.resolve() })
  await source.update({ keepAwake: false })
  expect(set).toHaveBeenCalledWith({ keepAwake: false })
  expect(source.store.getSnapshot()?.keepAwake).toBe(false)
  source.dispose()
  await source.update({ keepAwake: true })
  expect(source.store.getSnapshot()?.keepAwake).toBe(false)
})
