/**
 * Parser for `git worktree list --porcelain -z`. Adapted from Orca's
 * `git-worktree-porcelain-parser.ts` (MIT, see `LICENSES/Orca-MIT.txt`); only
 * the NUL-delimited form is read, which needs no C-quote decoding.
 * @module @deepseek-ai/dsh-worktree/porcelain
 */

/** One entry of `git worktree list`. */
export interface GitWorktreeInfo {
  /** Absolute checkout path as git spells it. */
  path: string
  /** Commit the checkout is at. */
  head: string
  /** Full ref of the checked-out branch, empty when detached. */
  branch: string
  /** The entry is a bare repository. */
  isBare: boolean
  /** Git lists the primary checkout first. */
  isMainWorktree: boolean
  /** The worktree is locked; `git worktree remove` refuses it without a double force. */
  locked: boolean
  /** The recorded lock reason, empty when none was given. */
  lockReason: string
  /** The checkout directory is gone and git would prune the registration. */
  prunable: boolean
}

/**
 * Parse the NUL-delimited porcelain output of `git worktree list`.
 * @param output - stdout of `git worktree list --porcelain -z`.
 * @returns the entries in git's order, the primary checkout first.
 */
export function parseWorktreeList(output: string): GitWorktreeInfo[] {
  const worktrees: GitWorktreeInfo[] = []
  let block: string[] = []
  const flush = (): void => {
    if (block.length === 0) return
    const info = parseBlock(block, worktrees.length === 0)
    block = []
    if (info !== undefined) worktrees.push(info)
  }
  for (const field of output.split('\0')) {
    if (field) block.push(field)
    else flush()
  }
  flush()
  return worktrees
}

/** Read one entry's fields; an entry without a `worktree` line is dropped. */
function parseBlock(lines: readonly string[], isMainWorktree: boolean): GitWorktreeInfo | undefined {
  let path = ''
  let head = ''
  let branch = ''
  let isBare = false
  let locked = false
  let lockReason = ''
  let prunable = false
  for (const line of lines) {
    if (line.startsWith('worktree ')) path = line.slice('worktree '.length)
    else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length)
    else if (line.startsWith('branch ')) branch = line.slice('branch '.length)
    else if (line === 'bare') isBare = true
    else if (line === 'locked' || line.startsWith('locked ')) {
      locked = true
      lockReason = line.slice('locked'.length).trim()
    } else if (line === 'prunable' || line.startsWith('prunable ')) {
      // Git 2.36 and later flag registrations whose directory is gone; ignoring the flag would show a stale worktree as live.
      prunable = true
    }
  }
  return path === '' ? undefined : { path, head, branch, isBare, isMainWorktree, locked, lockReason, prunable }
}
