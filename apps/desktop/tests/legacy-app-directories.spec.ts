import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { legacyAppDirectoryMoves, relocateLegacyAppDirectories } from '../src/legacy-app-directories.ts'

const roots: string[] = []

function root(): string {
  const directory = mkdtempSync(join(tmpdir(), 'legacy-app-directories-'))
  roots.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('legacy Desktop directories', () => {
  it('lists userData everywhere and the logs directory on macOS', () => {
    const paths = { home: '/Users/a', appData: '/Users/a/Library/Application Support', userData: '/Users/a/Library/Application Support/tBelt Code' }
    expect(legacyAppDirectoryMoves({ ...paths, platform: 'darwin' })).toEqual([
      { from: '/Users/a/Library/Application Support/@deepseek-ai/dsh-desktop', to: paths.userData },
      { from: '/Users/a/Library/Logs/@deepseek-ai/dsh-desktop', to: '/Users/a/Library/Logs/tBelt Code' },
    ])
    expect(legacyAppDirectoryMoves({ ...paths, platform: 'linux' })).toHaveLength(1)
  })

  it('moves a legacy directory with its files and removes the emptied scope directory', () => {
    const base = root()
    const from = join(base, '@deepseek-ai', 'dsh-desktop')
    const to = join(base, 'tBelt Code')
    mkdirSync(from, { recursive: true })
    writeFileSync(join(from, 'keybindings.json'), '{}')

    expect(relocateLegacyAppDirectories([{ from, to }], vi.fn())).toEqual([{ from, to }])
    expect(readFileSync(join(to, 'keybindings.json'), 'utf8')).toBe('{}')
    expect(existsSync(join(base, '@deepseek-ai'))).toBe(false)
  })

  it('keeps the scope directory when another application still uses it', () => {
    const base = root()
    const from = join(base, '@deepseek-ai', 'dsh-desktop')
    mkdirSync(from, { recursive: true })
    mkdirSync(join(base, '@deepseek-ai', 'other'))

    relocateLegacyAppDirectories([{ from, to: join(base, 'tBelt Code') }], vi.fn())
    expect(existsSync(join(base, '@deepseek-ai', 'other'))).toBe(true)
  })

  it('leaves both directories untouched when the current one already exists', () => {
    const base = root()
    const from = join(base, '@deepseek-ai', 'dsh-desktop')
    const to = join(base, 'tBelt Code')
    mkdirSync(from, { recursive: true })
    mkdirSync(to)
    writeFileSync(join(from, 'old'), 'kept')

    expect(relocateLegacyAppDirectories([{ from, to }, { from: join(base, 'missing'), to: join(base, 'new') }, { from: to, to }], vi.fn())).toEqual([])
    expect(readFileSync(join(from, 'old'), 'utf8')).toBe('kept')
  })

  it('reports a failed move and continues with the next one', () => {
    const base = root()
    const blocked = join(base, 'blocked')
    writeFileSync(blocked, 'file')
    const from = join(base, '@deepseek-ai', 'dsh-desktop')
    mkdirSync(from, { recursive: true })
    const second = { from: join(base, 'legacy-logs'), to: join(base, 'logs') }
    mkdirSync(second.from)
    const warn = vi.fn()

    expect(relocateLegacyAppDirectories([{ from, to: join(blocked, 'tBelt Code') }, second], warn)).toEqual([second])
    expect(warn).toHaveBeenCalledOnce()
    expect(existsSync(from)).toBe(true)
  })
})
