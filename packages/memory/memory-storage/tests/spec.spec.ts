import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { DomainChanged } from '@deepseek-ai/dsh-storage-domain'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import MemoryStorage from '../src/index.ts'
import {
  GLOBAL_SCOPE_ID, memoryDomainSpec, memoryEntryKey, memoryEntryRecord, projectScopeId,
} from '../src/index.ts'
import type { MemoryEntryRecord } from '../src/index.ts'

const validEntry: MemoryEntryRecord = {
  name: 'ci-preferences',
  type: 'feedback',
  description: 'Never add a Co-Authored-By trailer naming an AI tool.',
  modified: '2026-09-17T12:00:00Z',
  projectScope: 'global',
}

describe('memoryDomainSpec', () => {
  it('declares the per-record, backup-and-skip layout the storage-domain template requires', () => {
    expect(memoryDomainSpec.name).toBe('memory')
    expect(memoryDomainSpec.version).toBe(1)
    expect(memoryDomainSpec.layout).toBe('per-record')
    expect(memoryDomainSpec.invalidRecords).toBe('backup-and-skip')
    expect(Object.keys(memoryDomainSpec.tables)).toEqual(['entries'])
  })
})

describe('memoryEntryRecord', () => {
  it('round-trips a valid entry', () => {
    const parsed = memoryEntryRecord.parse(validEntry)
    expect(parsed).toEqual(validEntry)
  })

  it('accepts an offset (non-Z) ISO timestamp', () => {
    const parsed = memoryEntryRecord.parse({ ...validEntry, modified: '2026-09-17T12:00:00+02:00' })
    expect(parsed.modified).toBe('2026-09-17T12:00:00+02:00')
  })

  it('rejects a record missing a required field', () => {
    const { description: _description, ...missingDescription } = validEntry
    expect(memoryEntryRecord.safeParse(missingDescription).success).toBe(false)
  })

  it('rejects an unknown type value', () => {
    expect(memoryEntryRecord.safeParse({ ...validEntry, type: 'unknown' }).success).toBe(false)
  })

  it('rejects a non-slug name', () => {
    expect(memoryEntryRecord.safeParse({ ...validEntry, name: 'Not A Slug' }).success).toBe(false)
  })

  it('rejects an empty description', () => {
    expect(memoryEntryRecord.safeParse({ ...validEntry, description: '' }).success).toBe(false)
  })

  it('rejects a non-ISO modified timestamp', () => {
    expect(memoryEntryRecord.safeParse({ ...validEntry, modified: 'yesterday' }).success).toBe(false)
  })

  it('rejects an invalid projectScope value', () => {
    expect(memoryEntryRecord.safeParse({ ...validEntry, projectScope: 'workspace' }).success).toBe(false)
  })
})

describe('memoryEntryKey / projectScopeId', () => {
  it('builds a global-scope key using the global scope id', () => {
    expect(memoryEntryKey(GLOBAL_SCOPE_ID, 'ci-preferences')).toBe('global/ci-preferences')
  })

  it('derives a stable 16-character hex scope id for the same project root', () => {
    const first = projectScopeId('/repo/tbelt-code')
    const second = projectScopeId('/repo/tbelt-code')
    expect(first).toBe(second)
    expect(first).toMatch(/^[0-9a-f]{16}$/)
  })

  it('derives different scope ids for different project roots', () => {
    expect(projectScopeId('/repo/one')).not.toBe(projectScopeId('/repo/two'))
  })
})

describe('MemoryStorage service', () => {
  /**
   * Boot the real storage/domain/service composition over an in-memory
   * backend. `MemoryStorage` deliberately has no public accessor for its
   * table (see `src/index.ts`), so these tests read the opened domain back
   * through the facility's own diagnostic surface (`DomainFacility.get`,
   * used elsewhere in this repo only for cross-checking, never as a
   * consumer API) instead of adding one.
   */
  async function harness() {
    const pool = new MemoryMediaPool()
    const ctx = new Context()
    await ctx.plugin(Storage)
    ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
    const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
    ctx.storage.mount('domain', facility)
    ctx.provide('storageDomain', facility)

    const changes: DomainChanged[] = []
    ctx.on('domain/changed', (change) => { changes.push(change) })
    const fiber = await ctx.plugin(MemoryStorage)
    const domain = facility.get('memory')
    if (domain === undefined) throw new Error('memory domain did not register on the facility')
    return { ctx, fiber, pool, facility, table: domain.table('entries'), changes }
  }

  it('opens the memory domain and exposes an empty entries table', async () => {
    const { fiber, table } = await harness()
    expect(table.size).toBe(0)
    await fiber.dispose()
  })

  it('a stored, schema-valid entry round-trips through the opened table', async () => {
    const { fiber, table } = await harness()
    const key = memoryEntryKey(GLOBAL_SCOPE_ID, validEntry.name)
    await table.put(key, validEntry)
    expect(table.get(key)).toEqual(validEntry)
    await fiber.dispose()
  })

  it('closes the domain on disposal, freeing the name for reopening', async () => {
    const { fiber, pool } = await harness()
    await fiber.dispose()
    const ctx2 = new Context()
    await ctx2.plugin(Storage)
    ctx2.storage.backend.register('memory', new MemoryStorageBackend(pool))
    const facility2 = new DomainFacility(ctx2, { backend: 'memory', routes: {} })
    ctx2.storage.mount('domain', facility2)
    ctx2.provide('storageDomain', facility2)
    const fiber2 = await ctx2.plugin(MemoryStorage)
    expect(fiber2).toBeDefined()
    await fiber2.dispose()
  })

  it('rejects the whole open when a stored record fails the schema (fail loud, not silent)', async () => {
    const pool = new MemoryMediaPool()
    pool.media.set('memory', {
      tables: new Map([['entries', new Map<string, unknown>([['global/broken', { name: 'broken' }]])]]),
      global: null,
    })
    const ctx = new Context()
    await ctx.plugin(Storage)
    ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
    const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
    ctx.storage.mount('domain', facility)
    ctx.provide('storageDomain', facility)
    await expect(ctx.plugin(MemoryStorage)).rejects.toThrow(/does not match its schema/)
  })
})
