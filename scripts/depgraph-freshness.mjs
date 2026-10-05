#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const META_PATH = 'docs/architecture/.dependency-graph-meta.json'

function head() {
  return execSync('git rev-parse --short HEAD').toString().trim()
}

if (!existsSync(META_PATH)) {
  console.error('dependency graph has never been built. Run: pnpm run depgraph:build')
  process.exit(1)
}

const meta = JSON.parse(readFileSync(META_PATH, 'utf8'))
const currentHead = head()

if (meta.builtAtCommit !== currentHead) {
  console.error(
    `dependency graph is stale: built at ${meta.builtAtCommit}, HEAD is ${currentHead}.\n` +
      'Run: pnpm run depgraph:build'
  )
  process.exit(1)
}

console.log(`dependency graph is current (built at ${meta.builtAtCommit}).`)
