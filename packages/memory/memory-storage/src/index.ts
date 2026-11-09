/**
 * Memory storage domain (`ctx.memoryStorage`): opens and owns the `memory`
 * storage domain and the durable, redacted read/write API every memory-write
 * path (the `/remember` command, the `remember_fact` tool, and any future
 * caller) goes through. `writeEntry` is this package's single write choke
 * point: it calls `@deepseek-ai/dsh-memory-redact`'s `redactMemoryContent`
 * before any caller-supplied content reaches the domain record or a topic
 * Markdown file, so no write path can bypass redaction by construction —
 * a caller cannot reach the domain or the Markdown files any other way,
 * since neither is exposed.
 * @module @deepseek-ai/dsh-memory-storage
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import type { FileSystem } from '@deepseek-ai/dsh-fs'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { redactMemoryContent } from '@deepseek-ai/dsh-memory-redact'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { indexFilePath, readTopicFileBody, regenerateIndex, scopeDirectory, writeTopicFile } from './markdown-files.ts'
import { memoryDomainSpec, memoryEntryRecord } from './spec.ts'
import type { MemoryEntryRecord, MemoryEntryType } from './spec.ts'
import { GLOBAL_SCOPE_ID, isKeyInScope, memoryEntryKey, projectScopeId, resolveMemoryProjectRoot } from './scope.ts'
import type { MemoryEntryKey } from './types.ts'

export {
  MEMORY_ENTRY_TYPES, memoryDomainSpec, memoryEntryRecord,
} from './spec.ts'
export type { MemoryEntryRecord, MemoryEntryType } from './spec.ts'
export type { MemoryEntryKey } from './types.ts'
export {
  GLOBAL_SCOPE_ID, memoryEntryKey, projectScopeId, resolveMemoryProjectRoot,
} from './scope.ts'
export {
  parseFrontmatter, patchFrontmatterFields, renderFrontmatterDocument,
} from './frontmatter.ts'
export type { ParsedFrontmatter } from './frontmatter.ts'
export {
  indexFilePath, readTopicFileBody, regenerateIndex, scopeDirectory, topicFilePath, writeTopicFile,
} from './markdown-files.ts'
export type { IndexableEntry } from './markdown-files.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    memoryStorage: MemoryStorage
  }
}

/** Plugin config: where a scope's Markdown artifacts live. */
export interface Config {
  /** Harness home used to resolve the Markdown root (`<dshHome>/memory`); defaults to `$DSH_HOME` or `~/.dsh`. */
  dshHome?: string
}

/**
 * One memory write request. `content` is the entry's complete next
 * free-text body (already unredacted — this method redacts it): omit it to
 * update only the entry's metadata fields, preserving its existing topic
 * file body untouched. A `'project'`-scope write resolves its scope id from
 * `projectRoot` when given, otherwise by walking upward from `cwd`.
 */
export interface WriteMemoryEntryInput {
  /** The entry's slug; see {@link memoryEntryRecord}'s `name` field. */
  name: string
  /** One of {@link MemoryEntryType}. */
  type: MemoryEntryType
  /** Short, non-empty summary stored in the domain record and the index. */
  description: string
  /** Which tier the entry belongs to. */
  projectScope: 'project' | 'global'
  /** Complete next body text; omit to leave the existing topic file body untouched. */
  content?: string
  /** Already-resolved absolute project root; takes precedence over `cwd` when `projectScope` is `'project'`. */
  projectRoot?: string
  /** Working directory to walk upward from when `projectScope` is `'project'` and `projectRoot` is omitted. */
  cwd?: string
  /** Optional provider used instead of host filesystem probes while resolving `projectRoot` from `cwd`. */
  fileSystem?: FileSystem
  /** Cancellation for the `projectRoot` resolution walk. */
  signal?: AbortSignal
}

/** Outcome of one {@link MemoryStorage.writeEntry} call. */
export interface WriteMemoryEntryResult {
  /** The stored, schema-validated record. */
  record: MemoryEntryRecord
  /** Storage key the record was written under. */
  key: MemoryEntryKey
  /** Whether `redactMemoryContent` withheld any span of the supplied content. */
  redacted: boolean
}

/** One entry read back with its topic-file body. */
export interface ReadMemoryEntryResult {
  /** The stored, schema-validated record. */
  record: MemoryEntryRecord
  /** The topic file's body text, or `''` when no topic file exists for an otherwise-valid record. */
  body: string
}

/**
 * Opens and owns the `memory` storage domain, and is the sole write path
 * for memory entries: `writeEntry` validates, redacts, and durably commits
 * both the domain record and the entry's Markdown artifacts (its topic file
 * and its scope's regenerated index) as one caller-visible operation.
 */
export class MemoryStorage extends Service {
  static inject = ['storageDomain']

  private readonly markdownRoot: string
  private table?: KvTable<MemoryEntryKey, MemoryEntryRecord>

  constructor(ctx: Context, public config: Config = {}) {
    super(ctx, 'memoryStorage')
    this.markdownRoot = join(resolveDshHome(config.dshHome), 'memory')
  }

  /**
   * Open the domain, retain its `entries` table, and register the domain's
   * close as a named effect disposer.
   */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(memoryDomainSpec)
    this.table = domain.table('entries')
    this.ctx.effect(() => () => domain.close(), 'memoryStorage.domainClose')
  }

  private requireTable(): KvTable<MemoryEntryKey, MemoryEntryRecord> {
    if (this.table === undefined) throw new Error('memoryStorage: table accessed before the domain finished opening')
    return this.table
  }

  /**
   * Resolve the storage-key scope id for one write: the fixed
   * {@link GLOBAL_SCOPE_ID} for a global-tier write, or a
   * {@link projectScopeId} derived from `input.projectRoot` (when given) or
   * a {@link resolveMemoryProjectRoot} walk from `input.cwd` otherwise.
   * @throws when `input.projectScope` is `'project'` and neither `projectRoot` nor `cwd` is given.
   */
  private async resolveScopeId(input: WriteMemoryEntryInput): Promise<string> {
    if (input.projectScope === 'global') return GLOBAL_SCOPE_ID
    if (input.projectRoot !== undefined) return projectScopeId(input.projectRoot)
    if (input.cwd === undefined) {
      throw new Error('memoryStorage: a project-scope write requires either projectRoot or cwd')
    }
    const projectRoot = await resolveMemoryProjectRoot(input.cwd, input.fileSystem, input.signal)
    return projectScopeId(projectRoot)
  }

  /**
   * Write one memory entry: validates the record, redacts `content` (when
   * given) via {@link redactMemoryContent}, durably commits the domain
   * record, writes (or metadata-patches) the entry's topic Markdown file,
   * and regenerates its scope's `MEMORY.md` index. No caller can reach the
   * domain table or the Markdown files any other way, so every write —
   * automatic or explicit — passes through redaction here.
   * @param input - the entry fields and next content.
   * @returns the stored record, its key, and whether anything was redacted.
   */
  async writeEntry(input: WriteMemoryEntryInput): Promise<WriteMemoryEntryResult> {
    const scopeId = await this.resolveScopeId(input)
    // `description` reaches the domain record AND the always-visible MEMORY.md
    // index verbatim, so it is redacted here too, not only `content` — a
    // caller-derived summary of secret content (e.g. a truncated first line)
    // must not carry the secret into the index just because it is short.
    const descriptionRedaction = redactMemoryContent(input.description)
    const contentRedaction = input.content === undefined ? undefined : redactMemoryContent(input.content)
    const record = memoryEntryRecord.parse({
      name: input.name,
      type: input.type,
      description: descriptionRedaction.text,
      modified: new Date().toISOString(),
      projectScope: input.projectScope,
    })
    const key = memoryEntryKey(scopeId, record.name)
    const table = this.requireTable()
    await table.put(key, record)
    const scopeDir = scopeDirectory(this.markdownRoot, scopeId)
    await writeTopicFile(scopeDir, record, contentRedaction?.text)
    const scoped = [...table.entries()]
      .filter(([entryKey]) => isKeyInScope(entryKey, scopeId))
      .map(([, entryRecord]) => entryRecord)
    await regenerateIndex(scopeDir, scoped)
    return { record, key, redacted: descriptionRedaction.redacted || (contentRedaction?.redacted ?? false) }
  }

  /**
   * Read one entry's stored record and topic-file body.
   * @param scopeId - {@link GLOBAL_SCOPE_ID} or a {@link projectScopeId} result.
   * @param name - the entry's slug.
   * @returns the record and body, or `undefined` when no record is stored under that key.
   * @throws when the record exists but its topic file has no valid frontmatter block.
   */
  async readEntry(scopeId: string, name: string): Promise<ReadMemoryEntryResult | undefined> {
    const record = this.requireTable().get(memoryEntryKey(scopeId, name))
    if (record === undefined) return undefined
    const scopeDir = scopeDirectory(this.markdownRoot, scopeId)
    const body = await readTopicFileBody(scopeDir, name)
    return { record, body: body ?? '' }
  }

  /**
   * List every stored entry, optionally restricted to one scope. Reads the
   * in-memory domain table only — never touches the Markdown files, since
   * the index/detail split keeps the index (here, the record list) cheap
   * and the body content a separate, explicitly requested read.
   * @param scopeId - restrict to this scope id; omit to list every scope.
   * @returns the matching records, in table iteration order.
   */
  listEntries(scopeId?: string): MemoryEntryRecord[] {
    const table = this.requireTable()
    const result: MemoryEntryRecord[] = []
    for (const [key, record] of table.entries()) {
      if (scopeId !== undefined && !isKeyInScope(key, scopeId)) continue
      result.push(record)
    }
    return result
  }

  /**
   * Read one scope's `MEMORY.md` index file text, for recall injection.
   * @param scopeId - {@link GLOBAL_SCOPE_ID} or a {@link projectScopeId} result.
   * @returns the index text, or `undefined` when the scope has no index file yet (no entries ever written).
   */
  async readIndex(scopeId: string): Promise<string | undefined> {
    const path = indexFilePath(scopeDirectory(this.markdownRoot, scopeId))
    try {
      return await readFile(path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return undefined
      throw error
    }
  }
}

export default MemoryStorage
