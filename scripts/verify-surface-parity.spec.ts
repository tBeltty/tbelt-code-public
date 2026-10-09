/** Regression tests for the surface parity gate's accept and reject paths. */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MANIFEST_PATH, verifySurfaceParity } from './verify-surface-parity.ts'

const roots: string[] = []
const today = '2026-10-08'

/** Repository skeleton whose `packages/client` holds the given `ui-*` packages. */
function fixture(...packages: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh.surface-parity-'))
  roots.push(root)
  mkdirSync(join(root, 'packages/client'), { recursive: true })
  for (const name of packages) mkdirSync(join(root, 'packages/client', name))
  return root
}

/** Run the gate over inline manifest text. */
function run(root: string, manifest: string): string[] {
  return verifySurfaceParity({ root, manifest, today })
}

const entry = (fields: string): string => `- id: chat.prompt\n  gui: ui-chat\n  terminal: terminal/composer\n${fields}`

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('verifySurfaceParity', () => {
  it('accepts a capability with a GUI package and a terminal view', () => {
    expect(run(fixture('ui-chat'), entry(''))).toEqual([])
  })

  it('accepts the committed manifest against the committed client packages', () => {
    const root = resolve(import.meta.dirname, '..')
    expect(verifySurfaceParity({ root, manifest: readFileSync(join(root, MANIFEST_PATH), 'utf8'), today })).toEqual([])
  })

  it('rejects a manifest that is not a list', () => {
    expect(run(fixture(), 'id: x')).toEqual([`${MANIFEST_PATH}: expected a list of capability entries`])
  })

  it('rejects a missing or malformed id and a duplicate id', () => {
    const manifest = '- gui: ui-chat\n  terminal: terminal/a\n- id: Bad\n  gui: ui-chat\n  terminal: terminal/a\n'
    expect(run(fixture('ui-chat'), manifest + entry('') + entry(''))).toEqual([
      '(entry without id): "id" must look like <area>.<capability>',
      'Bad: "id" must look like <area>.<capability>',
      'chat.prompt: duplicate id',
    ])
  })

  it('rejects a GUI package that no longer exists', () => {
    expect(run(fixture(), entry(''))).toEqual(['chat.prompt: GUI package ui-chat does not exist under packages/client'])
  })

  it('accepts a presenter that exists and rejects one that does not or is malformed', () => {
    const root = fixture('ui-chat')
    mkdirSync(join(root, 'packages/presentation/tool-call'), { recursive: true })
    writeFileSync(join(root, 'packages/presentation/tool-call/package.json'), '{}\n')
    expect(run(root, entry('  presenter: presentation/tool-call\n'))).toEqual([])
    expect(run(root, entry('  presenter: presentation/missing\n')))
      .toEqual(['chat.prompt: presenter presentation/missing does not exist under packages/presentation'])
    mkdirSync(join(root, 'packages/presentation/tool-card'), { recursive: true })
    writeFileSync(join(root, 'packages/presentation/tool-card/package.json'), '{}\n')
    expect(run(root, entry('  presenter: presentation/tool-call, presentation/tool-card\n'))).toEqual([])
    expect(run(root, entry('  presenter: presentation/tool-call, presentation/missing\n')))
      .toEqual(['chat.prompt: presenter presentation/missing does not exist under packages/presentation'])
    expect(run(root, entry('  presenter: presentation/tool-call, tool-card\n')))
      .toEqual(['chat.prompt: "presenter" must be presentation/<name>'])
    expect(run(root, entry('  presenter: tool-call\n'))).toEqual(['chat.prompt: "presenter" must be presentation/<name>'])
    expect(run(root, entry('  presenter: 7\n'))).toEqual(['chat.prompt: "presenter" must be presentation/<name>'])
  })

  it('requires an implemented terminal view to have its module', () => {
    const root = fixture('ui-chat')
    expect(run(root, entry('  implemented: true\n')))
      .toEqual(['chat.prompt: terminal/composer is marked implemented but packages/terminal-client/views/src/composer.ts does not exist'])
    mkdirSync(join(root, 'packages/terminal-client/views/src'), { recursive: true })
    writeFileSync(join(root, 'packages/terminal-client/views/src/composer.ts'), 'export {}\n')
    expect(run(root, entry('  implemented: true\n'))).toEqual([])
    expect(run(root, entry(''))).toEqual([])
  })

  it('rejects an implemented flag that is not true or has no view to point at', () => {
    const root = fixture('ui-chat')
    expect(run(root, entry('  implemented: yes\n'))).toEqual(['chat.prompt: "implemented" must be true when present'])
    const exempt = '- id: a.b\n  gui: ui-chat\n  terminal: exempt\n  reason: why\n  expires: 2026-12-01\n  implemented: true\n'
    expect(run(root, exempt)).toEqual(['a.b: only an entry with a terminal/<name> view can be implemented'])
  })

  it('rejects a missing gui field and accepts "none"', () => {
    expect(run(fixture(), '- id: a.b\n  terminal: terminal/x\n')).toEqual(['a.b: "gui" must name ui-* packages or "none"'])
    expect(run(fixture(), '- id: a.b\n  gui: none\n  terminal: terminal/x\n')).toEqual([])
  })

  it('rejects a ui-* package that no entry lists', () => {
    expect(run(fixture('ui-chat', 'ui-new'), entry(''))).toEqual([
      'ui-new: no manifest entry lists this GUI package; add a capability or extend an existing "gui" field',
    ])
  })

  it('splits comma-separated GUI packages', () => {
    const manifest = '- id: a.b\n  gui: ui-one, ui-two\n  terminal: terminal/x\n'
    expect(run(fixture('ui-one', 'ui-two'), manifest)).toEqual([])
  })

  it('rejects a terminal field that is neither a view nor an exception', () => {
    const manifest = '- id: a.b\n  gui: ui-chat\n  terminal: tui/x\n'
    expect(run(fixture('ui-chat'), manifest)).toEqual(['a.b: "terminal" must be terminal/<name>, "exempt" or "pending"'])
    expect(run(fixture('ui-chat'), '- id: a.b\n  gui: ui-chat\n')).toEqual([
      'a.b: "terminal" must be terminal/<name>, "exempt" or "pending"',
    ])
  })

  it('requires a reason for exempt and pending entries', () => {
    const exempt = '- id: a.b\n  gui: ui-chat\n  terminal: exempt\n  expires: 2026-12-01\n'
    expect(run(fixture('ui-chat'), exempt)).toEqual(['a.b: terminal "exempt" needs a reason'])
    expect(run(fixture('ui-chat'), '- id: a.b\n  gui: ui-chat\n  terminal: pending\n')).toEqual([
      'a.b: terminal "pending" needs a reason',
    ])
  })

  it('accepts pending with a reason and no expiry', () => {
    expect(run(fixture('ui-chat'), '- id: a.b\n  gui: ui-chat\n  terminal: pending\n  reason: awaiting decision\n')).toEqual([])
  })

  it('rejects an exemption without an expiry or with an unreadable one', () => {
    const base = '- id: a.b\n  gui: ui-chat\n  terminal: exempt\n  reason: why\n'
    expect(run(fixture('ui-chat'), base)).toEqual(['a.b: exempt needs an "expires" date (YYYY-MM-DD)'])
    expect(run(fixture('ui-chat'), `${base}  expires: soon\n`)).toEqual(['a.b: exempt needs an "expires" date (YYYY-MM-DD)'])
  })

  it('rejects an expired exemption and one that lasts longer than 90 days', () => {
    const base = '- id: a.b\n  gui: ui-chat\n  terminal: exempt\n  reason: why\n'
    expect(run(fixture('ui-chat'), `${base}  expires: 2026-10-07\n`)).toEqual([
      'a.b: exemption expired on 2026-10-07; renew it with a new reason or implement the terminal view',
    ])
    expect(run(fixture('ui-chat'), `${base}  expires: 2027-01-07\n`)).toEqual([
      'a.b: exemption expires in 91 days, more than the 90-day limit',
    ])
    expect(run(fixture('ui-chat'), `${base}  expires: 2027-01-06\n`)).toEqual([])
    expect(run(fixture('ui-chat'), `${base}  expires: 2026-10-08\n`)).toEqual([])
  })
})
