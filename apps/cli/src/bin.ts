#!/usr/bin/env node
/**
 * Command-line entry for dsh.
 * @module @deepseek-ai/dsh/bin
 */

/* v8 ignore file -- built-bin acceptance exercises this self-executing dispatch. */

import { runCli } from './run-cli.ts'

export { runCli } from './run-cli.ts'
export type { RunCliOptions } from './run-cli.ts'

if (import.meta.main) {
  await runCli()
}
