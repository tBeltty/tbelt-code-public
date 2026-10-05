/**
 * Short helper commands (`df`, `diskutil`, `cp`) run through the subprocess capability.
 * @module @deepseek-ai/dsh-worktree/run-command
 */

import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'

/** Bytes of one helper's stdout kept. */
const STDOUT_BYTES = 64 * 1024
/** Bytes of one helper's stderr kept for its failure message. */
const STDERR_BYTES = 8 * 1024
/** Milliseconds a helper may run. */
const TIMEOUT_MS = 120_000
/** Milliseconds a helper gets to exit after termination starts. */
const GRACE_MS = 2_000

/**
 * Run a helper command to completion.
 * @param subprocess - the process capability.
 * @param argv - program and arguments; never shell-interpreted.
 * @param signal - cancellation, combined with a fixed timeout.
 * @returns the collected stdout.
 * @throws when the command exits nonzero, times out, or is aborted.
 */
export async function runCollected(
  subprocess: SubprocessRuntime, argv: readonly string[], signal: AbortSignal,
): Promise<{ stdout: string }> {
  const handle = subprocess.spawn({
    argv, cwd: '/', graceMs: GRACE_MS, signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    stdio: { stdin: 'ignore', stdout: { maxBytes: STDOUT_BYTES }, stderr: { maxBytes: STDERR_BYTES } },
  })
  const outcome = await handle.done
  /* v8 ignore start -- collect-mode stdio always yields both readers. */
  const stdout = handle.collected.stdout?.readFrom(0).text ?? ''
  const stderr = handle.collected.stderr?.readFrom(0).text ?? ''
  /* v8 ignore stop */
  if (outcome.exitCode !== 0) throw new Error(`${argv.join(' ')} exited ${outcome.exitCode}: ${stderr.trim()}`)
  return { stdout }
}
