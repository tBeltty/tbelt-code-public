/**
 * Configuration checks and per-repository setting resolution.
 * @module @deepseek-ai/dsh-worktree/settings
 */

import { basename, isAbsolute, resolve } from 'node:path'
import { safeRelativePath } from './safe-path.ts'
import type { Config, WorktreeSettings } from './types.ts'

/** The settings fields every project override may replace. */
const SETTING_FIELDS = ['directory', 'baseRef', 'branchPrefix', 'sharedPaths', 'copyPaths', 'setup'] as const

/** Throw when a settings object holds a value the plugin cannot act on. */
function assertSettings(settings: Partial<WorktreeSettings>, where: string): void {
  if (settings.directory !== undefined && settings.directory.trim() === '') throw new Error(`worktree: ${where}directory must not be empty`)
  if (settings.baseRef !== undefined && settings.baseRef.trim() === '') throw new Error(`worktree: ${where}baseRef must not be empty`)
  for (const field of ['sharedPaths', 'copyPaths'] as const) {
    for (const path of settings[field] ?? []) {
      if (!safeRelativePath(path).safe) throw new Error(`worktree: ${where}${field} entry ${JSON.stringify(path)} must be a repository-relative path without ".."`)
    }
  }
  for (const argv of settings.setup ?? []) {
    if (argv.length === 0 || argv[0] === '') throw new Error(`worktree: ${where}setup commands need a program name`)
  }
}

/**
 * Reject configuration that would fail later or act outside its repository.
 * @param config - the validated schema output.
 * @throws when a path leaves the repository, a command or directory is empty, a project path is
 * relative, or a bound is not a positive integer.
 */
export function assertConfig(config: Config): void {
  assertSettings(config, '')
  for (const [field, value] of [
    ['copyBudget.maxBytes', config.copyBudget.maxBytes], ['copyBudget.maxEntries', config.copyBudget.maxEntries],
    ['timeoutMs', config.timeoutMs], ['outputMaxBytes', config.outputMaxBytes], ['setupTimeoutMs', config.setupTimeoutMs],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`worktree: ${field} must be a positive integer`)
  }
  for (const project of config.projects) {
    if (!isAbsolute(project.path)) throw new Error(`worktree: project path ${JSON.stringify(project.path)} must be absolute`)
    assertSettings(project, `project ${JSON.stringify(project.path)}: `)
  }
}

/**
 * The settings that apply to one repository: the deployment defaults with the
 * matching project's overrides on top. A project whose path matches the
 * primary checkout wins; a later entry beats an earlier one for the same path.
 * @param config - the validated configuration.
 * @param primaryPath - the primary checkout, as git spells it.
 * @param samePath - whether two paths name one location.
 * @returns the resolved settings.
 */
export async function resolveSettings(
  config: Config,
  primaryPath: string,
  samePath: (left: string, right: string) => Promise<boolean>,
): Promise<WorktreeSettings> {
  const resolved: WorktreeSettings = {
    directory: config.directory, baseRef: config.baseRef, branchPrefix: config.branchPrefix,
    sharedPaths: config.sharedPaths, copyPaths: config.copyPaths, setup: config.setup,
  }
  for (const project of config.projects) {
    if (!(await samePath(project.path, primaryPath))) continue
    for (const field of SETTING_FIELDS) {
      if (project[field] !== undefined) Object.assign(resolved, { [field]: project[field] })
    }
  }
  return resolved
}

/**
 * Resolve the directory that holds a repository's worktrees.
 * @param directory - the configured value.
 * @param primaryPath - the primary checkout.
 * @returns an absolute path with `{repo}` replaced by the primary checkout's directory name.
 */
export function worktreeDirectory(directory: string, primaryPath: string): string {
  return resolve(primaryPath, directory.replaceAll('{repo}', basename(primaryPath)))
}
