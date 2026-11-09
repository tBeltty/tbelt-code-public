/**
 * Sequential exact-match application of SEARCH/REPLACE blocks against an
 * in-memory string. Reuses `tool-str-replace-editor`'s offset-scanning and
 * uniqueness discipline (see `packages/fs/tool-str-replace-editor/src/index.ts`'s
 * `matchOffsets`/`lineNumbersAt`), generalized to more than one block per call.
 * When a block has zero exact matches, falls back to the whitespace-tolerant
 * matcher in `fuzzy.ts` before giving up (see P2-T3).
 * @module @deepseek-ai/dsh-tool-search-replace/apply
 */

import { FsError } from '@deepseek-ai/dsh-fs'
import { findFuzzyMatches } from './fuzzy.ts'
import type { SearchReplaceBlock } from './parser.ts'

function matchOffsets(content: string, search: string): number[] {
  const offsets: number[] = []
  let offset = 0
  while (true) {
    const match = content.indexOf(search, offset)
    if (match < 0) return offsets
    offsets.push(match)
    offset = match + search.length
  }
}

function lineNumbersAt(content: string, offsets: readonly number[]): number[] {
  let line = 1
  let cursor = 0
  return offsets.map((offset) => {
    while (cursor < offset) {
      if (content[cursor] === '\n') line += 1
      cursor += 1
    }
    return line
  })
}

/** Result of applying a sequence of blocks: the final content plus which blocks (1-based) only matched fuzzily. */
export interface ApplyResult {
  /** The content after all blocks have been applied in sequence. */
  content: string
  /** 1-based indexes of blocks that matched only via the whitespace-tolerant fallback, not exactly. */
  fuzzyBlockIndexes: number[]
}

/**
 * Apply `blocks` sequentially against `content`: each block's SEARCH text is
 * matched against the result of applying the previous block, not against the
 * original content, so multiple edits in one call compose. Each block's
 * SEARCH text must match exactly once; if it has zero exact matches, retry
 * with the whitespace/indentation-tolerant fallback in `fuzzy.ts` — that
 * fallback must itself resolve to exactly one candidate window, an ambiguous
 * fuzzy match is still an error. Zero or multiple matches (exact or fuzzy)
 * throw {@link FsError} with `FS_EDIT_NOT_FOUND` / `FS_AMBIGUOUS_EDIT`.
 */
export function applySearchReplaceBlocks(content: string, blocks: readonly SearchReplaceBlock[]): ApplyResult {
  let result = content
  const fuzzyBlockIndexes: number[] = []
  blocks.forEach((block, index) => {
    const offsets = matchOffsets(result, block.search)
    if (offsets.length === 1) {
      const offset = offsets[0] as number
      result = result.slice(0, offset) + block.replace + result.slice(offset + block.search.length)
      return
    }
    if (offsets.length > 1) {
      const lines = lineNumbersAt(result, offsets)
      throw new FsError(
        `No replacement performed: block ${index + 1}'s SEARCH text is ambiguous, matching lines [${lines.join(', ')}]. Please include more context to make it unique.`,
        'FS_AMBIGUOUS_EDIT',
      )
    }
    // Zero exact matches: retry with whitespace/indentation-tolerant comparison
    // before giving up. The fallback still requires a unique match.
    const fuzzyMatches = findFuzzyMatches(result, block.search)
    if (fuzzyMatches.length === 0) {
      throw new FsError(
        `No replacement performed: block ${index + 1}'s SEARCH text did not appear verbatim.`,
        'FS_EDIT_NOT_FOUND',
      )
    }
    if (fuzzyMatches.length > 1) {
      const lines = lineNumbersAt(result, fuzzyMatches.map(match => match.offset))
      throw new FsError(
        `No replacement performed: block ${index + 1}'s SEARCH text is ambiguous under whitespace-tolerant matching, matching lines [${lines.join(', ')}]. Please include more context to make it unique.`,
        'FS_AMBIGUOUS_EDIT',
      )
    }
    const { offset, length } = fuzzyMatches[0] as { offset: number; length: number }
    result = result.slice(0, offset) + block.replace + result.slice(offset + length)
    fuzzyBlockIndexes.push(index + 1)
  })
  return { content: result, fuzzyBlockIndexes }
}
