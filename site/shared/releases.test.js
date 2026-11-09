import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseChannelMetadata } from './releases.js'

test('reads folded URLs from current feeds', () => {
  const text = [
    'version: 0.2.0-rc.2',
    'files:',
    '  - url: >-',
    '      https://bucket.tbelt.online/dsh-desk/bin/mac-arm64/tbelt-code-0.2.0-rc.2-mac-arm64.zip',
    '    sha512: >-',
    '      abc==',
    '    size: 1',
    "releaseDate: '2026-10-01T23:01:53.000Z'",
    '',
  ].join('\n')
  assert.deepEqual(parseChannelMetadata(text), {
    version: '0.2.0-rc.2',
    url: 'https://bucket.tbelt.online/dsh-desk/bin/mac-arm64/tbelt-code-0.2.0-rc.2-mac-arm64.zip',
    releaseDate: '2026-10-01T23:01:53.000Z',
  })
})

test('reads plain URLs from older feeds', () => {
  const text = 'version: 0.2.0-rc.2\nfiles:\n  - url: tbelt-code-0.2.0-rc.2-win-x64.exe\n    size: 1\npath: x\nreleaseDate: "2026-10-01T20:11:16.150Z"\n'
  assert.deepEqual(parseChannelMetadata(text), {
    version: '0.2.0-rc.2',
    url: 'tbelt-code-0.2.0-rc.2-win-x64.exe',
    releaseDate: '2026-10-01T20:11:16.150Z',
  })
})

test('rejects files without a version or URL', () => {
  assert.equal(parseChannelMetadata('files: []\n'), null)
  assert.equal(parseChannelMetadata('version: 1.0.0\nfiles:\n  - url: >-\n'), null)
})
