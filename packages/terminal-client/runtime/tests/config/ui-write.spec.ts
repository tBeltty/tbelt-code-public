import { describe, expect, it, vi } from 'vitest'
import { attempt, confirm, remoteDone, remoteOutcome, remoteValue } from '../../src/config/ui.ts'
import { writeSettings } from '../../src/config/write.ts'
import type { RemotePort } from '../../src/ports.ts'
import { fakeNamespaces, scriptedUi } from '../fakes.ts'

const failed = (message: string): string => `failed: ${message}`
const warns = (log: { kind: string; text: string }[]) => log.filter(entry => entry.kind === 'warn').map(entry => entry.text)

describe('remote helpers', () => {
  it('return a value, or print the Host message, an error message or a thrown text', async () => {
    const { ui, log } = scriptedUi([])
    expect(await remoteValue(ui, failed, () => Promise.resolve({ ok: true as const, value: 5 }))).toBe(5)
    expect(await remoteValue(ui, failed, () => Promise.resolve({ ok: false as const, error: { code: 'x', message: 'host' } }))).toBeUndefined()
    expect(await remoteValue(ui, failed, () => Promise.reject(new Error('err')))).toBeUndefined()
    expect(await remoteValue(ui, failed, () => Promise.reject('text'))).toBeUndefined()
    expect(warns(log)).toEqual(['failed: host', 'failed: err', 'failed: text'])
  })

  it('report whether a call without a value succeeded', async () => {
    const { ui, log } = scriptedUi([])
    expect(await remoteDone(ui, failed, () => Promise.resolve({ ok: true as const, value: {} }))).toBe(true)
    expect(await remoteDone(ui, failed, () => Promise.resolve({ ok: false as const, error: { code: 'x', message: 'host' } }))).toBe(false)
    expect(await remoteDone(ui, failed, () => Promise.reject(new Error('err')))).toBe(false)
    expect(await remoteDone(ui, failed, () => Promise.reject('text'))).toBe(false)
    expect(warns(log)).toEqual(['failed: host', 'failed: err', 'failed: text'])
  })

  it('keep a successful undefined apart from a failure', async () => {
    const { ui, log } = scriptedUi([])
    expect(await remoteOutcome(ui, failed, () => Promise.resolve({ ok: true as const, value: undefined }))).toEqual({ value: undefined })
    expect(await remoteOutcome(ui, failed, () => Promise.resolve({ ok: false as const, error: { code: 'x', message: 'host' } }))).toBeUndefined()
    expect(await remoteOutcome(ui, failed, () => Promise.reject(new Error('err')))).toBeUndefined()
    expect(await remoteOutcome(ui, failed, () => Promise.reject('text'))).toBeUndefined()
    expect(warns(log)).toEqual(['failed: host', 'failed: err', 'failed: text'])
  })

  it('print what a throwing service call says', async () => {
    const { ui, log } = scriptedUi([])
    expect(await attempt(ui, failed, () => Promise.resolve(5))).toEqual({ value: 5 })
    expect(await attempt(ui, failed, () => Promise.reject(new Error('err')))).toBeUndefined()
    expect(await attempt(ui, failed, () => Promise.reject('text'))).toBeUndefined()
    expect(warns(log)).toEqual(['failed: err', 'failed: text'])
  })

  it('confirm only on the confirming choice', async () => {
    expect(await confirm(scriptedUi(['yes']).ui, 'Sure?', 'Do it')).toBe(true)
    expect(await confirm(scriptedUi(['no']).ui, 'Sure?', 'Do it')).toBe(false)
    expect(await confirm(scriptedUi([undefined]).ui, 'Sure?', 'Do it')).toBe(false)
  })
})

describe('writeSettings', () => {
  const remote = (mutate: ReturnType<typeof vi.fn>) => ({
    ...fakeNamespaces(),
    settings: { ...fakeNamespaces().settings, mutate },
  }) as unknown as RemotePort

  it('returns the stored namespace', async () => {
    const stored = { ns: 'x', schema: {}, value: {}, secrets: [], revision: 2 }
    const mutate = vi.fn(() => Promise.resolve({ ok: true, value: stored }))
    expect(await writeSettings(remote(mutate), scriptedUi([]).ui, 'x', [], 1)).toBe(stored)
  })

  it('explains a conflict, a refusal and a thrown error', async () => {
    const { ui, log } = scriptedUi([])
    expect(await writeSettings(remote(vi.fn(() => Promise.resolve({ ok: false, error: { code: 'settings/conflict', message: 'c' } }))), ui, 'x', [], 1)).toBeUndefined()
    expect(await writeSettings(remote(vi.fn(() => Promise.resolve({ ok: false, error: { code: 'other', message: 'refused' } }))), ui, 'x', [], 1)).toBeUndefined()
    expect(await writeSettings(remote(vi.fn(() => Promise.reject(new Error('offline')))), ui, 'x', [], 1)).toBeUndefined()
    expect(await writeSettings(remote(vi.fn(() => Promise.reject('plain'))), ui, 'x', [], 1)).toBeUndefined()
    const lines = warns(log)
    expect(lines[0]).not.toContain('refused')
    expect(lines[1]).toContain('refused')
    expect(lines[2]).toContain('offline')
    expect(lines[3]).toContain('plain')
  })
})
