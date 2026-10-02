/**
 * `@deepseek-ai/dsh-repo-map` — pure repo-map building blocks (`.gitignore`-aware
 * directory traversal in {@link walk.ts}; Tree-sitter parsing and flat
 * per-file symbol extraction in {@link tree-sitter.ts}, {@link symbols.ts},
 * {@link extract.ts}) plus the Cordis plugin that consumes them:
 * `ctx.repoMap` ({@link plugin.ts}) composes a budget-bounded, naive-v1 flat
 * symbol map and injects it as durable context on `agent/pre-step`,
 * recomputing only the files a successful mutating tool call touches. This
 * module's default export is the `RepoMap` service plugin.
 * @module @deepseek-ai/dsh-repo-map
 */

export { RepoWalkError, resolveRgPath, walkRepoFiles, WALK_GRACE_MS, WALK_RAW_OUTPUT_MAX_BYTES, WALK_STDERR_MAX_BYTES } from './walk.ts'
export type { RepoWalkErrorCode, WalkOptions } from './walk.ts'
export { languageForPath, parseSource } from './tree-sitter.ts'
export type { ParsedFile, ParseSkipped } from './tree-sitter.ts'
export { extractSymbols } from './symbols.ts'
export { extractFileSymbols } from './extract.ts'
export type {
  RepoMapDiagnosticReason,
  RepoMapFileResult,
  RepoMapLanguage,
  RepoMapSymbol,
  RepoMapSymbolKind,
} from './types.ts'
export { orderFilesByRecency, renderRepoMap } from './render.ts'
export type { RankedFile } from './render.ts'
export { RepoMap, RepoMapError, Config } from './plugin.ts'
export { REPO_MAP_PLUGIN_SOURCE_NAME } from './plugin.ts'
export type { RepoMapErrorCode } from './plugin.ts'
export { DEFAULT_MIN_REPO_MAP_BYTES, DEFAULT_REPO_MAP_CONTEXT_FRACTION } from './config.ts'

export { RepoMap as default } from './plugin.ts'
