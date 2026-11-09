/**
 * Combines {@link parseSource} and {@link extractSymbols} into one per-file
 * result: read the file, parse it, and extract its flat symbol list, never
 * throwing for a file this package cannot usefully parse.
 * @module @deepseek-ai/dsh-repo-map/extract
 */

import { readFile } from 'node:fs/promises'
import { parseSource } from './tree-sitter.ts'
import { extractSymbols } from './symbols.ts'
import type { RepoMapFileResult } from './types.ts'

/**
 * Extract the flat symbol list for one file on disk. A file whose extension
 * has no supported language, or whose parse tree carries a Tree-sitter error
 * node, produces a result with an empty `symbols` list and a `diagnostic`
 * reason instead of throwing — see `parseSource`'s contract in
 * `tree-sitter.ts`.
 *
 * @param path - absolute or relative file path to read and parse.
 * @returns the file's extracted symbols, or a skip diagnostic.
 */
export async function extractFileSymbols(path: string): Promise<RepoMapFileResult> {
  const source = await readFile(path, 'utf8')
  const parsed = await parseSource(path, source)
  if ('diagnostic' in parsed) return { path, symbols: [], diagnostic: parsed.diagnostic }
  return { path, language: parsed.language, symbols: extractSymbols(parsed.tree) }
}
