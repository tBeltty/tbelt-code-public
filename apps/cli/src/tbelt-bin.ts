#!/usr/bin/env node
/**
 * Command-line entry for `tbelt`: the `dsh terminal` profile under the product's own name.
 * @module @deepseek-ai/dsh/tbelt-bin
 */

/* v8 ignore file -- built-bin acceptance exercises this self-executing dispatch. */

import { runCli } from './run-cli.ts'

await runCli({ defaultProfile: 'terminal' })
