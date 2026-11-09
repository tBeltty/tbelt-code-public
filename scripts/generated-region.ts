/**
 * Pure parsing and hashing helpers for generator-owned Markdown regions.
 * Kept separate from any one generator so the generated-region grammar and
 * the blob-hash primitive can be regression-tested independently of any
 * specific document projection.
 */

import { createHash } from 'node:crypto'

/** Complete opening marker line: `<!-- BEGIN GENERATED <slug> … -->` (slug captured). */
const GENERATED_REGION_BEGIN_LINE = /^<!-- BEGIN GENERATED (\S+)(?: [^>]*)? -->$/
/** Complete closing marker line: `<!-- END GENERATED <slug> -->` (slug captured). */
const GENERATED_REGION_END_LINE = /^<!-- END GENERATED (\S+) -->$/
/** Loose marker detector: any line that LOOKS like a region marker must parse as one. */
const GENERATED_REGION_MARKER_HINT = /^<!-- (?:BEGIN|END) GENERATED /

/**
 * Extract every generated region (markers included) and the document with
 * those regions removed. Regions are line-delimited: a marker occupies its
 * whole line, must be a complete well-formed marker, and the closing slug
 * must match the opener.
 *
 * @param content - Full Markdown document text.
 * @returns The regions in document order and the region-free remainder.
 * @throws Error on an unopened END, unclosed BEGIN, nested BEGIN, malformed
 *   marker line, or a closing slug that does not match its opener.
 */
export function partitionGeneratedRegions(content: string): { regions: string[]; stripped: string } {
  const lines = content.split('\n')
  const regions: string[] = []
  const kept: string[] = []
  let open: { slug: string; lines: string[] } | null = null
  for (const line of lines) {
    const begin = GENERATED_REGION_BEGIN_LINE.exec(line)
    if (begin?.[1]) {
      if (open) throw new Error('generated region BEGIN marker nested inside an open region')
      open = { slug: begin[1], lines: [line] }
      continue
    }
    const end = GENERATED_REGION_END_LINE.exec(line)
    if (end?.[1]) {
      if (!open) throw new Error('generated region END marker without a BEGIN')
      if (end[1] !== open.slug) throw new Error(`generated region END slug '${end[1]}' does not match its BEGIN slug '${open.slug}'`)
      open.lines.push(line)
      regions.push(open.lines.join('\n'))
      open = null
      continue
    }
    if (GENERATED_REGION_MARKER_HINT.test(line)) {
      throw new Error(`malformed generated region marker line: ${JSON.stringify(line)}`)
    }
    if (open) open.lines.push(line)
    else kept.push(line)
  }
  if (open) throw new Error('generated region BEGIN marker without an END')
  return { regions, stripped: kept.join('\n') }
}

/**
 * Full git blob hash of file content (what `git hash-object` prints).
 * @param content - Exact file bytes.
 * @returns The 40-hex-digit SHA-1 blob hash.
 */
export function blobHash(content: Buffer): string {
  const hash = createHash('sha1')
  hash.update(`blob ${content.byteLength}\0`)
  hash.update(content)
  return hash.digest('hex')
}
