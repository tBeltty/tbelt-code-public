/**
 * Low-level git plumbing invocation for pre-edit checkpoint snapshots.
 * Every command runs directly through `node:child_process`, never `ctx.shell`
 * (see the package README for why) — this is an internal, non-model-visible
 * mechanism, so it must not depend on the model-facing bash execution seam's
 * composition (sandbox providers, output caps, terminal-friendly env
 * overrides) and needs raw `Buffer` stdin/stdout, which `ctx.shell`'s
 * string-only `stdin` cannot carry losslessly for arbitrary file content.
 * @module @deepseek-ai/dsh-git-safety-net/git-plumbing
 */

import { spawn } from 'node:child_process'

/** Identity git commits use for checkpoint commits, independent of the user's own git config. */
const CHECKPOINT_IDENTITY = {
  GIT_AUTHOR_NAME: 'tBelt Code Git Safety Net',
  GIT_AUTHOR_EMAIL: 'git-safety-net@tbelt-code.local',
  GIT_COMMITTER_NAME: 'tBelt Code Git Safety Net',
  GIT_COMMITTER_EMAIL: 'git-safety-net@tbelt-code.local',
} as const

/** The dedicated ref every checkpoint commit is chained onto; never `HEAD`. */
export const CHECKPOINT_REF = 'refs/tbelt-code/checkpoints'

/** Raised when a `git` invocation exits nonzero; carries the parsed stderr for diagnostics. */
export class GitPlumbingError extends Error {
  constructor(args: readonly string[], exitCode: number | null, stderr: string) {
    super(`git ${args.join(' ')} exited ${String(exitCode)}: ${stderr.trim()}`)
    this.name = 'GitPlumbingError'
  }
}

/**
 * Run one `git` invocation and collect its stdout, optionally feeding `input` to stdin first.
 * @param args - argv passed to `git` directly (no shell involved, so no quoting concerns).
 * @param options - working directory, optional stdin bytes, optional environment overrides
 *   (merged over `process.env`, e.g. `GIT_INDEX_FILE` to redirect index reads/writes away from
 *   the repository's real index), and `trimTrailingNewline` (default `true`) to control the
 *   single-trailing-newline trim below. Every plumbing command that reports a SHA, ref, or
 *   status line ends its own output in exactly one `\n`, so trimming it is correct there; a
 *   command that reads exact file content back (`git show <sha>:<path>`) must pass `false`, or a
 *   real file ending in `\n\n` or in no trailing newline at all would be corrupted on restore.
 * @returns stdout, decoded as UTF-8, with a single trailing newline trimmed unless
 *   `trimTrailingNewline` is `false`.
 * @throws {GitPlumbingError} when `git` exits nonzero.
 * @throws when the `git` binary cannot be spawned at all (e.g. not installed).
 */
export function runGit(
  args: readonly string[],
  options: { cwd: string; input?: Buffer | string; env?: NodeJS.ProcessEnv; trimTrailingNewline?: boolean },
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('git', args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))
    child.once('error', reject)
    child.once('close', (exitCode) => {
      if (exitCode !== 0) {
        reject(new GitPlumbingError(args, exitCode, Buffer.concat(stderrChunks).toString('utf8')))
        return
      }
      const decoded = Buffer.concat(stdoutChunks).toString('utf8')
      resolvePromise(options.trimTrailingNewline === false ? decoded : decoded.replace(/\n$/, ''))
    })
    if (options.input === undefined) {
      child.stdin.end()
    } else {
      child.stdin.end(options.input)
    }
  })
}

/**
 * Test whether `path`'s containing directory is inside a git working tree, without throwing for
 * the common negative case.
 * @param cwd - directory to resolve the repository from (normally the edited file's own directory).
 * @returns the repository's top-level absolute path, or `undefined` when `cwd` is not inside a
 *   git working tree (including when the `git` binary itself is unavailable).
 */
export async function findRepoRoot(cwd: string): Promise<string | undefined> {
  try {
    const output = await runGit(['rev-parse', '--is-inside-work-tree', '--show-toplevel'], { cwd })
    const [isInsideWorkTree, toplevel] = output.split('\n')
    return isInsideWorkTree === 'true' && toplevel !== undefined ? toplevel : undefined
  } catch {
    return undefined
  }
}

/**
 * Resolve the repository's current `HEAD` commit, for use as a checkpoint's parent when no
 * checkpoint has been recorded yet this session.
 * @param repoRoot - the repository's top-level absolute path.
 * @returns the commit SHA `HEAD` points to, or `undefined` on an unborn branch (no commits yet).
 */
export async function currentHead(repoRoot: string): Promise<string | undefined> {
  try {
    return await runGit(['rev-parse', '--verify', 'HEAD'], { cwd: repoRoot })
  } catch {
    return undefined
  }
}

/**
 * Write `content` into the object database as a loose blob, without touching any index.
 * @param repoRoot - the repository's top-level absolute path.
 * @param content - the exact bytes to store (the file's pre-edit content).
 * @returns the written blob's SHA.
 */
export function writeBlob(repoRoot: string, content: string): Promise<string> {
  return runGit(['hash-object', '-w', '--stdin'], { cwd: repoRoot, input: content })
}

/**
 * Build a tree object identical to `parent`'s tree except `relPath` is replaced by `blobSha`,
 * using a scratch index file so the repository's real index (`.git/index`) is never opened.
 * @param repoRoot - the repository's top-level absolute path.
 * @param parent - the commit whose tree is the starting point, or `undefined` to start from an
 *   empty tree (unborn branch / first commit in the repository).
 * @param relPath - the file's path relative to `repoRoot`, using `/` separators.
 * @param blobSha - the blob to place at `relPath`.
 * @param scratchIndexPath - an absolute path to a file that does not collide with the real index;
 *   the caller owns creating a unique path and removing it afterward.
 * @returns the resulting tree's SHA.
 */
export async function buildCheckpointTree(
  repoRoot: string,
  parent: string | undefined,
  relPath: string,
  blobSha: string,
  scratchIndexPath: string,
): Promise<string> {
  const env = { GIT_INDEX_FILE: scratchIndexPath }
  if (parent !== undefined) {
    await runGit(['read-tree', parent], { cwd: repoRoot, env })
  }
  await runGit(['update-index', '--add', '--cacheinfo', `100644,${blobSha},${relPath}`], { cwd: repoRoot, env })
  return runGit(['write-tree'], { cwd: repoRoot, env })
}

/**
 * Create a checkpoint commit object (not reachable from any branch until {@link updateCheckpointRef}
 * points a ref at it) with a fixed, user-independent identity.
 * @param repoRoot - the repository's top-level absolute path.
 * @param treeSha - the tree this commit records.
 * @param parent - the commit's parent, or `undefined` for a root commit (unborn branch).
 * @param message - the commit message.
 * @returns the new commit's SHA.
 */
export function commitCheckpointTree(
  repoRoot: string,
  treeSha: string,
  parent: string | undefined,
  message: string,
): Promise<string> {
  const args = ['commit-tree', treeSha, ...parent === undefined ? [] : ['-p', parent], '-m', message]
  return runGit(args, { cwd: repoRoot, env: CHECKPOINT_IDENTITY })
}

/**
 * Point {@link CHECKPOINT_REF} at `commitSha`. Never touches `HEAD` or any other ref.
 * @param repoRoot - the repository's top-level absolute path.
 * @param commitSha - the checkpoint commit to record.
 */
export async function updateCheckpointRef(repoRoot: string, commitSha: string): Promise<void> {
  await runGit(['update-ref', CHECKPOINT_REF, commitSha], { cwd: repoRoot })
}

/**
 * Resolve {@link CHECKPOINT_REF} to the checkpoint commit it currently points at.
 * @param repoRoot - the repository's top-level absolute path.
 * @returns the ref's commit SHA, or `undefined` when no checkpoint has been recorded yet.
 */
export async function resolveCheckpointRef(repoRoot: string): Promise<string | undefined> {
  try {
    return await runGit(['rev-parse', '--verify', CHECKPOINT_REF], { cwd: repoRoot })
  } catch {
    return undefined
  }
}

/** One checkpoint commit's parent and embedded turn/path trailers, as read back off the chain. */
export interface CheckpointCommitInfo {
  /** The commit's single parent, or `undefined` for a root commit (unborn branch). */
  readonly parent: string | undefined
  /**
   * The turn number recorded in the commit's `Checkpoint-Turn:` trailer, or `undefined` when
   * the commit carries no such trailer — either a pre-checkpointing `HEAD` the chain walked
   * past, or a checkpoint recorded with no resolvable agent turn.
   */
  readonly turn: number | undefined
  /**
   * The path recorded in the commit's `Checkpoint-Path:` trailer, or `undefined` when the
   * commit carries no such trailer. Read from a trailer rather than diffed against the
   * commit's tree: a checkpoint's tree is often IDENTICAL to its parent's (a file's first
   * checkpoint in a session records the same content already at `HEAD`), so a tree diff finds
   * no changed path exactly in that common case.
   */
  readonly path: string | undefined
}

/** Matches the `Checkpoint-Turn: <n>` trailer line {@link commitCheckpointTree}'s caller embeds in the commit body. */
const CHECKPOINT_TURN_TRAILER = /^Checkpoint-Turn: (\d+)$/mu
/** Matches the `Checkpoint-Path: <path>` trailer line {@link commitCheckpointTree}'s caller embeds in the commit body. */
const CHECKPOINT_PATH_TRAILER = /^Checkpoint-Path: (.+)$/mu

/**
 * Read one checkpoint commit's parent, embedded turn number, and embedded path in a single
 * `git log` call.
 * @param repoRoot - the repository's top-level absolute path.
 * @param sha - the checkpoint commit to read.
 * @returns the commit's parent, turn, and path; a commit with no `Checkpoint-Turn:`/
 *   `Checkpoint-Path:` trailers (not one of this package's checkpoints) reports both as `undefined`.
 */
export async function readCheckpointCommit(repoRoot: string, sha: string): Promise<CheckpointCommitInfo> {
  // `%x1f` (unit separator) cannot appear in a subject/body line, so it safely delimits the
  // parent field from the full message body in one line-oriented parse.
  const output = await runGit(['log', '-1', '--format=%P%x1f%B', sha], { cwd: repoRoot })
  const separator = output.indexOf('\x1f')
  const parentField = output.slice(0, separator).trim()
  const body = output.slice(separator + 1)
  const turnMatch = CHECKPOINT_TURN_TRAILER.exec(body)
  const pathMatch = CHECKPOINT_PATH_TRAILER.exec(body)
  return {
    parent: parentField === '' ? undefined : parentField.split(' ')[0],
    turn: turnMatch === null ? undefined : Number(turnMatch[1]),
    path: pathMatch?.[1],
  }
}

/**
 * Read one checkpoint's exact recorded content at `relPath`, byte-for-byte (no trailing-newline
 * trim — see {@link runGit}'s `trimTrailingNewline`), for restoring a file back to that state.
 * @param repoRoot - the repository's top-level absolute path.
 * @param sha - the checkpoint commit to read the blob from.
 * @param relPath - the file's path relative to `repoRoot`, `/`-separated.
 * @returns the exact content the checkpoint recorded for `relPath`.
 */
export function readCheckpointedContent(repoRoot: string, sha: string, relPath: string): Promise<string> {
  return runGit(['show', `${sha}:${relPath}`], { cwd: repoRoot, trimTrailingNewline: false })
}
