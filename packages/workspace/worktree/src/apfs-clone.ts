/**
 * Copy-on-write cloning of copied worktree paths on macOS APFS. Adapted from
 * Orca's `worktree-apfs-clone.ts` (MIT, see `LICENSES/Orca-MIT.txt`); the
 * child-process calls go through an injected command runner.
 * @module @deepseek-ai/dsh-worktree/apfs-clone
 */

import { chmod, link, mkdir, rm, rmdir, stat } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'

/** Collects one command's stdout and rejects on a nonzero exit. */
export type RunCommand = (argv: readonly string[]) => Promise<{ stdout: string }>

/** Process facts the clone needs; injected so tests do not need macOS. */
export interface ApfsCloneDeps {
  /** Runs `df`, `diskutil`, and `cp`. */
  run: RunCommand
  /** Names the temporary clone of a single file. */
  randomUUID: () => string
  /** The device number of the volume holding a path, the key of the per-creation volume cache. */
  deviceOf: (path: string) => Promise<number>
}

/** Filesystem name and device `df` and `diskutil` report for one path. */
interface DarwinFilesystemInfo {
  device: string
  filesystemName: string
}

/**
 * Per-creation cache keyed by `stat().dev`. Copying N paths would otherwise
 * run `df` and `diskutil` for each even though source and worktree almost
 * always share one volume.
 */
export type DarwinFilesystemCache = Map<number, Promise<DarwinFilesystemInfo>>

/** The clone cannot run here: different volumes or a non-APFS disk. The caller falls back to a real copy. */
export class ApfsCloneUnavailableError extends Error {
  /**
   * @param message - why the clone is unavailable.
   */
  constructor(message: string) {
    super(message)
    this.name = 'ApfsCloneUnavailableError'
  }
}

/** The target appeared after the caller's existence check; the copy leaves it untouched. */
export class LinkedPathTargetExistsError extends Error {
  /**
   * @param target - the path that already exists.
   */
  constructor(target: string) {
    super(`Worktree linked path target already exists: ${target}`)
    this.name = 'LinkedPathTargetExistsError'
  }
}

/** Whether an error is the filesystem's already-exists failure. */
function isAlreadyExistsError(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'EEXIST'
}

/** Resolve a path's device and filesystem name from `df` and `diskutil`. */
async function getDarwinFilesystemInfo(path: string, deps: ApfsCloneDeps): Promise<DarwinFilesystemInfo> {
  const { stdout: dfOutput } = await deps.run(['/bin/df', '-P', path])
  const device = dfOutput.trim().split(/\r?\n/)[1]?.trim().split(/\s+/)[0]
  if (!device) throw new Error(`Could not resolve filesystem device for ${path}`)
  const { stdout: diskutilOutput } = await deps.run(['/usr/sbin/diskutil', 'info', '-plist', device])
  const filesystemNameMatch = /<key>FilesystemName<\/key>\s*<string>([^<]+)<\/string>/u.exec(diskutilOutput)
  return { device, filesystemName: filesystemNameMatch?.[1] ?? '' }
}

/** Probe a path's volume once per distinct device, caching the pending or rejected result. */
async function getCachedDarwinFilesystemInfo(
  path: string,
  deps: ApfsCloneDeps,
  cache: DarwinFilesystemCache,
): Promise<DarwinFilesystemInfo> {
  const deviceId = await deps.deviceOf(path)
  const cached = cache.get(deviceId)
  if (cached) return cached
  const pending = getDarwinFilesystemInfo(path, deps)
  cache.set(deviceId, pending)
  return pending
}

/** Whether source and target directory sit on one APFS volume. */
async function isSameApfsVolume(
  source: string,
  targetDirectory: string,
  deps: ApfsCloneDeps,
  cache: DarwinFilesystemCache,
): Promise<boolean> {
  const [sourceInfo, targetInfo] = await Promise.all([
    getCachedDarwinFilesystemInfo(source, deps, cache),
    getCachedDarwinFilesystemInfo(targetDirectory, deps, cache),
  ])
  return sourceInfo.device === targetInfo.device && sourceInfo.filesystemName === 'APFS' && targetInfo.filesystemName === 'APFS'
}

/**
 * Whether copying `source` into `targetDirectory` would take the clone path.
 * A probe that writes nothing: it reuses the cached `df` and `diskutil`
 * results the clone itself runs, and a failed probe answers false, matching
 * the clone's own fallback to a real copy.
 * @param source - existing file or directory.
 * @param targetDirectory - existing directory the copy lands in.
 * @param deps - command runner.
 * @param filesystemCache - per-creation volume cache.
 * @returns true when the copy would be a copy-on-write clone.
 */
export async function canCloneWithApfs(
  source: string,
  targetDirectory: string,
  deps: ApfsCloneDeps,
  filesystemCache: DarwinFilesystemCache,
): Promise<boolean> {
  try {
    return await isSameApfsVolume(source, targetDirectory, deps, filesystemCache)
  } catch {
    // Any probe failure means the clone is not usable, which is the answer being asked for.
    return false
  }
}

/** Clone one file through a temporary name, then publish it with `link(2)`. */
async function cloneFileWithApfs(source: string, target: string, deps: ApfsCloneDeps): Promise<void> {
  const tempTarget = resolve(dirname(target), `.dsh-apfs-clone-${deps.randomUUID()}`)
  try {
    await deps.run(['/bin/cp', '-c', source, tempTarget])
    try {
      // link(2) publishes without clobbering; rename(2) could overwrite a target that appeared after the existence check.
      await link(tempTarget, target)
    } catch (error) {
      if (isAlreadyExistsError(error)) throw new LinkedPathTargetExistsError(target)
      throw error
    }
  } finally {
    // A failed cleanup must not replace the clone error being propagated.
    await rm(tempTarget, { force: true }).catch(() => undefined)
  }
}

/** Clone one directory into a reserved empty target. */
async function cloneDirectoryWithApfs(source: string, target: string, deps: ApfsCloneDeps): Promise<void> {
  const sourceMode = (await stat(source)).mode & 0o777
  try {
    // Reserve the final path before copying so a directory a user created meanwhile is never replaced.
    await mkdir(target)
  } catch (error) {
    if (isAlreadyExistsError(error)) throw new LinkedPathTargetExistsError(target)
    throw error
  }
  try {
    // `-n` keeps a raced nested file from being overwritten; `source/.` lands the contents at the
    // target even when the source is a symlinked directory.
    await deps.run(['/bin/cp', '-n', '-c', '-R', `${source}${sep}.`, target])
    await chmod(target, sourceMode)
  } catch (error) {
    // Remove only the empty reservation; anything cp wrote stays for review.
    await rmdir(target).catch(() => undefined)
    throw error
  }
}

/**
 * Clone `source` to `target` with APFS `clonefile` through `cp -c`.
 * @param source - existing file or directory.
 * @param target - path to create; its parent directories are created first.
 * @param sourceIsDirectory - whether `source` is a directory.
 * @param deps - command runner.
 * @param filesystemCache - per-creation volume cache.
 * @throws ApfsCloneUnavailableError when source and target are not on one APFS volume.
 * @throws LinkedPathTargetExistsError when something already occupies `target`.
 */
export async function cloneWorktreePathWithApfs(
  source: string,
  target: string,
  sourceIsDirectory: boolean,
  deps: ApfsCloneDeps,
  filesystemCache: DarwinFilesystemCache,
): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  // Preflight the volume so cp's own non-APFS full-copy fallback cannot surprise the caller.
  if (!(await isSameApfsVolume(source, dirname(target), deps, filesystemCache))) {
    throw new ApfsCloneUnavailableError('APFS clone-copy requires source and target on the same APFS volume')
  }
  await (sourceIsDirectory ? cloneDirectoryWithApfs(source, target, deps) : cloneFileWithApfs(source, target, deps))
}
