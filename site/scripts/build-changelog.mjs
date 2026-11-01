// Writes public/changelog.html from the repository CHANGELOG.md.
// Usage: node scripts/build-changelog.mjs [changelog] [output]
import { readFileSync, writeFileSync } from 'node:fs'
import { renderChangelogPage } from '../shared/changelog.js'

const [source = '../CHANGELOG.md', output = 'public/changelog.html'] = process.argv.slice(2)
writeFileSync(output, renderChangelogPage(readFileSync(source, 'utf8')))
