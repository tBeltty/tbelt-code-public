/**
 * Parser for the SEARCH/REPLACE diff wire format.
 * @module @deepseek-ai/dsh-tool-search-replace/parser
 */

const SEARCH_MARKER = '<<<<<<< SEARCH'
const DIVIDER_MARKER = '======='
const REPLACE_MARKER = '>>>>>>> REPLACE'

/** One parsed SEARCH/REPLACE block. */
export interface SearchReplaceBlock {
  /** Exact text to find, verbatim. */
  search: string
  /** Text to substitute in place of `search`. */
  replace: string
}

/** Thrown when the diff text does not follow the SEARCH/REPLACE wire format. */
export class SearchReplaceParseError extends Error {}

/**
 * Parse one or more concatenated SEARCH/REPLACE blocks out of `diff`:
 * ```
 * <<<<<<< SEARCH
 * exact text to find
 * =======
 * replacement text
 * >>>>>>> REPLACE
 * ```
 * Throws {@link SearchReplaceParseError} on unbalanced or missing markers.
 */
export function parseSearchReplaceBlocks(diff: string): SearchReplaceBlock[] {
  const lines = diff.split('\n')
  const blocks: SearchReplaceBlock[] = []
  let cursor = 0
  while (cursor < lines.length) {
    if (lines[cursor] !== SEARCH_MARKER) {
      cursor += 1
      continue
    }
    const blockStartLine = cursor + 1
    cursor += 1
    const searchLines: string[] = []
    while (cursor < lines.length && lines[cursor] !== DIVIDER_MARKER) {
      searchLines.push(lines[cursor] as string)
      cursor += 1
    }
    if (cursor >= lines.length) {
      throw new SearchReplaceParseError(
        `Malformed SEARCH/REPLACE block starting at line ${blockStartLine}: missing "${DIVIDER_MARKER}" divider.`,
      )
    }
    cursor += 1 // skip the divider line
    const replaceLines: string[] = []
    while (cursor < lines.length && lines[cursor] !== REPLACE_MARKER) {
      replaceLines.push(lines[cursor] as string)
      cursor += 1
    }
    if (cursor >= lines.length) {
      throw new SearchReplaceParseError(
        `Malformed SEARCH/REPLACE block starting at line ${blockStartLine}: missing "${REPLACE_MARKER}" terminator.`,
      )
    }
    cursor += 1 // skip the closing marker line
    blocks.push({ search: searchLines.join('\n'), replace: replaceLines.join('\n') })
  }
  if (blocks.length === 0) {
    throw new SearchReplaceParseError('No SEARCH/REPLACE blocks found in the provided diff text.')
  }
  return blocks
}
