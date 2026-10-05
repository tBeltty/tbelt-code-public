/**
 * Git command execution for worktree operations through the subprocess capability.
 * @module @deepseek-ai/dsh-worktree/git
 */

import { homedir } from 'node:os'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'

/** Milliseconds a git child gets to exit after termination starts. */
const TERMINATE_GRACE_MS = 2_000
/** Retained stderr tail for diagnostics. */
const STDERR_TAIL_BYTES = 16 * 1024

/** Bounds every git command runs under. */
export interface GitLimits {
  /** Milliseconds before a command is terminated. */
  timeoutMs: number
  /** In-memory stdout cap in bytes. */
  outputMaxBytes: number
}

/** Settled facts of one git command; a nonzero exit is a result, not an exception. */
export interface GitResult {
  /** Exit code, or null when the process was killed by a signal. */
  exitCode: number | null
  /** Collected stdout. */
  stdout: string
  /** Retained stderr tail. */
  stderr: string
}

/** A git command that exited nonzero when success was required. */
export class GitCommandError extends Error {
  /**
   * @param args - the git arguments that failed.
   * @param result - the settled command facts.
   */
  constructor(readonly args: readonly string[], readonly result: GitResult) {
    super(`git ${args.join(' ')} failed (exit ${result.exitCode}): ${result.stderr.trim()}`)
    this.name = 'GitCommandError'
  }
}

/** Runs one resolved git executable with a scrubbed environment, a timeout, and bounded output. */
export class Git {
  /**
   * @param subprocess - the process capability git children spawn through.
   * @param executable - the resolved git executable.
   * @param limits - timeout and output bounds applied to every command.
   */
  constructor(
    private readonly subprocess: SubprocessRuntime,
    private readonly executable: string,
    private readonly limits: GitLimits,
  ) {}

  /**
   * Run `git <args>` to completion.
   * @param args - git arguments; never shell-interpreted.
   * @param cwd - working directory of the command.
   * @param signal - cancellation.
   * @returns exit facts and collected output.
   * @throws when the command times out, is aborted, or cannot spawn.
   */
  async run(args: readonly string[], cwd: string, signal: AbortSignal): Promise<GitResult> {
    const timeout = AbortSignal.timeout(this.limits.timeoutMs)
    const combined = AbortSignal.any([signal, timeout])
    const handle = this.subprocess.spawn({
      argv: [this.executable, ...args],
      cwd,
      stdio: { stdin: 'ignore', stdout: { maxBytes: this.limits.outputMaxBytes }, stderr: { maxBytes: STDERR_TAIL_BYTES } },
      graceMs: TERMINATE_GRACE_MS,
      signal: combined,
      // The subprocess credential scrub removes ambient GIT_CONFIG_KEY_n entries.
      env: { GIT_CONFIG_COUNT: '0', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' },
    })
    const outcome = await handle.done
    if (combined.aborted) {
      throw new Error(`git ${args.join(' ')} ${timeout.aborted ? `timed out after ${this.limits.timeoutMs}ms` : 'was aborted'}`)
    }
    /* v8 ignore start -- collect-mode stdio always yields both readers. */
    const stdout = handle.collected.stdout?.readFrom(0).text ?? ''
    const stderr = handle.collected.stderr?.readFrom(0).text ?? ''
    /* v8 ignore stop */
    return { exitCode: outcome.exitCode, stdout, stderr }
  }

  /**
   * Run `git <args>` and require a zero exit.
   * @param args - git arguments.
   * @param cwd - working directory of the command.
   * @param signal - cancellation.
   * @returns the collected stdout.
   * @throws GitCommandError when the command exits nonzero.
   */
  async must(args: readonly string[], cwd: string, signal: AbortSignal): Promise<string> {
    const result = await this.run(args, cwd, signal)
    if (result.exitCode !== 0) throw new GitCommandError(args, result)
    return result.stdout
  }
}

/**
 * Resolve the git executable. On macOS the Xcode stub at `/usr/bin/git` opens
 * an installer dialog instead of running, so it counts as absent until
 * developer tools are selected.
 * @param subprocess - the process capability.
 * @param signal - cancellation.
 * @returns the executable path, or null when git is unavailable.
 */
export async function resolveGit(subprocess: SubprocessRuntime, signal: AbortSignal): Promise<string | null> {
  let executable: string
  try {
    executable = await subprocess.resolveExecutable('git', undefined, signal)
  } catch {
    // resolveExecutable rejects when no git is on the path, which is the "unavailable" answer.
    return null
  }
  if (process.platform !== 'darwin' || executable !== '/usr/bin/git') return executable
  const probe = subprocess.spawn({
    argv: ['/usr/bin/xcode-select', '-p'],
    cwd: homedir(),
    stdio: { stdin: 'ignore', stdout: { maxBytes: 4096 }, stderr: { maxBytes: 4096 } },
    graceMs: 1_000,
    signal,
  })
  const outcome = await probe.done.catch(() => ({ exitCode: null }))
  return outcome.exitCode === 0 ? executable : null
}
