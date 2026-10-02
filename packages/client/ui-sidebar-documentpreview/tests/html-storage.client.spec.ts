// @vitest-environment jsdom
/** Parent-side persistence: real localStorage, namespaced per previewed file and storage area. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PREVIEW_STORAGE_MESSAGE_TYPE, isPreviewStorageMessage,
  readPreviewStorageSnapshot, writePreviewStorageSnapshot,
} from '../src/client/html/storage.ts'

const ADDRESS = 'dsh-resource://file/session/html/index.html'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('isPreviewStorageMessage', () => {
  it('accepts a well-formed message for either storage area', () => {
    expect(isPreviewStorageMessage({ type: PREVIEW_STORAGE_MESSAGE_TYPE, area: 'localStorage', snapshot: {} })).toBe(true)
    expect(isPreviewStorageMessage({
      type: PREVIEW_STORAGE_MESSAGE_TYPE, area: 'sessionStorage', snapshot: { theme: 'dark' },
    })).toBe(true)
  })

  it('rejects non-objects, wrong tags, unknown areas and non-string snapshot values', () => {
    expect(isPreviewStorageMessage(null)).toBe(false)
    expect(isPreviewStorageMessage(undefined)).toBe(false)
    expect(isPreviewStorageMessage('hello')).toBe(false)
    expect(isPreviewStorageMessage({ type: 'not-it', area: 'localStorage', snapshot: {} })).toBe(false)
    expect(isPreviewStorageMessage({ type: PREVIEW_STORAGE_MESSAGE_TYPE, area: 'cookieJar', snapshot: {} })).toBe(false)
    expect(isPreviewStorageMessage({ type: PREVIEW_STORAGE_MESSAGE_TYPE, area: 'localStorage', snapshot: null })).toBe(false)
    expect(isPreviewStorageMessage({
      type: PREVIEW_STORAGE_MESSAGE_TYPE, area: 'localStorage', snapshot: { count: 1 },
    })).toBe(false)
  })
})

describe('readPreviewStorageSnapshot', () => {
  it('returns an empty snapshot when nothing was persisted', () => {
    expect(readPreviewStorageSnapshot(ADDRESS, 'localStorage')).toEqual({})
  })

  it('round-trips a snapshot written for the same address and area', () => {
    writePreviewStorageSnapshot(ADDRESS, 'localStorage', { theme: 'dark' })
    expect(readPreviewStorageSnapshot(ADDRESS, 'localStorage')).toEqual({ theme: 'dark' })
    expect(readPreviewStorageSnapshot(ADDRESS, 'sessionStorage')).toEqual({})
  })

  it('keeps distinct addresses and areas in separate partitions', () => {
    writePreviewStorageSnapshot(ADDRESS, 'localStorage', { a: '1' })
    writePreviewStorageSnapshot('dsh-resource://file/session/html/other.html', 'localStorage', { b: '2' })
    writePreviewStorageSnapshot(ADDRESS, 'sessionStorage', { c: '3' })
    expect(readPreviewStorageSnapshot(ADDRESS, 'localStorage')).toEqual({ a: '1' })
    expect(readPreviewStorageSnapshot('dsh-resource://file/session/html/other.html', 'localStorage')).toEqual({ b: '2' })
    expect(readPreviewStorageSnapshot(ADDRESS, 'sessionStorage')).toEqual({ c: '3' })
  })

  it('starts empty rather than throwing on a corrupt persisted value', () => {
    localStorage.setItem('dsh-html-preview-storage:localStorage:' + ADDRESS, 'not json')
    expect(readPreviewStorageSnapshot(ADDRESS, 'localStorage')).toEqual({})
    localStorage.setItem('dsh-html-preview-storage:localStorage:' + ADDRESS, '"a string, not a record"')
    expect(readPreviewStorageSnapshot(ADDRESS, 'localStorage')).toEqual({})
  })

  it('drops non-string entries from an otherwise valid persisted record', () => {
    localStorage.setItem('dsh-html-preview-storage:localStorage:' + ADDRESS, JSON.stringify({ a: '1', b: 2 }))
    expect(readPreviewStorageSnapshot(ADDRESS, 'localStorage')).toEqual({ a: '1' })
  })

  it('reads as empty when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(readPreviewStorageSnapshot(ADDRESS, 'localStorage')).toEqual({})
  })

  it('reads as empty rather than throwing when localStorage.getItem fails', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('unavailable') } })
    expect(readPreviewStorageSnapshot(ADDRESS, 'localStorage')).toEqual({})
  })
})

describe('writePreviewStorageSnapshot', () => {
  it('does nothing when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(() => { writePreviewStorageSnapshot(ADDRESS, 'localStorage', { a: '1' }) }).not.toThrow()
  })

  it('drops the write rather than throwing on a quota or private-mode failure', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('quota exceeded') } })
    expect(() => { writePreviewStorageSnapshot(ADDRESS, 'localStorage', { a: '1' }) }).not.toThrow()
  })
})
