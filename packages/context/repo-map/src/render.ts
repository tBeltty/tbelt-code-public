/**
 * Deterministic, budget-bounded rendering of a repo's flat symbol map into
 * one text block. Naive v1 per the Plan of Record: a flat per-file list in
 * priority order, no cross-file ranking. When the naive rendering would
 * exceed the byte budget, whole files are dropped from the tail of the
 * priority order (never truncated mid-file) until it fits.
 * @module @deepseek-ai/dsh-repo-map/render
 */

import type { RepoMapFileResult, RepoMapSymbol } from './types.ts'

/** One walked file, its extracted symbols, and the recency signal that orders truncation. */
export interface RankedFile {
  readonly path: string
  readonly result: RepoMapFileResult
  /** Filesystem `mtimeMs`, or `0` when unavailable; higher sorts earlier (kept preferentially). */
  readonly mtimeMs: number
}

const HEADER = 'Repo map (auto-generated, naive v1 — flat symbol list, no cross-file ranking; may be truncated to fit budget):\n'

function renderFileBlock(path: string, symbols: readonly RepoMapSymbol[]): string {
  if (symbols.length === 0) return ''
  const lines = symbols.map(symbol => `  - ${symbol.kind} ${symbol.name} (L${symbol.line})`)
  return `${path}:\n${lines.join('\n')}\n`
}

/**
 * Order files most-recently-touched first (largest `mtimeMs`), tied paths
 * broken alphabetically for deterministic output. This is the priority order
 * both {@link renderRepoMap}'s inclusion and its budget-driven truncation
 * apply against — most-recently-touched files are kept preferentially, and
 * are the last ones dropped when the naive rendering exceeds budget.
 * @param files - the walked files to order; not mutated.
 * @returns a new array in priority order.
 */
export function orderFilesByRecency(files: readonly RankedFile[]): RankedFile[] {
  return [...files].sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path))
}

/**
 * Render every file's block in `orderedFiles`' priority order, stopping
 * before any block whose addition would exceed `byteBudget`. A file that
 * produced no symbols contributes no block and no bytes. Never truncates a
 * file's block mid-symbol — an omitted file is omitted entirely, so a
 * consumer can retry with more files dropped from the tail rather than
 * repairing a partial block.
 * @param orderedFiles - files already in priority order (see {@link orderFilesByRecency}).
 * @param byteBudget - the UTF-8 byte cap the returned text must not exceed.
 * @returns the rendered text, always `byteBudget`-or-under.
 */
export function renderRepoMap(orderedFiles: readonly RankedFile[], byteBudget: number): string {
  let text = HEADER
  let bytes = Buffer.byteLength(text, 'utf8')
  for (const file of orderedFiles) {
    const block = renderFileBlock(file.path, file.result.symbols)
    if (block.length === 0) continue
    const blockBytes = Buffer.byteLength(block, 'utf8')
    if (bytes + blockBytes > byteBudget) break
    text += block
    bytes += blockBytes
  }
  return text
}
