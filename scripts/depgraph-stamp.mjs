#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const builtAtCommit = execSync('git rev-parse --short HEAD').toString().trim()

writeFileSync(
  'docs/architecture/.dependency-graph-meta.json',
  JSON.stringify({ builtAtCommit, builtAt: new Date().toISOString() }, null, 2) + '\n'
)
