import assert from 'node:assert/strict'
import test from 'node:test'
import { parseChangelog, renderChangelogPage } from './changelog.js'

const SAMPLE = `# Changelog

## [Unreleased]

## [1.1.0-rc.1] - 2026-10-30

### Added

- Run \`tbelt\` <fast> from [docs](https://example.com/a).

### Fixed

- A crash.

## [1.0.0] - 2026-10-01

### Added

- First release.

[Unreleased]: https://example.com/compare
[1.1.0-rc.1]: https://example.com/releases/v1.1.0-rc.1
`

test('parses released sections newest first and skips an empty Unreleased', () => {
  const releases = parseChangelog(SAMPLE)
  assert.deepEqual(releases.map((release) => release.version), ['1.1.0-rc.1', '1.0.0'])
  assert.equal(releases[0].url, 'https://example.com/releases/v1.1.0-rc.1')
  assert.equal(releases[1].url, null)
  assert.deepEqual(releases[0].groups.map((group) => group.title), ['Added', 'Fixed'])
})

test('renders code and links, and escapes other markup', () => {
  const html = renderChangelogPage(SAMPLE)
  assert.match(html, /<code>tbelt<\/code> &lt;fast&gt; from <a href="https:\/\/example.com\/a">docs<\/a>/)
  assert.match(html, /<time datetime="2026-10-30">October 30, 2026<\/time>/)
  assert.match(html, /<link rel="canonical" href="https:\/\/code.tbelt.online\/changelog">/)
})

test('parses the repository changelog', async () => {
  const { readFileSync } = await import('node:fs')
  const releases = parseChangelog(readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8'))
  assert.ok(releases.length > 0)
  assert.ok(releases.every((release) => release.groups.every((group) => group.items.length > 0)))
})
