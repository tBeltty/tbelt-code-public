/**
 * Tree-sitter parser setup: language detection by file extension, lazy
 * WASM grammar loading, and error-tolerant parsing. See the package README
 * for the native-vs-WASM dependency decision (`web-tree-sitter` chosen over
 * native `tree-sitter` bindings because this repo ships a single-executable
 * `pkg` build — see `resolveRgPath` in `walk.ts` and `native/README.md` for
 * the existing native-module story — and a native `.node` grammar addon
 * cannot be loaded from `pkg`'s virtual filesystem without the same kind of
 * per-platform sidecar workaround ripgrep already needs, multiplied by every
 * supported language).
 * @module @deepseek-ai/dsh-repo-map/tree-sitter
 */

import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Language, Parser, type Tree } from 'web-tree-sitter'
import type { RepoMapDiagnosticReason, RepoMapLanguage } from './types.ts'

/** The packaged WASM grammar filename for each supported language, from the `tree-sitter-wasms` bundle. */
const GRAMMAR_FILENAMES: Readonly<Record<RepoMapLanguage, string>> = {
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-javascript.wasm',
}

/** File extensions mapped to the {@link RepoMapLanguage} that parses them. */
const EXTENSION_LANGUAGES: ReadonlyArray<readonly [string, RepoMapLanguage]> = [
  ['.tsx', 'tsx'],
  ['.mts', 'typescript'],
  ['.cts', 'typescript'],
  ['.ts', 'typescript'],
  ['.mjs', 'javascript'],
  ['.cjs', 'javascript'],
  ['.jsx', 'javascript'],
  ['.js', 'javascript'],
]

/**
 * Resolve the {@link RepoMapLanguage} for a file path by extension, longest
 * match first so `.mts`/`.cts` do not fall through to the generic `.ts`
 * mapping.
 * @param path - a file path or bare filename; only the extension is read.
 * @returns the matched language, or `undefined` when no supported extension matches.
 */
export function languageForPath(path: string): RepoMapLanguage | undefined {
  const lowerPath = path.toLowerCase()
  for (const [extension, language] of EXTENSION_LANGUAGES) {
    if (lowerPath.endsWith(extension)) return language
  }
  return undefined
}

let initPromise: Promise<void> | undefined

/** Initialize the Tree-sitter WASM runtime once per process. */
function ensureInitialized(): Promise<void> {
  initPromise ??= Parser.init()
  return initPromise
}

const languageCache = new Map<RepoMapLanguage, Promise<Language>>()

/**
 * Resolve the on-disk path to a language's packaged `.wasm` grammar via
 * `tree-sitter-wasms`'s own `package.json` location, so the lookup works
 * regardless of the workspace's hoisting layout.
 */
function resolveGrammarPath(language: RepoMapLanguage): string {
  const require = createRequire(import.meta.url)
  const packageJsonPath = require.resolve('tree-sitter-wasms/package.json')
  return join(dirname(packageJsonPath), 'out', GRAMMAR_FILENAMES[language])
}

/**
 * Load (and memoize) one language's grammar. The grammar bytes are read
 * directly with `node:fs/promises` and passed to `Language.load()` as a
 * buffer rather than a path string: `web-tree-sitter`'s ESM build's
 * path-argument branch calls a bundler-shimmed `require("fs/promises")` that
 * throws under a plain ESM entrypoint (no `require` global in scope) — the
 * buffer branch avoids that code path entirely.
 */
async function loadLanguage(language: RepoMapLanguage): Promise<Language> {
  let promise = languageCache.get(language)
  if (promise === undefined) {
    promise = ensureInitialized().then(async () => {
      const bytes = await readFile(resolveGrammarPath(language))
      return Language.load(bytes)
    })
    languageCache.set(language, promise)
  }
  return promise
}

/** A parsed file: its resolved language and the resulting Tree-sitter tree. */
export interface ParsedFile {
  language: RepoMapLanguage
  tree: Tree
}

/** A file that produced no {@link ParsedFile}, with the reason extraction was skipped. */
export interface ParseSkipped {
  diagnostic: RepoMapDiagnosticReason
}

/**
 * Parse one file's source text. Tree-sitter itself never throws on malformed
 * input — it always returns a tree, marking unparseable regions with `ERROR`
 * nodes — so this function's only failure mode is a skip: an unsupported
 * extension short-circuits before parsing (`unsupported-language`), and a
 * tree whose `rootNode.hasError` is true is discarded rather than risking
 * symbol extraction read from a malformed subtree (`syntax-error`). Callers
 * must not throw a parse failure into the surrounding walk; this contract is
 * why the return type carries the skip reason instead of throwing one.
 *
 * @param path - the file path; only used to resolve the language by extension.
 * @param source - the file's complete source text.
 * @returns the parsed tree and language, or a skip diagnostic.
 */
export async function parseSource(path: string, source: string): Promise<ParsedFile | ParseSkipped> {
  const language = languageForPath(path)
  if (language === undefined) return { diagnostic: 'unsupported-language' }
  const grammar = await loadLanguage(language)
  const parser = new Parser()
  parser.setLanguage(grammar)
  const tree = parser.parse(source)
  if (tree === null || tree.rootNode.hasError) return { diagnostic: 'syntax-error' }
  return { language, tree }
}
