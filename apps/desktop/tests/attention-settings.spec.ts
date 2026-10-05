import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_ATTENTION_SETTINGS, DesktopAttentionSettingsStore, pickAttentionSettings } from '../src/attention-settings.ts'

const roots: string[] = []
function file(content?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-attention-settings-'))
  roots.push(root)
  const path = join(root, 'nested', 'attention.json')
  if (content !== undefined) { writeFileSync(join(root, 'attention.json'), content); return join(root, 'attention.json') }
  return path
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('desktop attention settings', () => {
  it('defaults to notifying only when unfocused and keeping the computer awake', () => {
    expect(DEFAULT_ATTENTION_SETTINGS).toEqual({ notifications: true, notifyWhenFocused: false, keepAwake: true })
    expect(new DesktopAttentionSettingsStore(file()).get()).toEqual(DEFAULT_ATTENTION_SETTINGS)
  })

  it('keeps only boolean fields from untrusted input', () => {
    expect(pickAttentionSettings({ notifications: false, keepAwake: 'no', extra: true })).toEqual({ notifications: false })
    expect(pickAttentionSettings(null)).toEqual({})
  })

  it('falls back to defaults for a malformed file', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(new DesktopAttentionSettingsStore(file('{')).get()).toEqual(DEFAULT_ATTENTION_SETTINGS)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('persists updates and reloads them', () => {
    const path = file()
    const store = new DesktopAttentionSettingsStore(path)
    expect(store.set({ keepAwake: false, notifyWhenFocused: true }))
      .toEqual({ notifications: true, notifyWhenFocused: true, keepAwake: false })
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(store.get())
    expect(new DesktopAttentionSettingsStore(path).get()).toEqual(store.get())
  })

  it('keeps the in-memory value when saving fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const blocker = file('plain file')
    const store = new DesktopAttentionSettingsStore(join(blocker, 'attention.json'))
    expect(store.set({ notifications: false }).notifications).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
