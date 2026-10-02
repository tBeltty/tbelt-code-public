/**
 * Durable read/write of a memory scope's Markdown artifacts: one `MEMORY.md`
 * index per scope directory and one topic file per entry under its
 * `topics/` subdirectory. Durability discipline mirrors
 * `packages/settings/settings-file/src/index.ts`'s `persistSection`:
 * directory creation, a cross-process writer lock (`withFileLock`), and an
 * atomic replace (`writeFileAtomic`) with owner-only permissions, since a
 * memory file may hold personal content.
 *
 * The index is a code-assembled, frozen pointer list the model never
 * authors by hand — the same role
 * `.agents/notes/proposed/feature/2026-07-06-recallable-compaction.md`
 * describes for an index artifact — so it is fully regenerated on every
 * write, not patched. A topic file is different: its body is the entry's
 * actual free-text content, supplied whole by the caller on every write
 * that changes it, so a content-carrying write legitimately replaces the
 * whole file. A metadata-only write (`body` omitted) patches the
 * frontmatter block in place via `./frontmatter.ts`'s `patchFrontmatterFields`
 * and leaves the existing body byte-identical.
 * @module @deepseek-ai/dsh-memory-storage/src/markdown-files
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { parseFrontmatter, patchFrontmatterFields, renderFrontmatterDocument } from './frontmatter.ts'
import type { MemoryEntryRecord } from './spec.ts'

/**
 * Directory holding one scope's `MEMORY.md` index and `topics/` files.
 * @param markdownRoot - the `<dshHome>/memory` root every scope directory lives under.
 * @param scopeId - the fixed global scope id or a project scope id.
 * @returns the absolute scope directory path.
 */
export function scopeDirectory(markdownRoot: string, scopeId: string): string {
  return join(markdownRoot, scopeId)
}

/**
 * Path of one entry's topic file within its scope directory.
 * @param scopeDir - the scope directory (see {@link scopeDirectory}).
 * @param name - the entry's slug.
 * @returns the absolute topic file path.
 */
export function topicFilePath(scopeDir: string, name: string): string {
  return join(scopeDir, 'topics', `${name}.md`)
}

/**
 * Path of a scope's index file.
 * @param scopeDir - the scope directory (see {@link scopeDirectory}).
 * @returns the absolute `MEMORY.md` path.
 */
export function indexFilePath(scopeDir: string): string {
  return join(scopeDir, 'MEMORY.md')
}

/** `code` of a Node filesystem error that means "path does not exist". */
function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

const FRONTMATTER_FIELDS = ['name', 'type', 'description', 'modified', 'projectScope'] as const

/** Build the frontmatter object for one record, in a fixed, stable field order. */
function frontmatterFieldsOf(record: MemoryEntryRecord): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const field of FRONTMATTER_FIELDS) fields[field] = record[field]
  return fields
}

/**
 * Durably write (or update) one entry's topic file. `body` is the entry's
 * complete next free-text content (already redacted): when present, the
 * whole file is (re)rendered with that body. When `body` is `undefined`,
 * only the frontmatter fields are patched in place and the file's existing
 * body survives untouched — the file must already exist in that case.
 * @param scopeDir - the entry's scope directory (see {@link scopeDirectory}).
 * @param record - the entry's durable record, source of the frontmatter fields.
 * @param body - next body text, or `undefined` to preserve the existing body.
 * @throws when `body` is `undefined` and no topic file exists yet, or an existing file has no valid frontmatter block.
 */
export async function writeTopicFile(scopeDir: string, record: MemoryEntryRecord, body: string | undefined): Promise<void> {
  const path = topicFilePath(scopeDir, record.name)
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await withFileLock(path, async () => {
    let existingRaw: string | undefined
    try {
      existingRaw = await readFile(path, 'utf8')
    } catch (error) {
      if (!isENOENT(error)) throw error
    }
    const fields = frontmatterFieldsOf(record)
    let output: string
    if (body !== undefined) {
      const nextBody = body.endsWith('\n') ? body : `${body}\n`
      output = renderFrontmatterDocument(fields, nextBody)
    } else {
      if (existingRaw === undefined) {
        throw new Error(`memory-storage: cannot update frontmatter-only for a topic file that does not exist yet: ${path}`)
      }
      output = patchFrontmatterFields(existingRaw, fields)
    }
    await writeFileAtomic(path, output, { mode: 0o600, dirMode: 0o700 })
  })
}

/**
 * Read one entry's topic file body (the text after its frontmatter block).
 * @param scopeDir - the scope directory (see {@link scopeDirectory}).
 * @param name - the entry's slug.
 * @returns the body text, or `undefined` when no topic file exists for that name.
 */
export async function readTopicFileBody(scopeDir: string, name: string): Promise<string | undefined> {
  const path = topicFilePath(scopeDir, name)
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if (isENOENT(error)) return undefined
    throw error
  }
  const parsed = parseFrontmatter(raw)
  if (parsed === undefined) {
    throw new Error(`memory-storage: topic file at ${path} has no valid frontmatter block`)
  }
  return parsed.body
}

/** One index line's fields, minimal enough to render `MEMORY.md` without a body read. */
export type IndexableEntry = Pick<MemoryEntryRecord, 'name' | 'type' | 'description' | 'modified'>

/**
 * Regenerate a scope's `MEMORY.md` index from its current entries, grouped
 * by type, sorted by name within each group. Fully replaces the file: the
 * index is code-assembled from durable records, never hand-edited, so there
 * is no human formatting to preserve.
 * @param scopeDir - the scope directory (see {@link scopeDirectory}).
 * @param entries - every entry currently stored for this scope.
 */
export async function regenerateIndex(scopeDir: string, entries: readonly IndexableEntry[]): Promise<void> {
  const path = indexFilePath(scopeDir)
  const byType = new Map<string, IndexableEntry[]>()
  for (const entry of entries) {
    const group = byType.get(entry.type)
    if (group === undefined) byType.set(entry.type, [entry])
    else group.push(entry)
  }
  const lines = [
    '# Memory Index',
    '',
    'Auto-generated from stored memory entries; do not hand-edit — a manual change is overwritten by the next write.',
    '',
  ]
  for (const type of [...byType.keys()].sort()) {
    lines.push(`## ${type}`, '')
    const group = [...byType.get(type) ?? []].sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of group) {
      lines.push(`- **${entry.name}** (${entry.modified}): ${entry.description}`)
    }
    lines.push('')
  }
  const content = `${lines.join('\n').replace(/\n+$/, '')}\n`
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await withFileLock(path, async () => {
    await writeFileAtomic(path, content, { mode: 0o600, dirMode: 0o700 })
  })
}
