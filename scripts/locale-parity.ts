/**
 * Check for the invariant `FALLBACK_LOCALE` rests on: every shipped dictionary
 * declares the same keys in `es`, `el`, `fr` and `en`.
 *
 * The locale runtime resolves a key through the active locale, then through
 * the single fallback locale (`en`), then surfaces the key itself. With
 * symmetric dictionaries that middle step always resolves, so one constant can
 * serve as both the opening locale and the dictionary fallback. A key added to
 * only one side breaks that: a reader of the other language sees a bare key
 * such as `list.aria` instead of text. This gate fails on the asymmetry rather
 * than waiting for the bare key to reach a UI.
 *
 * `locale-dictionary-parity.spec.ts` runs it in the test lane and
 * `verify-locale-parity.ts` runs it in the light CI job.
 *
 * Discovery is deliberately broad, because a gate that silently narrows is
 * worse than no gate. It sweeps every workspace package and app (not just
 * `packages/client`), reads dictionaries wherever they are declared —
 * `locales.ts`, a `locales/` directory, or inline in the plugin body — and
 * pairs each translated dictionary with `en` across sibling files as well as
 * within one module. A translated dictionary whose `en` counterpart cannot be
 * found anywhere is an error, not a skip.
 */

import type { Dirent } from 'node:fs'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('..', import.meta.url))

/** Locale tags that carry a shipped dictionary, with the PascalCase suffix each uses in export names. */
const LOCALE_SUFFIXES = { en: 'En', es: 'Es', el: 'El', fr: 'Fr' } as const
type DictionaryLocale = keyof typeof LOCALE_SUFFIXES
const DICTIONARY_LOCALES = Object.keys(LOCALE_SUFFIXES) as DictionaryLocale[]
const TRANSLATED_LOCALES = DICTIONARY_LOCALES.filter(locale => locale !== 'en')

/** Repo-relative path with `/` separators, so messages and suffix tests match on every OS. */
function relative(file: string): string {
  return file.slice(root.length).replaceAll('\\', '/')
}

/** Every `.ts` source file under each workspace package's and app's `src`, excluding declarations. */
function sourceFiles(): string[] {
  const files: string[] = []
  const packagesRoot = resolve(root, 'packages')
  for (const group of directories(packagesRoot)) {
    for (const pkg of directories(resolve(packagesRoot, group))) {
      walk(resolve(packagesRoot, group, pkg, 'src'), files)
    }
  }
  const appsRoot = resolve(root, 'apps')
  for (const app of directories(appsRoot)) walk(resolve(appsRoot, app, 'src'), files)
  return files.sort()
}

/** Immediate subdirectory names, or none when the path is not a directory. */
function directories(dir: string): string[] {
  return readEntries(dir).filter(entry => entry.isDirectory()).map(entry => entry.name)
}

/**
 * Directory entries, treating only a genuinely absent directory as empty.
 * Any other failure (`EACCES`, I/O) rethrows: silently reading it as "absent"
 * would narrow the sweep and let the gate pass while checking less.
 * @param dir - absolute directory path.
 * @returns entries, or none when the directory does not exist.
 */
function readEntries(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

function walk(dir: string, out: string[]): void {
  for (const entry of readEntries(dir)) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(full)
  }
}

/** One discovered dictionary: which file and export name declared it. */
interface Dictionary {
  /** Repo-relative declaring file. */
  file: string
  /** Export name, or the registration site for an inline literal. */
  name: string
  /** Declared keys, sorted. */
  keys: string[]
}

/**
 * Keys of every top-level `export const <name> = { ... }` object literal whose
 * name identifies a locale dictionary, plus inline `register(ns, locale, {...})`
 * literals. Read from the AST so the gate never executes package code.
 * @param file - absolute path of a candidate module.
 * @returns discovered dictionaries, keyed by locale-bearing name.
 */
function dictionariesIn(file: string): Dictionary[] {
  const text = readFileSync(file, 'utf8')
  // Cheap pre-filter: parsing every package source is wasteful. The pattern
  // must admit every shape `localeOf` accepts, or a file would be skipped
  // before parsing — the silent narrowing this gate exists to prevent. A bare
  // `\b(es|en)\b` misses `esSettings`/`accessEs`, because `\b` does not hold
  // between `h` and an uppercase letter.
  if (!/\b(es|en|el|fr)\b|\b(es|en|el|fr)[A-Z]|(Es|En|El|Fr)\b/.test(text)) return []
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true)
  const found: Dictionary[] = []
  const rel = relative(file)

  // Module-scope variable declarations, keyed by name. A 3-arg
  // `register(NS, tag, dict)` whose third argument is an identifier —
  // e.g. a local dictionary variable rather than an inline literal — resolves
  // through here so the gate still verifies its symmetry.
  const moduleConsts = new Map<string, ts.Expression>()
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer !== undefined) {
        moduleConsts.set(decl.name.text, decl.initializer)
      }
    }
  }

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    if (statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) !== true) continue
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue
      const literal = unwrap(decl.initializer)
      if (literal === undefined || !ts.isObjectLiteralExpression(literal)) continue
      if (localeOf(decl.name.text) === undefined) continue
      found.push({ file: rel, name: decl.name.text, keys: keysOf(literal) })
    }
  }

  // A 3-arg `register(ns, tag, dict)` call whose dictionary argument we
  // cannot turn into an object literal. We refuse instead of skipping: a
  // registration we cannot measure is exactly the silent narrowing this gate
  // exists to catch.
  const refuse = (ns: string, tag: string, why: string): never => {
    throw new Error(`cannot verify register('${ns}', '${tag}', ...) in ${rel}: ${why}`)
  }

  // Inline registrations, two shapes. A `[['es', {...}], ['en', {...}]]` pair
  // handed to a registration loop keys off the enclosing array; separate
  // `register(NS, 'es', {...})` / `register(NS, 'en', {...})` calls key off the
  // namespace argument, so the two calls pair with each other.
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const name = ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : ts.isIdentifier(callee) && callee.text === 'register' ? 'register' : undefined
      if (name === 'register' && node.arguments.length >= 3) {
        const [ns, tag, dict] = node.arguments
        if (ns === undefined || tag === undefined || !ts.isStringLiteral(tag)) return
        if (!isDictionaryLocale(tag.text)) return
        const raw = unwrap(dict)
        const literal = raw !== undefined && ts.isIdentifier(raw)
          ? (() => {
            const resolved = moduleConsts.get(raw.text)
            return resolved === undefined ? undefined : unwrap(resolved)
          })()
          : raw
        const why = raw !== undefined && ts.isIdentifier(raw)
          ? `third argument ${raw.text} does not resolve to an inline or module-scope object literal`
          : 'third argument is neither an object literal nor a resolvable dictionary variable'
        if (literal === undefined || !ts.isObjectLiteralExpression(literal)) {
          // The dictionary argument must resolve to an object literal; the
          // gate refuses rather than skips, so the symmetry it verifies never
          // silently narrows.
          refuse(ns.getText(source), tag.text, why)
        }
        const dictionary: ts.ObjectLiteralExpression = literal as ts.ObjectLiteralExpression
        // The namespace expression's source text identifies the pair, so the
        // es and en calls for one namespace meet and calls for different
        // namespaces stay apart.
        found.push({ file: rel, name: `${tag.text}@register:${ns.getText(source)}`, keys: keysOf(dictionary) })
      }
    }
    if (ts.isArrayLiteralExpression(node) && node.elements.length === 2) {
      const site = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
      for (const element of node.elements) {
        if (!ts.isArrayLiteralExpression(element) || element.elements.length !== 2) continue
        const [tag, dict] = element.elements
        const literal = unwrap(dict)
        if (tag === undefined || !ts.isStringLiteral(tag)) continue
        if (literal === undefined || !ts.isObjectLiteralExpression(literal)) continue
        if (!isDictionaryLocale(tag.text)) continue
        found.push({ file: rel, name: `${tag.text}@inline:${site}`, keys: keysOf(literal) })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

/** Declared property names of an object literal, sorted. */
function keysOf(literal: ts.ObjectLiteralExpression): string[] {
  const keys: string[] = []
  for (const prop of literal.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    if (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) keys.push(prop.name.text)
  }
  return keys.sort()
}

/** Look through `satisfies`/`as`/parenthesized wrappers to the literal. */
function unwrap(node: ts.Expression | undefined): ts.Expression | undefined {
  let current = node
  while (
    current !== undefined
    && (ts.isSatisfiesExpression(current) || ts.isAsExpression(current) || ts.isParenthesizedExpression(current))
  ) {
    current = current.expression
  }
  return current
}

/** Whether a registration tag names a shipped dictionary locale. */
function isDictionaryLocale(tag: string): tag is DictionaryLocale {
  return (DICTIONARY_LOCALES as readonly string[]).includes(tag)
}

/**
 * The locale a dictionary name declares, and the namespace-ish remainder that
 * identifies which pair it belongs to. `es`/`en`, `esSettings`/`enSettings`,
 * and `settingsEs`/`settingsEn` are the shapes this repo uses. A name-prefix
 * shape requires an uppercase ASCII letter at the third position (`[A-Z]`),
 * matching the admission of the cheap pre-filter, so `es2Foo`/`es_probe`
 * cannot be treated as dictionaries in one place and skipped in another.
 * @param name - export name or synthetic inline name.
 * @returns locale plus pair key, or undefined when the name names no locale.
 */
function localeOf(name: string): { locale: DictionaryLocale; pair: string } | undefined {
  for (const locale of DICTIONARY_LOCALES) {
    const other = LOCALE_SUFFIXES[locale]
    if (name === locale) return { locale, pair: '' }
    // Synthetic names for inline shapes carry their own pair key after the
    // first ':' (the enclosing array's line, or the namespace expression).
    if (name.startsWith(`${locale}@`)) return { locale, pair: name.slice(name.indexOf(':')) }
    if (name.startsWith(locale) && name.length > 2 && /[A-Z]/.test(name[2] ?? '')) {
      return { locale, pair: name.slice(2) }
    }
    if (name.endsWith(other)) return { locale, pair: name.slice(0, -2) }
  }
  return undefined
}

/** Result of one parity sweep. */
export interface LocaleParityReport {
  /** Source files swept; a collapse means discovery narrowed. */
  files: number
  /** Translated dictionaries compared with their English counterpart. */
  comparedPairs: number
  /** One line per missing or orphaned key or dictionary. */
  problems: string[]
}

/**
 * Sweeps every dictionary and compares each translation with its English pair.
 * @returns the sweep counts and every asymmetry found.
 */
export function checkLocaleParity(): LocaleParityReport {
  const files = sourceFiles()
  // Pair within a file first; a dictionary whose counterpart is not in the
  // same module then pairs with a sibling in the same directory. Both shapes
  // ship here: `locales/settings.ts` exports es+en together, while
  // `locales/es.ts` + `locales/en.ts` split the common pair across files.
  const perFile = new Map<string, Dictionary[]>()
  for (const file of files) {
    const dicts = dictionariesIn(file)
    if (dicts.length > 0) perFile.set(relative(file), dicts)
  }

  const groups = new Map<string, Map<DictionaryLocale, Dictionary>>()
  const place = (key: string, locale: DictionaryLocale, dict: Dictionary): void => {
    const slot = groups.get(key) ?? new Map<DictionaryLocale, Dictionary>()
    if (slot.has(locale)) {
      throw new Error(`two ${locale} dictionaries claim pair ${key}: ${slot.get(locale)?.file} and ${dict.file}`)
    }
    slot.set(locale, dict)
    groups.set(key, slot)
  }

  for (const [rel, dicts] of perFile) {
    for (const dict of dicts) {
      const parsed = localeOf(dict.name)
      if (parsed === undefined) continue
      const sameFileCounterpart = dicts.some((other) => {
        const otherParsed = localeOf(other.name)
        return otherParsed !== undefined
          && otherParsed.pair === parsed.pair
          && otherParsed.locale !== parsed.locale
      })
      // Same-file pairs key by file so two pairs in one directory stay
      // distinct; split pairs key by directory so siblings meet.
      const key = sameFileCounterpart ? `${rel}::${parsed.pair}` : `${dirname(rel)}::${parsed.pair}`
      place(key, parsed.locale, dict)
    }
  }

  const problems: string[] = []
  let comparedPairs = 0
  for (const [key, slot] of [...groups].sort()) {
    const en = slot.get('en')
    const translated = TRANSLATED_LOCALES.flatMap(locale => slot.get(locale) ?? [])
    if (en === undefined || translated.length === 0) {
      const present = en ?? translated[0]
      problems.push(`${present?.file} declares ${present?.name} with no counterpart for pair ${key}`)
      continue
    }
    for (const locale of TRANSLATED_LOCALES) {
      const dict = slot.get(locale)
      if (dict === undefined) {
        problems.push(`${en.file} ${en.name} has no ${locale} dictionary for pair ${key}`)
        continue
      }
      comparedPairs++
      const only = dict.keys.filter(k => !en.keys.includes(k))
      const missing = en.keys.filter(k => !dict.keys.includes(k))
      if (only.length > 0) problems.push(`${dict.file} ${dict.name} has keys absent from ${en.name}: ${only.join(', ')}`)
      if (missing.length > 0) problems.push(`${en.file} ${en.name} has keys absent from ${dict.name}: ${missing.join(', ')}`)
    }
  }

  return { files: files.length, comparedPairs, problems }
}
