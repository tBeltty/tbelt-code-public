import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url))

it('ships install metadata with the built web application', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<link rel="manifest" href="./manifest.webmanifest" />')

  const manifest: unknown = JSON.parse(await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8'))
  // No `id`: a browser resolves an explicit `id` against the start URL's origin,
  // so only an absent `id`, which defaults to the resolved `start_url`, gives
  // each mount its own identity. `public-mount.e2e.ts` reads the resolved form.
  expect(manifest).toEqual({
    id: '/',
    name: 'tBelt Code',
    short_name: 'tBelt Code',
    start_url: '/',
    scope: '/',
    display: 'fullscreen',
    icons: [{
      src: 'favicon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any',
    }],
  })
})

it('ships the tBelt logo as the favicon', async () => {
  const favicon = await readFile(join(DIST_ROOT, 'favicon.svg'), 'utf8')
  // The logo PNG is embedded, so the icon needs no second request; its cyan
  // and chrome read on light and dark browser chrome alike.
  expect(favicon).toContain('<image')
  expect(favicon).toContain('href="data:image/png;base64,')
  expect(favicon).not.toContain('prefers-color-scheme')
})
