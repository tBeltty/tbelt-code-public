/**
 * Per-file symbol extraction from a Tree-sitter parse tree: a flat list of
 * classes, functions, interfaces, and imports. No cross-file ranking or
 * scoring — naive v1 per the Plan of Record's "naive before Aider-style
 * PageRank" recommendation; that composition step is a later task.
 * @module @deepseek-ai/dsh-repo-map/symbols
 */

import type { Node, Tree } from 'web-tree-sitter'
import type { RepoMapSymbol, RepoMapSymbolKind } from './types.ts'

/** Tree-sitter node types this extractor recognizes, mapped to the flat {@link RepoMapSymbolKind} they produce. */
const NODE_TYPE_KINDS: Readonly<Record<string, RepoMapSymbolKind>> = {
  class_declaration: 'class',
  abstract_class_declaration: 'class',
  function_declaration: 'function',
  generator_function_declaration: 'function',
  interface_declaration: 'interface',
  import_statement: 'import',
}

/** Strip the surrounding quotes Tree-sitter keeps on a `string` node's text. */
function unquote(text: string): string {
  if (text.length >= 2 && (text[0] === '"' || text[0] === '\'' || text[0] === '`') && text[text.length - 1] === text[0]) {
    return text.slice(1, -1)
  }
  return text
}

/**
 * Derive one symbol's display name from its declaration node. A named
 * class/function/interface uses its `name` field; an `import_statement` uses
 * its unquoted module specifier (the `source` field) since one import
 * statement can bind several local names and the flat v1 list records the
 * imported module, not each binding.
 */
function symbolName(node: Node, kind: RepoMapSymbolKind): string | undefined {
  if (kind === 'import') {
    const source = node.childForFieldName('source')
    return source === null ? undefined : unquote(source.text)
  }
  const name = node.childForFieldName('name')
  return name === null ? undefined : name.text
}

/**
 * Extract the flat, per-file symbol list from a parsed tree. Anonymous
 * declarations Tree-sitter's grammar permits in some contexts (a default
 * export's unnamed `class`/`function`) are skipped — there is no name to
 * record and the flat list carries no positional/anonymous entries.
 *
 * @param tree - a tree returned by `parseSource` (never a tree with `rootNode.hasError`).
 * @returns symbols in source (document) order.
 */
export function extractSymbols(tree: Tree): RepoMapSymbol[] {
  const nodeTypes = Object.keys(NODE_TYPE_KINDS)
  const nodes = tree.rootNode.descendantsOfType(nodeTypes)
  const symbols: RepoMapSymbol[] = []
  for (const node of nodes) {
    if (node === null) continue
    const kind = NODE_TYPE_KINDS[node.type]
    if (kind === undefined) continue
    const name = symbolName(node, kind)
    if (name === undefined || name.length === 0) continue
    symbols.push({ kind, name, line: node.startPosition.row + 1 })
  }
  return symbols
}
