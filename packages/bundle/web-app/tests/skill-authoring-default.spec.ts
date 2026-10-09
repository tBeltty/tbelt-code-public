/** The skill-authoring guide is off in the base composition and on in the web and desktop profiles. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

function patchText(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

it('declares skill-authoring disabled in base and enables it in the web profile', () => {
  expect(patchText('../../base/cordis.patch.yml')).toMatch(
    /- id: skill-authoring\n\s+name: '@deepseek-ai\/dsh-skill-authoring'\n\s+disabled: true\n/,
  )
  expect(patchText('../cordis.patch.yml')).toMatch(/^- id: skill-authoring\n {2}disabled: false\n/m)
})
