/**
 * `.gitignore`-aware repository file discovery: spawns the PACKAGED ripgrep
 * binary (`@vscode/ripgrep`) through `ctx.subprocess` with `rg --files` and
 * NO `--no-ignore`/`--hidden` overrides, so ripgrep's own default ignore
 * behavior (`.gitignore`, `.git/info/exclude`, global excludes, VCS
 * directories) applies unmodified. This mirrors the spawn discipline of
 * `@deepseek-ai/dsh-tool-fs-search`'s `search-core.ts` (packaged-binary
 * resolution, `--no-config`, bounded collected stdout, exit-code
 * classification) without importing that package: this package registers no
 * Cordis plugin and has no `dsh-tools`/`dsh-llm` dependency to reuse its
 * `ToolExecution`-shaped helpers.
 * @module @deepseek-ai/dsh-repo-map/walk
 */

import { existsSync } from 'node:fs'
import { join, parse } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'

/** Default cap on the complete raw `rg` stdout this walker will parse. */
export const WALK_RAW_OUTPUT_MAX_BYTES = 20_000_000

/** Default cap in bytes on the retained stderr diagnostic tail of one walk. */
export const WALK_STDERR_MAX_BYTES = 64 * 1024

/** Default terminate grace period for the walk's `rg` process (ms). */
export const WALK_GRACE_MS = 3_000

/** Stable, machine-routable codes for walk failures. */
export type RepoWalkErrorCode = 'WALK_FAILED' | 'WALK_RAW_OUTPUT_OVERFLOW' | 'WALK_ABORTED'

/** Typed walk failure; never thrown for an individual file's parse/extraction outcome, only for the traversal itself. */
export class RepoWalkError extends Error {
  /** The stable {@link RepoWalkErrorCode} classifying this failure. */
  readonly code: RepoWalkErrorCode

  constructor(message: string, code: RepoWalkErrorCode, options?: ErrorOptions) {
    super(message, options)
    this.code = code
  }
}

/** Options for {@link walkRepoFiles}. */
export interface WalkOptions {
  /** Aborts the underlying `rg` process when triggered. */
  signal?: AbortSignal
  /** Cap on the complete raw `rg` stdout this walk will parse. */
  rawOutputMaxBytes?: number
  /** Terminate-escalation grace period (ms) for the `rg` process. */
  graceMs?: number
  /** Cap on the retained stderr diagnostic tail. */
  stderrMaxBytes?: number
}

/**
 * Wrapped behind a function call so TypeScript's control-flow narrowing does
 * not treat two calls at different points in {@link walkRepoFiles} as
 * provably having the same boolean result — `options.signal` can abort
 * between those points, and a bare repeated `options.signal?.aborted ===
 * true` expression is narrowed as if it could not.
 */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}

let rgPathPromise: Promise<string> | undefined

/**
 * The packaged ripgrep binary path, resolved lazily once per process. Mirrors
 * `dsh-tool-fs-search/search-core.ts`'s `resolveRgPath`: a single-file
 * runtime uses the executable's `-rg` sidecar because a native helper cannot
 * be spawned from pkg's virtual filesystem; Node-mode builds fall back to the
 * platform package `@vscode/ripgrep` selects.
 * @returns the packaged binary's absolute path.
 */
export function resolveRgPath(): Promise<string> {
  rgPathPromise ??= Promise.resolve().then(async () => {
    const executable = parse(process.execPath)
    const executableSidecar = process.platform === 'win32'
      ? join(executable.dir, `${executable.name}-rg.exe`)
      : `${process.execPath}-rg`
    if ('pkg' in process && existsSync(executableSidecar)) return executableSidecar
    const dependency = (await import('@vscode/ripgrep')).rgPath
    return process.versions.electron === undefined
      ? dependency
      : dependency.replace(/\.asar(?=[\\/])/u, '.asar.unpacked')
  })
  return rgPathPromise
}

/**
 * Walk `rootDir` and return every file ripgrep's DEFAULT ignore behavior
 * would surface: `.gitignore`, `.git/info/exclude`, and global excludes are
 * honored; VCS metadata directories are pruned. No `--no-ignore` and no
 * `--hidden` are passed, so hidden files stay excluded unless a `.gitignore`
 * negation un-ignores them — the opposite flag choice from the `glob` tool in
 * `dsh-tool-fs-search`, which deliberately searches ignored/hidden paths.
 *
 * @param ctx - the plugin context; execution uses its `subprocess` service.
 * @param rootDir - the directory to walk; becomes the spawned process's cwd.
 * @param options - abort signal and output/timing caps.
 * @returns absolute paths to every discovered, non-ignored file.
 */
export async function walkRepoFiles(ctx: Context, rootDir: string, options: WalkOptions = {}): Promise<string[]> {
  const rawOutputMaxBytes = options.rawOutputMaxBytes ?? WALK_RAW_OUTPUT_MAX_BYTES
  const graceMs = options.graceMs ?? WALK_GRACE_MS
  const stderrMaxBytes = options.stderrMaxBytes ?? WALK_STDERR_MAX_BYTES
  if (isAborted(options.signal)) {
    throw new RepoWalkError('repo-map walk was aborted before completion', 'WALK_ABORTED')
  }
  let handle: SubprocessHandle
  try {
    handle = ctx.subprocess.spawn({
      argv: [await resolveRgPath(), '--no-config', '--files'],
      cwd: rootDir,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: rawOutputMaxBytes },
        stderr: { maxBytes: stderrMaxBytes },
      },
      graceMs,
      signal: options.signal,
    } satisfies SubprocessSpawnSpec)
  } catch (error: unknown) {
    // Node's spawn() throws synchronously for a NUL in argv, and the local
    // impl can throw synchronously when the signal aborts between the check
    // above and this call (or when the platform-package resolution rejects).
    if (isAborted(options.signal)) {
      throw new RepoWalkError('repo-map walk was aborted before completion', 'WALK_ABORTED')
    }
    throw new RepoWalkError('repo-map walk could not start its rg command', 'WALK_FAILED', { cause: error })
  }
  let outcome: SubprocessOutcome
  try {
    outcome = await handle.done
  } catch (error: unknown) {
    throw new RepoWalkError('repo-map walk subprocess failed before reporting an outcome', 'WALK_FAILED', { cause: error })
  }
  const stdout = handle.collected.stdout?.readFrom(0)
  const stderr = handle.collected.stderr?.readFrom(0)
  if (stdout === undefined || stderr === undefined) {
    throw new RepoWalkError('repo-map walk produced no collected output streams', 'WALK_FAILED')
  }
  // The signal can abort while the spawn is awaited.
  if (isAborted(options.signal)) {
    throw new RepoWalkError('repo-map walk was aborted before completion', 'WALK_ABORTED')
  }
  if (outcome.signal !== null || outcome.exitCode === null) {
    throw new RepoWalkError(`repo-map walk was killed by signal ${outcome.signal ?? '(unknown)'}`, 'WALK_FAILED')
  }
  if (outcome.exitCode !== 0 && outcome.exitCode !== 1) {
    const stderrText = stderr.text.trim()
    throw new RepoWalkError(
      `repo-map walk's rg exited ${outcome.exitCode}${stderrText.length > 0 ? `: ${stderrText}` : ''}`,
      'WALK_FAILED',
    )
  }
  if (stdout.lossy) {
    throw new RepoWalkError(
      `repo-map walk produced more raw output than the ${rawOutputMaxBytes}-byte cap retained`,
      'WALK_RAW_OUTPUT_OVERFLOW',
    )
  }
  if (outcome.exitCode === 1) return []
  return stdout.text
    .split('\n')
    .filter(line => line.length > 0)
    .map(relativePath => join(rootDir, relativePath))
}
