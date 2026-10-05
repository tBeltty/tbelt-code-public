import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import MemoryStorage, { GLOBAL_SCOPE_ID } from '../src/index.ts'
import { parseFrontmatter } from '../src/frontmatter.ts'
import { indexFilePath, scopeDirectory, topicFilePath } from '../src/markdown-files.ts'

describe('MemoryStorage read/write API (real composition)', () => {
  let dshHome: string

  beforeEach(async () => {
    dshHome = await mkdtemp(join(tmpdir(), 'dsh-memory-io-'))
  })

  afterEach(async () => {
    await rm(dshHome, { recursive: true, force: true })
  })

  async function harness() {
    const pool = new MemoryMediaPool()
    const ctx = new Context()
    await ctx.plugin(Storage)
    ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
    const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
    ctx.storage.mount('domain', facility)
    ctx.provide('storageDomain', facility)
    const fiber = await ctx.plugin(MemoryStorage, { dshHome })
    return { ctx, fiber }
  }

  const scopeDir = () => scopeDirectory(join(dshHome, 'memory'), GLOBAL_SCOPE_ID)

  it('writes a new entry: the domain record, its topic file, and the scope index all land on disk', async () => {
    const { ctx, fiber } = await harness()
    const result = await ctx.memoryStorage.writeEntry({
      name: 'ci-preferences',
      type: 'feedback',
      description: 'Never add a Co-Authored-By trailer naming an AI tool.',
      projectScope: 'global',
      content: 'The owner wants sole authorship credit on every commit.',
    })
    expect(result.redacted).toBe(false)
    expect(result.record.name).toBe('ci-preferences')

    const topicRaw = await readFile(topicFilePath(scopeDir(), 'ci-preferences'), 'utf8')
    const parsed = parseFrontmatter(topicRaw)
    expect(parsed?.data.name).toBe('ci-preferences')
    expect(parsed?.data.type).toBe('feedback')
    expect(parsed?.body.trim()).toBe('The owner wants sole authorship credit on every commit.')

    const indexRaw = await readFile(indexFilePath(scopeDir()), 'utf8')
    expect(indexRaw).toContain('ci-preferences')
    expect(indexRaw).toContain('Never add a Co-Authored-By trailer naming an AI tool.')

    await fiber.dispose()
  })

  it('readEntry and listEntries reflect a write made through writeEntry', async () => {
    const { ctx, fiber } = await harness()
    await ctx.memoryStorage.writeEntry({
      name: 'roadmap-notes',
      type: 'project',
      description: 'Phase 7 builds persistent memory.',
      projectScope: 'global',
      content: 'Phase 7 is sequenced after Phase 8 deliberately.',
    })

    const read = await ctx.memoryStorage.readEntry(GLOBAL_SCOPE_ID, 'roadmap-notes')
    expect(read?.record.description).toBe('Phase 7 builds persistent memory.')
    expect(read?.body.trim()).toBe('Phase 7 is sequenced after Phase 8 deliberately.')

    const listed = ctx.memoryStorage.listEntries(GLOBAL_SCOPE_ID)
    expect(listed.map(entry => entry.name)).toEqual(['roadmap-notes'])

    await fiber.dispose()
  })

  it('a sibling entry write never touches an untouched existing topic file (byte-identical survival)', async () => {
    const { ctx, fiber } = await harness()
    await ctx.memoryStorage.writeEntry({
      name: 'first-entry',
      type: 'user',
      description: 'The user prefers concise answers.',
      projectScope: 'global',
      content: 'Keep responses short unless asked to elaborate.',
    })
    const untouchedPath = topicFilePath(scopeDir(), 'first-entry')
    const before = await readFile(untouchedPath, 'utf8')

    await ctx.memoryStorage.writeEntry({
      name: 'second-entry',
      type: 'reference',
      description: 'Points at the staging environment.',
      projectScope: 'global',
      content: 'staging.example.internal',
    })

    const after = await readFile(untouchedPath, 'utf8')
    expect(after).toBe(before)

    await fiber.dispose()
  })

  it('a metadata-only write (no content) patches frontmatter in place and leaves the body byte-identical', async () => {
    const { ctx, fiber } = await harness()
    await ctx.memoryStorage.writeEntry({
      name: 'topic-a',
      type: 'user',
      description: 'Original description.',
      projectScope: 'global',
      content: 'Original body content, spanning\nmultiple lines.\n',
    })
    const path = topicFilePath(scopeDir(), 'topic-a')
    const before = await readFile(path, 'utf8')
    const beforeParsed = parseFrontmatter(before)

    await ctx.memoryStorage.writeEntry({
      name: 'topic-a',
      type: 'user',
      description: 'Updated description only.',
      projectScope: 'global',
      // content omitted: body must survive untouched
    })

    const after = await readFile(path, 'utf8')
    const afterParsed = parseFrontmatter(after)
    expect(afterParsed?.data.description).toBe('Updated description only.')
    expect(afterParsed?.body).toBe(beforeParsed?.body)

    await fiber.dispose()
  })

  it('routes content through redactMemoryContent before it reaches the topic file or the domain record', async () => {
    const { ctx, fiber } = await harness()
    const secretContent = 'AWS key: AKIAABCDEFGHIJKLMNOP is used for the staging bucket.'
    const result = await ctx.memoryStorage.writeEntry({
      name: 'deploy-notes',
      type: 'reference',
      description: 'Deployment credentials location.',
      projectScope: 'global',
      content: secretContent,
    })
    expect(result.redacted).toBe(true)

    const raw = await readFile(topicFilePath(scopeDir(), 'deploy-notes'), 'utf8')
    expect(raw).not.toContain('AKIAABCDEFGHIJKLMNOP')
    expect(raw).toContain('[REDACTED]')

    await fiber.dispose()
  })

  it('a project-scope write resolves its own scope directory, distinct from global', async () => {
    const { ctx, fiber } = await harness()
    await ctx.memoryStorage.writeEntry({
      name: 'local-fact',
      type: 'project',
      description: 'Project-local fact.',
      projectScope: 'project',
      projectRoot: '/repo/example-project',
      content: 'This is scoped to one project.',
    })
    await ctx.memoryStorage.writeEntry({
      name: 'local-fact',
      type: 'project',
      description: 'Global fact with the same name.',
      projectScope: 'global',
      content: 'This is global.',
    })
    const globalRead = await ctx.memoryStorage.readEntry(GLOBAL_SCOPE_ID, 'local-fact')
    expect(globalRead?.body.trim()).toBe('This is global.')
    const projectEntries = ctx.memoryStorage.listEntries(GLOBAL_SCOPE_ID)
    expect(projectEntries).toHaveLength(1)

    await fiber.dispose()
  })
})
