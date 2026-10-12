/**
 * Verify that client UI components take their visible copy from locale dictionaries.
 *
 * Product text in a `.tsx` component reaches the reader through `t(key)` or a localized primitive
 * prop. A literal in JSX text, in a visible attribute, or in a string child expression renders the
 * same words in every language. The scan reads the syntax tree, so it also finds text split across
 * lines and `{'text'}` children that a line-wise search misses.
 *
 * A literal that is not product copy (a sample host name in a placeholder, for instance) carries an
 * `i18n-exempt: <reason>` comment on its line or the line above it.
 */

import { globSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')

/** Comment marker that states why a literal is not product copy. */
export const EXEMPT_MARKER = 'i18n-exempt:'

/** JSX attributes whose string value is shown to the reader or announced by assistive technology. */
const VISIBLE_ATTRIBUTES = new Set(['title', 'aria-label', 'aria-description', 'placeholder', 'alt', 'label', 'tooltip'])

/** Two consecutive letters of any script; punctuation, digits and symbols alone are not copy. */
const WORD = /\p{L}{2,}/u

/** One literal that would render in every language. */
export interface CopyViolation {
  /** Repository-relative path, in POSIX separators. */
  readonly file: string
  /** One-based line number. */
  readonly line: number
  /** Where the literal sits: JSX text, a string child, or the named attribute. */
  readonly what: string
  /** The literal, trimmed and shortened for display. */
  readonly text: string
}

/**
 * Whether the line holding a position, or the line above it, carries the exemption marker.
 * @param lines - source lines.
 * @param line - zero-based line of the literal.
 * @returns whether an exemption comment applies.
 */
function isExempt(lines: readonly string[], line: number): boolean {
  return (lines[line] ?? '').includes(EXEMPT_MARKER) || (lines[line - 1] ?? '').includes(EXEMPT_MARKER)
}

/**
 * Find literals in one component source that bypass the locale dictionaries.
 * @param file - repository-relative path used in the report.
 * @param text - TSX source.
 * @returns every violation, in source order.
 */
export function findCopyViolations(file: string, text: string): CopyViolation[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const lines = text.split('\n')
  const found: CopyViolation[] = []
  const report = (node: ts.Node, what: string, literal: string): void => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line
    if (isExempt(lines, line)) return
    const trimmed = literal.trim()
    found.push({ file, line: line + 1, what, text: trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed })
  }
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node) && WORD.test(node.text)) report(node, 'JSX text', node.text)
    if (
      ts.isJsxExpression(node) && node.expression !== undefined && ts.isJsxElement(node.parent)
      && (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression))
      && WORD.test(node.expression.text)
    ) report(node, 'string child', node.expression.text)
    if (ts.isJsxAttribute(node) && VISIBLE_ATTRIBUTES.has(node.name.getText(source))) {
      const value = node.initializer
      const literal = value !== undefined && ts.isStringLiteral(value)
        ? value
        : value !== undefined && ts.isJsxExpression(value) && value.expression !== undefined
          && (ts.isStringLiteral(value.expression) || ts.isNoSubstitutionTemplateLiteral(value.expression))
          ? value.expression
          : undefined
      if (literal !== undefined && WORD.test(literal.text)) report(node, `${node.name.getText(source)} attribute`, literal.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

/**
 * Scan every package and app component source in the repository.
 * @returns every violation found, in scan order.
 * @throws when the corpus is empty, which would make the gate pass by scanning nothing.
 */
export function scanRepository(): CopyViolation[] {
  const files = [
    ...globSync('packages/*/*/src/**/*.tsx', { cwd: root }),
    ...globSync('apps/*/src/**/*.tsx', { cwd: root }),
  ].sort()
  if (files.length === 0) throw new Error('verify-client-ui-i18n: scanned an empty corpus; the globs no longer match.')
  return files.flatMap(file => findCopyViolations(file, readFileSync(resolve(root, file), 'utf8')))
}

function main(): void {
  const violations = scanRepository()
  if (violations.length === 0) {
    console.log('verify-client-ui-i18n: every component takes its visible copy from a dictionary.')
    return
  }
  console.error('verify-client-ui-i18n: literal text in a component renders the same in every language.\n')
  for (const violation of violations) {
    console.error(`  ${relative('.', violation.file)}:${String(violation.line)} ${violation.what}: ${violation.text}`)
  }
  console.error(`\nMove the text into the package's en and es dictionaries, or add an \`${EXEMPT_MARKER} <reason>\` comment`)
  console.error('when the literal is not product copy.')
  process.exit(1)
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) main()
