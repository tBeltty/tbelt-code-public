/** Render historical format references from complete, validated in-tree schemas. */

import { readFileSync } from 'node:fs'
import { basename, join, posix } from 'node:path'
import { renderPersistenceArtifact, type PersistenceArtifact } from './persistence-artifacts.ts'
import type { PersistenceFormatEntry, PersistenceFormats } from './persistence-formats.ts'
import { renderPersistenceSchemaDefinitions, renderPersistenceSchemaIndex } from './render-persistence-schema.ts'

function replaceRegion(source: string, name: string, content: string, path: string): string {
  const start = `<!-- persistence-format-${name}:start -->`
  const end = `<!-- persistence-format-${name}:end -->`
  const opening = source.indexOf(start)
  const closing = source.indexOf(end)
  if (opening < 0 || closing < opening || source.indexOf(start, opening + start.length) >= 0
    || source.indexOf(end, closing + end.length) >= 0) throw new Error(`${path}: expected one ${name} factual block`)
  return source.slice(0, opening + start.length) + '\n\n' + content.trim() + '\n\n' + source.slice(closing)
}

function historicalSchema(entry: PersistenceFormatEntry): string {
  const schema = basename(entry.schemaPath)
  const introduction = `The [complete machine inventory](${schema}) contains ${entry.inventory.roots.length} roots and ${entry.inventory.types.length} reachable types. Digests include all referenced fields; source names and paths describe the selected historical tree.`
  return [
    '<a id="schema"></a>',
    '## Complete schemas',
    '',
    introduction,
    '',
    renderPersistenceSchemaIndex(entry.inventory, 'en', [], 3),
    '<details>',
    '<summary>Complete resolved types</summary>',
    '',
    renderPersistenceSchemaDefinitions(entry.inventory, 'en', () => undefined, 3),
    '</details>',
  ].join('\n')
}

function formatIndex(formats: PersistenceFormats): string {
  const path = (target: string): string => posix.relative('docs/persistence-changes/historical-formats', target)
  return [
    '| Format | Source | Reference | Machine schema | Roots / types |',
    '|---|---|---|---|---|',
    ...formats.entries.map((entry) => {
      const source = entry.source === undefined ? 'Current checkout'
        : 'tag' in entry.source ? `\`${entry.source.tag}\`` : `PR #${entry.source.pullRequest}`
      const label = entry.version === formats.currentVersion ? 'Current catalog' : `V${entry.version}`
      return `| ${entry.version} | ${source} | [${label}](${path(entry.document)}) | [JSON](${path(entry.schemaPath)}) | ${entry.inventory.roots.length} / ${entry.inventory.types.length} |`
    }),
  ].join('\n')
}

/**
 * Refresh bounded schema regions and the format index, preserving authored evidence.
 * @param root - repository with the document and factual markers.
 * @param formats - complete validated versions through the current writer.
 * @returns references without modifying files.
 */
export function persistenceFormatFactArtifacts(root: string, formats: PersistenceFormats): PersistenceArtifact[] {
  const artifacts: PersistenceArtifact[] = []
  for (const entry of formats.entries.filter(entry => entry.version < formats.currentVersion)) {
    const render = (): string => replaceRegion(readFileSync(join(root, entry.document), 'utf8'), 'schema', historicalSchema(entry), entry.document)
    artifacts.push(...renderPersistenceArtifact(entry.document, render()))
  }
  const index = 'docs/persistence-changes/historical-formats/README.md'
  const renderIndex = (): string => replaceRegion(readFileSync(join(root, index), 'utf8'), 'index', formatIndex(formats), index)
  artifacts.push(...renderPersistenceArtifact(index, renderIndex()))
  return artifacts
}
