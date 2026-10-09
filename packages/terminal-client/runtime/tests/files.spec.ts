import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { nodeFiles } from '../src/files.ts'

const PNG = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3])
let dir = ''

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dsh-terminal-files-'))
  await writeFile(join(dir, 'shot.png'), PNG)
  await writeFile(join(dir, 'notes.txt'), 'hello')
  await mkdir(join(dir, 'sub'))
})

afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

describe('nodeFiles', () => {
  const files = nodeFiles(64)

  it('reads an image by its bytes and names it without the directory', async () => {
    await expect(files.readImage(join(dir, 'shot.png'))).resolves.toEqual({
      mediaType: 'image/png', base64: Buffer.from(PNG).toString('base64'), name: 'shot.png', bytes: PNG.length,
    })
  })

  it('refuses a directory, a file that is not an image, an image over the limit and a missing file', async () => {
    await expect(files.readImage(join(dir, 'sub'))).rejects.toThrow('it is not a file')
    await expect(files.readImage(join(dir, 'notes.txt'))).rejects.toThrow('only PNG, JPEG, WebP and GIF')
    await writeFile(join(dir, 'big.png'), Buffer.concat([Buffer.from(PNG), Buffer.alloc(200)]))
    await expect(nodeFiles(100).readImage(join(dir, 'big.png'))).rejects.toThrow('larger than 0 MB')
    await expect(files.readImage(join(dir, 'gone.png'))).rejects.toThrow('ENOENT')
  })

  it('tells directories from everything else, and lets other failures through', async () => {
    await expect(files.isDirectory(dir)).resolves.toBe(true)
    await expect(files.isDirectory(join(dir, 'notes.txt'))).resolves.toBe(false)
    await expect(files.isDirectory(join(dir, 'notes.txt', 'inside'))).resolves.toBe(false)
    await expect(files.isDirectory(join(dir, 'missing'))).resolves.toBe(false)
    await symlink('loop', join(dir, 'loop'))
    await expect(files.isDirectory(join(dir, 'loop'))).rejects.toThrow('ELOOP')
  })
})
