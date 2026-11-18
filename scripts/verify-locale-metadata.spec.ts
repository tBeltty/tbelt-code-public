/** Metadata coverage rejects missing translations through the same checker used by CI. */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { localeMetadataProblems } from './verify-locale-metadata.ts'

import { SHIPPED_LOCALE_IDS } from './shipped-locales.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture(es: unknown = { meta: { title: 'Nombre {name}', description: 'Descripcion localizada.' } }): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-locale-meta-'))
  roots.push(root)
  const directory = join(root, 'packages/demo/plugin/locale')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'en.json'), JSON.stringify({ meta: { title: 'Name {name}', description: 'Description.' } }))
  writeFileSync(join(directory, 'es.json'), JSON.stringify(es))
  for (const language of ['el', 'fr']) {
    writeFileSync(join(directory, `${language}.json`), JSON.stringify({ meta: { title: 'Name {name}', description: 'Localized description.' } }))
  }
  return root
}

it('accepts complete shipped-language metadata', () => {
  expect(localeMetadataProblems(fixture())).toEqual([])
})

it('rejects missing es files, including newly added packages', () => {
  const root = fixture()
  rmSync(join(root, 'packages/demo/plugin/locale/es.json'))
  expect(localeMetadataProblems(root).join('\n')).toContain('es.json')
})

it.each([
  [{ meta: { title: 'Nombre {name}' } }, 'missing meta.description'],
  [{ meta: { title: 'Nombre {other}', description: 'Descripcion.' } }, 'changes placeholders'],
  [{ meta: { title: '', description: 'Descripcion.' } }, 'expected non-empty text'],
  [{ meta: { title: 'Nombre {name}', description: 'Descripcion.', extra: 'extra' } }, 'unexpected meta.extra'],
])('rejects incomplete or inconsistent es metadata', (es, diagnostic) => {
  expect(localeMetadataProblems(fixture(es)).join('\n')).toContain(diagnostic)
})

it('checks referenced detail documents', () => {
  const root = fixture()
  const directory = join(root, 'packages/demo/plugin/locale')
  const meta = { title: 'Name {name}', detail: 'docs/DETAIL.md' }
  for (const language of SHIPPED_LOCALE_IDS) writeFileSync(join(directory, `${language}.json`), JSON.stringify({ meta }))
  expect(localeMetadataProblems(root).join('\n')).toContain('missing detail resource')
  mkdirSync(join(directory, '../docs'))
  writeFileSync(join(directory, '../docs/DETAIL.md'), '# Detail\n')
  expect(localeMetadataProblems(root)).toEqual([])
})

it('does not mistake package.json in the locale service package for a translation', () => {
  const root = fixture()
  const directory = join(root, 'packages/client/locale')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'package.json'), '{"name":"locale"}')
  mkdirSync(join(directory, 'src'))
  writeFileSync(join(directory, 'src/index.ts'), 'export {}')
  expect(localeMetadataProblems(root)).toEqual([])
})

it('rejects an empty discovery', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-locale-empty-'))
  roots.push(root)
  expect(localeMetadataProblems(root)).toEqual(['no package locale metadata found'])
})

it('rejects loadable plugins without any locale directory', () => {
  const root = fixture()
  const directory = join(root, 'packages/demo/new-plugin')
  mkdirSync(join(directory, 'src'), { recursive: true })
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-new-plugin' }))
  writeFileSync(join(directory, 'src/index.ts'), 'export function apply() {}')
  expect(localeMetadataProblems(root).join('\n')).toContain('new-plugin/locale')
})

it('checks nested subpath locale resources and package-relative detail files', () => {
  const root = fixture()
  const directory = join(root, 'packages/demo/plugin/locale/tools')
  mkdirSync(directory)
  writeFileSync(join(directory, 'en.json'), JSON.stringify({ meta: { title: 'Tools', detail: 'docs/TOOLS.md' } }))
  mkdirSync(join(root, 'packages/demo/plugin/docs'))
  writeFileSync(join(root, 'packages/demo/plugin/docs/TOOLS.md'), '# Tools\n')
  expect(localeMetadataProblems(root).join('\n')).toContain('locale/tools')
  expect(localeMetadataProblems(root).join('\n')).toContain('es.json')
  for (const language of ['es', 'el', 'fr']) writeFileSync(join(directory, `${language}.json`), JSON.stringify({ meta: { title: 'Tools', detail: 'docs/TOOLS.md' } }))
  expect(localeMetadataProblems(root)).toEqual([])
})

it.each(['../../other/README.md', 'docs\\DETAIL.md', 'docs/DETAIL.txt', '/README.md'])('rejects runtime-invalid detail path %s', (detail) => {
  const root = fixture({ meta: { title: 'Nombre {name}', description: 'Descripcion.', detail } })
  expect(localeMetadataProblems(root).join('\n')).toMatch(/must (?:be a relative path|name a Markdown file)/u)
})

it('requires sentence punctuation for English descriptions', () => {
  const root = fixture()
  const file = join(root, 'packages/demo/plugin/locale/en.json')
  writeFileSync(file, JSON.stringify({ meta: { title: 'Name {name}', description: 'Description' } }))
  expect(localeMetadataProblems(root).join('\n')).toContain('sentence punctuation')
  writeFileSync(file, JSON.stringify({ meta: { title: 'Name {name}', description: 'English description.' } }))
  expect(localeMetadataProblems(root)).toEqual([])
})

it('excludes packages formally classified as test helpers', () => {
  const root = fixture()
  const directory = join(root, 'packages/test-support/llm-replay')
  mkdirSync(join(directory, 'src'), { recursive: true })
  writeFileSync(join(directory, 'src/index.ts'), 'export function apply() {}')
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-llm-replay' }))
  expect(localeMetadataProblems(root)).toEqual([])
})

it.each(['es', 'el', 'fr'])('rejects missing %s metadata', (language) => {
  const root = fixture()
  rmSync(join(root, `packages/demo/plugin/locale/${language}.json`))
  expect(localeMetadataProblems(root).join('\n')).toContain(`${language}.json`)
})

it.each(['es', 'el', 'fr'])('rejects copied English descriptions in %s metadata', (language) => {
  const root = fixture()
  writeFileSync(join(root, 'packages/demo/plugin/locale/en.json'), JSON.stringify({ meta: { title: 'Name {name}', description: 'English description.' } }))
  writeFileSync(join(root, `packages/demo/plugin/locale/${language}.json`), JSON.stringify({ meta: { title: 'Name {name}', description: 'English description.' } }))
  expect(localeMetadataProblems(root).join('\n')).toContain(`${language}.json: meta.description contains untranslated source text`)
})

it.each(['\u200b', '\ufeff', String.raw`\u200b`, String.raw`\ufeff`])('rejects invisible characters in JSON resources', (character) => {
  const root = fixture()
  const file = join(root, 'packages/demo/plugin/locale/es.json')
  writeFileSync(file, readFileSync(file, 'utf8').replace('Descripcion localizada.', `Descripcion${character} localizada.`))
  expect(localeMetadataProblems(root).join('\n')).toContain('invisible locale character')
})
