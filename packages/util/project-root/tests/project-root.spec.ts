import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findProjectRoot } from '../src/index.ts'

describe('findProjectRoot', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  })

  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-project-root-'))
    dirs.push(dir)
    return dir
  }

  it('returns the nearest ancestor containing a marker', async () => {
    const root = await tempDir()
    await mkdir(join(root, '.git'))
    const nested = join(root, 'a', 'b', 'c')
    await mkdir(nested, { recursive: true })
    await expect(findProjectRoot(nested, ['.git'])).resolves.toBe(root)
  })

  it('returns cwd unchanged when no ancestor has a marker', async () => {
    const root = await tempDir()
    const nested = join(root, 'a', 'b')
    await mkdir(nested, { recursive: true })
    await expect(findProjectRoot(nested, ['.git'])).resolves.toBe(nested)
  })

  it('checks markers in the given order within one directory', async () => {
    const root = await tempDir()
    await mkdir(join(root, 'second-marker'))
    await expect(findProjectRoot(root, ['first-marker', 'second-marker'])).resolves.toBe(root)
  })

  it('finds a marker at cwd itself without walking upward', async () => {
    const root = await tempDir()
    await mkdir(join(root, '.git'))
    await expect(findProjectRoot(root, ['.git'])).resolves.toBe(root)
  })
})
