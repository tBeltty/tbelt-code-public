/**
 * Writable git directories of a linked worktree, for the sandbox.
 * @module @deepseek-ai/dsh-worktree/git-dirs
 */

import { readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

/** The common-directory subdirectories `git commit` and branch updates write to; hooks and config are not among them. */
const SHARED_WRITE_DIRECTORIES = ['objects', 'refs', 'logs']

/** Canonical form of an existing path, or undefined when it cannot be resolved. */
function canonical(path: string): string | undefined {
  try {
    return realpathSync.native(path)
  } catch {
    // An unresolvable path cannot be compared, so the caller grants nothing.
    return undefined
  }
}

/** The text of a small git metadata file, or undefined when it is missing or unreadable. */
function readText(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8').trim()
  } catch {
    // A missing metadata file means the checkout is not a registered worktree.
    return undefined
  }
}

/** Whether `path` is an existing directory. */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    // A path that cannot be statted is not granted.
    return false
  }
}

/**
 * The directories a linked worktree needs writable for `git commit`, derived
 * from the checkout alone: its private git directory plus the `objects`,
 * `refs`, and `logs` of the common git directory. A checkout is accepted only
 * when its `.git` file names a private directory of the form
 * `<common>/worktrees/<name>`, that directory's `commondir` resolves to
 * `<common>`, and its `gitdir` file points back at this checkout's `.git`, so
 * a `.git` file the model wrote cannot name a directory it does not own.
 * The common directory's `hooks` and `config` are never included.
 * @param workspaceRoot - the session's working directory.
 * @returns the existing directories to grant, empty for a primary checkout, a plain directory, or any mismatch.
 */
export function linkedWorktreeWritableRoots(workspaceRoot: string): string[] {
  const dotGit = join(workspaceRoot, '.git')
  const pointer = /^gitdir: (.+)$/m.exec(readText(dotGit) ?? '')?.[1]
  if (pointer === undefined) return []
  const privateDir = canonical(resolve(workspaceRoot, pointer))
  if (privateDir === undefined) return []
  const worktreesDir = dirname(privateDir)
  if (worktreesDir.split(/[\\/]/).pop() !== 'worktrees') return []
  const commonDir = dirname(worktreesDir)
  const commonRef = readText(join(privateDir, 'commondir'))
  if (commonRef === undefined || canonical(isAbsolute(commonRef) ? commonRef : resolve(privateDir, commonRef)) !== commonDir) return []
  const backLink = readText(join(privateDir, 'gitdir'))
  if (backLink === undefined || canonical(backLink) !== canonical(dotGit)) return []
  return [privateDir, ...SHARED_WRITE_DIRECTORIES.map(name => join(commonDir, name)).filter(isDirectory)]
}
