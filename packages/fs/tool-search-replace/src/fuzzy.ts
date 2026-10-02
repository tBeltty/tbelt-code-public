/**
 * Whitespace/indentation-tolerant fallback matcher for SEARCH/REPLACE blocks.
 * Used only after an exact match attempt finds zero occurrences (see
 * `apply.ts`) — never as a first choice, so an exact but differently-placed
 * match always wins over a fuzzy one. Naive line-window normalization only;
 * token-level similarity scoring is explicitly out of scope for this pass.
 * @module @deepseek-ai/dsh-tool-search-replace/fuzzy
 */

function normalizeLine(line: string): string {
  return line.trim().replace(/\s+/g, ' ')
}

function normalizeBlock(lines: readonly string[]): string {
  return lines.map(normalizeLine).join('\n')
}

/** One whitespace-normalized match of a SEARCH block against a content window. */
export interface FuzzyMatch {
  /** Character offset in the original content where the window starts. */
  offset: number
  /** Character length of the window in the original (raw) content. */
  length: number
}

/**
 * Scan `content` for line-windows with the same line count as `search`,
 * comparing each window's whitespace-normalized text (leading/trailing
 * trimmed per line, internal runs collapsed to one space) against the
 * same-normalized `search` text. Every window whose normalized text matches
 * is returned, regardless of count — callers decide what zero/one/many means.
 */
export function findFuzzyMatches(content: string, search: string): FuzzyMatch[] {
  const searchLines = search.split('\n')
  const normalizedSearch = normalizeBlock(searchLines)
  const contentLines = content.split('\n')
  const windowSize = searchLines.length
  const matches: FuzzyMatch[] = []

  const lineStarts: number[] = [0]
  for (let i = 0; i < contentLines.length - 1; i++) {
    lineStarts.push(lineStarts[i] as number + (contentLines[i] as string).length + 1)
  }

  for (let start = 0; start + windowSize <= contentLines.length; start++) {
    const windowLines = contentLines.slice(start, start + windowSize)
    if (normalizeBlock(windowLines) !== normalizedSearch) continue
    const offset = lineStarts[start] as number
    const length = windowLines.join('\n').length
    matches.push({ offset, length })
  }

  return matches
}
