/**
 * Real-subprocess tests for the `.gitignore`-aware walker: the REAL local
 * subprocess service plus the PACKAGED ripgrep binary, exercised against an
 * actual temp directory on disk. No mocking of `rg` or the subprocess seam.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { RepoWalkError, walkRepoFiles } from '../src/walk.ts'

let dir: string
let ctx: Context

describe('walkRepoFiles', () => {
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-repo-map-walk-'))
    // Ripgrep only honors .gitignore by default ("require-git") when the
    // walked tree contains a .git directory; a plain temp directory with no
    // .git needs --no-require-git to get the same behavior. Every repo-map
    // caller walks an actual working tree, so a bare .git marker (no real
    // git state needed) reproduces that condition faithfully.
    await mkdir(join(dir, '.git'), { recursive: true })
    ctx = new Context()
    await ctx.plugin(LocalSubprocessRuntime)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('discovers tracked files and never returns anything from a gitignored subpath', async () => {
    await writeFile(join(dir, '.gitignore'), 'ignored/\n')
    await mkdir(join(dir, 'ignored'), { recursive: true })
    await mkdir(join(dir, 'src'), { recursive: true })
    await writeFile(join(dir, 'ignored', 'secret.ts'), 'export const secret = 1\n')
    await writeFile(join(dir, 'src', 'kept.ts'), 'export const kept = 1\n')
    await writeFile(join(dir, 'top-level.ts'), 'export const top = 1\n')

    const results = await walkRepoFiles(ctx, dir)

    expect(results).toContain(join(dir, 'src', 'kept.ts'))
    expect(results).toContain(join(dir, 'top-level.ts'))
    expect(results.some(path => path.includes(join('ignored', 'secret.ts')))).toBe(false)
    expect(results.some(path => path.includes('secret'))).toBe(false)
  })

  it('respects a nested .gitignore scoped to its own subdirectory', async () => {
    await mkdir(join(dir, 'pkg-a'), { recursive: true })
    await mkdir(join(dir, 'pkg-b'), { recursive: true })
    await writeFile(join(dir, 'pkg-a', '.gitignore'), 'dist/\n')
    await mkdir(join(dir, 'pkg-a', 'dist'), { recursive: true })
    await writeFile(join(dir, 'pkg-a', 'dist', 'built.ts'), 'export const built = 1\n')
    await writeFile(join(dir, 'pkg-a', 'source.ts'), 'export const source = 1\n')
    await writeFile(join(dir, 'pkg-b', 'other.ts'), 'export const other = 1\n')

    const results = await walkRepoFiles(ctx, dir)

    expect(results).toContain(join(dir, 'pkg-a', 'source.ts'))
    expect(results).toContain(join(dir, 'pkg-b', 'other.ts'))
    expect(results).not.toContain(join(dir, 'pkg-a', 'dist', 'built.ts'))
  })

  it('returns an empty list for a directory with zero discoverable files', async () => {
    await writeFile(join(dir, '.gitignore'), '*\n')
    await writeFile(join(dir, 'only-ignored.ts'), 'export const x = 1\n')

    expect(await walkRepoFiles(ctx, dir)).toEqual([])
  })

  it('rejects when already aborted before the spawn', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(walkRepoFiles(ctx, dir, { signal: controller.signal })).rejects.toThrow(RepoWalkError)
  })

  it('classifies a raw-output overflow distinctly from a plain failure', async () => {
    await writeFile(join(dir, 'a.ts'), 'export const a = 1\n')
    await writeFile(join(dir, 'b.ts'), 'export const b = 1\n')
    await expect(walkRepoFiles(ctx, dir, { rawOutputMaxBytes: 1 })).rejects.toMatchObject({ code: 'WALK_RAW_OUTPUT_OVERFLOW' })
  })

  it('fails with WALK_FAILED for a nonexistent root directory', async () => {
    await expect(walkRepoFiles(ctx, join(dir, 'does-not-exist'))).rejects.toMatchObject({ code: 'WALK_FAILED' })
  })
})
