/**
 * Run `stage-dsh-docs.ts` for the `dsh` package `prepack` and `postpack` hooks.
 *
 * The public source mirror excludes the staging script together with `docs/`
 * and `website/`, so a pack there has no documentation to stage and succeeds
 * without a `docs` directory. Arguments pass through to the staging script.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const stagingScript = fileURLToPath(new URL('./stage-dsh-docs.ts', import.meta.url))

if (existsSync(stagingScript)) {
  const { status } = spawnSync(process.execPath, ['--import', 'tsx/esm', stagingScript, ...process.argv.slice(2)], { stdio: 'inherit' })
  process.exit(status ?? 1)
}
