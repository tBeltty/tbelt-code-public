/** One-time relocation of Electron directories that earlier installed builds named after the base project's package. */

import { existsSync, mkdirSync, renameSync, rmdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/** Package name earlier installed builds carried; Electron derived their directory names from it. */
const LEGACY_PACKAGE_NAME = ['@deepseek-ai', 'dsh-desktop'] as const

/** Platform facts and filesystem paths that locate the legacy and current directories. */
export interface LegacyAppDirectoryPaths {
  readonly platform: NodeJS.Platform
  readonly home: string
  /** Electron `appData`, the parent of every application's userData. */
  readonly appData: string
  /** Electron `userData` resolved from the current package name. */
  readonly userData: string
}

/** A directory pair that the relocation moves from the legacy name to the current one. */
export interface LegacyAppDirectoryMove {
  readonly from: string
  readonly to: string
}

/**
 * List the legacy directories and their current destinations: userData on every
 * platform, plus the macOS logs directory, which lives outside userData.
 * @param paths - Electron and OS directory facts.
 * @returns the moves to attempt, in order.
 */
export function legacyAppDirectoryMoves(paths: LegacyAppDirectoryPaths): LegacyAppDirectoryMove[] {
  const moves = [{ from: join(paths.appData, ...LEGACY_PACKAGE_NAME), to: paths.userData }]
  if (paths.platform === 'darwin') {
    const logs = join(paths.home, 'Library', 'Logs')
    moves.push({ from: join(logs, ...LEGACY_PACKAGE_NAME), to: join(logs, basename(paths.userData)) })
  }
  return moves
}

/**
 * Rename each legacy directory to its current name when the current one does not
 * exist yet. Runs before Electron opens userData, so nothing holds the files.
 * It never deletes user files: an existing destination leaves the legacy
 * directory untouched, and only the emptied `@deepseek-ai` parent is removed.
 * @param moves - directory pairs from {@link legacyAppDirectoryMoves}.
 * @param warn - receives a move that failed; startup continues with the current directory.
 * @returns the moves that completed.
 */
export function relocateLegacyAppDirectories(
  moves: readonly LegacyAppDirectoryMove[],
  warn: (message: string, error: unknown) => void,
): LegacyAppDirectoryMove[] {
  const completed: LegacyAppDirectoryMove[] = []
  for (const move of moves) {
    if (move.from === move.to || !existsSync(move.from) || existsSync(move.to)) continue
    try {
      mkdirSync(dirname(move.to), { recursive: true })
      renameSync(move.from, move.to)
      completed.push(move)
    } catch (error) {
      warn(`desktop: could not move '${move.from}' to '${move.to}'`, error)
      continue
    }
    try {
      rmdirSync(dirname(move.from))
    } catch {
      // ENOTEMPTY: another `@deepseek-ai` application still keeps its directory there.
    }
  }
  return completed
}
