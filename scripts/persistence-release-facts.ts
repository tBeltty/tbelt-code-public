/** Render bounded release facts from validated offline records while preserving authored prose. */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderPersistenceArtifact } from './persistence-artifacts.ts'
import type { PersistenceArtifact } from './persistence-artifacts.ts'
import type { PersistenceReleaseEntry, PersistenceReleases } from './persistence-releases.ts'
import { canonicalizeSchema, schemaDigest } from './persistence-schema-model.ts'

function count(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? '' : 's'}`
}

function replaceFacts(source: string, name: string, content: string, path: string): string {
  const start = `<!-- persistence-release-${name}:start -->`
  const end = `<!-- persistence-release-${name}:end -->`
  const opening = source.indexOf(start)
  const closing = source.indexOf(end)
  if (opening < 0 || closing < opening || source.indexOf(start, opening + start.length) >= 0
    || source.indexOf(end, closing + end.length) >= 0) throw new Error(`${path}: expected one ${name} factual block`)
  return source.slice(0, opening + start.length) + content + source.slice(closing)
}

function structuralChanges(entry: PersistenceReleaseEntry): string {
  if (entry.record.previous === null) {
    return 'This entry establishes the historical comparison starting point. Its declaration lists every extracted root; it makes no compatibility judgment about earlier versions.'
  }
  if (entry.differences.length === 0) {
    return 'Normalized root types and their transitive digests are unchanged from the preceding tag.'
  }
  const summary = `Detected ${count(entry.record.changes.length, 'changed root')} and ${count(entry.differences.length, 'structural difference')}. The minimum below is calculated using current rules for comparison only; it does not assert historical compliance, migration correctness, or runtime compatibility.`
  const heading = '| Path | Change | Current minimum |'
  const rows = entry.differences.map((change) => {
    const path = change.path.replaceAll('`', '\\`').replaceAll('|', '\\|')
    return `| \`${path}\` | \`${change.kind}\` | \`${change.requiresVersionBump ? 'version-bump' : 'same-version'}\` |`
  })
  return [summary, '', heading, '|---|---|---|', ...rows].join('\n')
}

/** Compute factual updates without writing or changing machine declarations.
 * @param root - checkout containing existing documents with bounded factual markers.
 * @param archive - fully validated release records and reconstructed roots.
 * @returns complete documents, validated together before any caller writes.
 */
export function persistenceReleaseFactArtifacts(root: string, archive: PersistenceReleases): PersistenceArtifact[] {
  const directory = 'docs/persistence-changes/releases'
  const rootTypes = new Map<string, readonly string[]>()
  const typeCounts = archive.entries.map((entry) => {
    const types = new Set<string>()
    for (const root of entry.roots.values()) {
      let digests = rootTypes.get(root.digest)
      if (digests === undefined) {
        digests = root.schema.nodes.map((_, index) => schemaDigest(canonicalizeSchema(root.schema.nodes, index)))
        rootTypes.set(root.digest, digests)
      }
      for (const digest of digests) types.add(digest)
    }
    return types.size
  })
  const read = (name: string): string => readFileSync(join(root, directory, name), 'utf8')
  const index = (): string => {
    const heading = '| Tag | Source date (UTC) | Session version | Roots / types | Changed roots |'
    const rows = archive.entries.map((entry, index) => {
      const tag = entry.release.tag
      const date = new Date(entry.release.sourceDate).toISOString().slice(0, 10)
      return `| [${tag}](${tag}.md) | ${date} | ${entry.release.sessionFormatVersion} | ${entry.roots.size} / ${typeCounts[index]} | ${entry.record.changes.length} |`
    })
    return '\n\n' + [heading, '|---|---|---|---|---|', ...rows].join('\n') + '\n\n'
  }
  const artifacts = renderPersistenceArtifact(`${directory}/README.md`,
    replaceFacts(read('README.md'), 'index', index(), 'README.md'))
  for (const [index, entry] of archive.entries.entries()) {
    const document = (): string => {
      const path = `${entry.release.tag}.md`
      const inventory = `${count(entry.roots.size, 'root')} / ${count(typeCounts[index] as number, 'type')}`
      return replaceFacts(replaceFacts(read(path), 'inventory', inventory, path),
        'changes', '\n\n' + structuralChanges(entry) + '\n\n', path)
    }
    artifacts.push(...renderPersistenceArtifact(`${directory}/${entry.release.tag}.md`, document()))
  }
  return artifacts
}
