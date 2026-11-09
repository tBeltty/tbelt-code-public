/**
 * Read and write a YAML-frontmatter-delimited Markdown document. No writer
 * for this document shape exists elsewhere in this repository — only a
 * read-only parser (`packages/skill/skill-filesystem/src/index.ts`'s
 * `parseFrontmatter`/`findClosingFrontmatter`, whose CRLF-tolerant,
 * literal-`---`-delimiter scan this module's read side mirrors). The write
 * side has no precedent to mirror directly: `packages/settings/settings-file`'s
 * `patchNode` patches a whole YAML document, not a YAML block embedded in a
 * larger Markdown file. This module adapts that discipline — parse to a
 * mutable, comment-preserving tree via `parseDocument`, apply targeted
 * `setIn` edits, re-render with `toString()` — to the frontmatter block
 * specifically, so a field-only update never touches the body Markdown that
 * follows it.
 * @module @deepseek-ai/dsh-memory-storage/src/frontmatter
 */

import { Document, parseDocument, parse as parseYaml } from 'yaml'

const DELIMITER = '---'

/** One parsed frontmatter document: the YAML block's data and the raw body text that follows it. */
export interface ParsedFrontmatter {
  /** The frontmatter block, parsed as a plain object. */
  data: Record<string, unknown>
  /** Every byte after the closing delimiter's line, including its own trailing newline. */
  body: string
}

/** Byte ranges of one document's frontmatter block, before YAML parsing. */
interface FrontmatterBlock {
  /** Raw YAML source between the delimiters (exclusive of both `---` lines). */
  frontmatterText: string
  /** Every byte after the closing delimiter's line. */
  body: string
}

/**
 * Locate a document's frontmatter block by literal `---` delimiter lines,
 * tolerating CRLF line endings. Returns `undefined` when the document does
 * not open with a `---` line or the block is never closed — a document
 * without valid frontmatter, not a parse error.
 * @param raw - full document text.
 * @returns the raw frontmatter text and following body, or `undefined`.
 */
function locateFrontmatterBlock(raw: string): FrontmatterBlock | undefined {
  const firstLineEnd = raw.indexOf('\n')
  if (firstLineEnd < 0) return undefined
  const firstLine = raw.slice(0, firstLineEnd).replace(/\r$/, '')
  if (firstLine !== DELIMITER) return undefined
  const start = firstLineEnd + 1
  const closing = findClosingDelimiter(raw, start)
  if (closing === undefined) return undefined
  return { frontmatterText: raw.slice(start, closing.start), body: raw.slice(closing.bodyStart) }
}

/** Scan forward from `start` for a line that is exactly `---`, CRLF-tolerant. */
function findClosingDelimiter(raw: string, start: number): { start: number; bodyStart: number } | undefined {
  let lineStart = start
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf('\n', lineStart)
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline
    const line = raw.slice(lineStart, lineEnd).replace(/\r$/, '')
    if (line === DELIMITER) {
      return { start: lineStart, bodyStart: nextNewline < 0 ? raw.length : nextNewline + 1 }
    }
    if (nextNewline < 0) return undefined
    lineStart = nextNewline + 1
  }
  return undefined
}

/**
 * Parse a document's frontmatter block and body. Mirrors
 * `skill-filesystem`'s `parseFrontmatter` read shape exactly (same
 * delimiter-scan semantics), re-implemented here because that function is
 * private to its own package's `index.ts` exports.
 * @param raw - full document text.
 * @returns the parsed frontmatter object and body, or `undefined` when the document has no valid frontmatter block.
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter | undefined {
  const block = locateFrontmatterBlock(raw)
  if (block === undefined) return undefined
  const data: unknown = parseYaml(block.frontmatterText)
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined
  return { data: data as Record<string, unknown>, body: block.body }
}

/**
 * Render a fresh frontmatter document from scratch (no prior text to preserve formatting from).
 * @param fields - the frontmatter object.
 * @param body - body text, written verbatim after the closing delimiter.
 * @returns the complete document text.
 */
export function renderFrontmatterDocument(fields: Readonly<Record<string, unknown>>, body: string): string {
  const yamlText = new Document(fields).toString()
  return `${DELIMITER}\n${yamlText}${DELIMITER}\n${body}`
}

/**
 * Patch an existing document's frontmatter fields in place, leaving its body
 * text byte-identical. Parses the frontmatter block alone as a mutable,
 * comment-preserving YAML tree (`parseDocument`), applies one `setIn` per
 * field, and re-renders only that block — the body substring is never
 * re-parsed, re-rendered, or touched, so an update that changes only
 * metadata (e.g. bumping `modified` without changing content) cannot alter
 * or reformat the body Markdown that follows it.
 * @param existingRaw - the document's current full text; must have a valid frontmatter block.
 * @param fields - field values to set (or overwrite) in the frontmatter block.
 * @returns the complete document text with the patched frontmatter block and unchanged body.
 * @throws when `existingRaw` has no valid frontmatter block, or its YAML fails to parse.
 */
export function patchFrontmatterFields(existingRaw: string, fields: Readonly<Record<string, unknown>>): string {
  const block = locateFrontmatterBlock(existingRaw)
  if (block === undefined) {
    throw new Error('memory-storage: cannot patch frontmatter of a document without a valid frontmatter block')
  }
  const document = parseDocument(block.frontmatterText)
  if (document.errors.length > 0) {
    throw new Error(`memory-storage: invalid frontmatter YAML: ${document.errors.map(error => error.message).join('; ')}`)
  }
  for (const [key, value] of Object.entries(fields)) {
    document.setIn([key], value)
  }
  return `${DELIMITER}\n${document.toString()}${DELIMITER}\n${block.body}`
}
