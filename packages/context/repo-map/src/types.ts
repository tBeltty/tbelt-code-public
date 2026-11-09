/**
 * Shared vocabulary for repo-map traversal and symbol extraction.
 * @module @deepseek-ai/dsh-repo-map/types
 */

/** A source language this package can parse into a Tree-sitter tree. */
export type RepoMapLanguage = 'typescript' | 'tsx' | 'javascript'

/** The flat, naive-v1 symbol categories extracted from one parsed file. Never a cross-file rank or score. */
export type RepoMapSymbolKind = 'class' | 'function' | 'interface' | 'import'

/** One extracted symbol: its category, name, and 1-based source line. */
export interface RepoMapSymbol {
  kind: RepoMapSymbolKind
  name: string
  line: number
}

/**
 * Why a file produced no symbols. `unsupported-language` — the path's
 * extension has no {@link RepoMapLanguage} mapping, so the file was never
 * parsed. `syntax-error` — the file parsed but Tree-sitter's own error
 * recovery flagged the resulting tree (`rootNode.hasError`), so extraction
 * was skipped rather than risk returning symbols read from a malformed
 * subtree.
 */
export type RepoMapDiagnosticReason = 'unsupported-language' | 'syntax-error'

/** One file's extraction outcome: either a symbol list, or a skip diagnostic. */
export interface RepoMapFileResult {
  path: string
  language?: RepoMapLanguage
  symbols: RepoMapSymbol[]
  diagnostic?: RepoMapDiagnosticReason
}
