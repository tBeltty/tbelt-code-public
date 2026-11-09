/**
 * Directory input: turns a typed or pasted path into the absolute path of a
 * session's working directory or of an attached file. The terminal has no
 * folder browser; the person types the path or drops it onto the terminal.
 * @module @deepseek-ai/dsh-terminal-views/directory-input
 */
import { isAbsolute, join, resolve } from 'node:path'

/** Facts a relative path resolves against. */
export interface TypedPathFacts {
  /** Directory a relative path starts from: the working directory of the open session. */
  readonly base: string
  /** Account home directory, which `~` stands for. */
  readonly home?: string | undefined
}

/**
 * Clean a path as a terminal delivers it: dropped files arrive quoted or with
 * backslash-escaped spaces.
 * @param raw - text typed after a command or pasted.
 * @returns the path without surrounding whitespace, matching quotes or `\ ` escapes.
 */
export function pastedPath(raw: string): string {
  const trimmed = raw.trim()
  const quoted = /^(["'])(.*)\1$/su.exec(trimmed)
  return (quoted === null ? trimmed : (quoted[2] as string)).replace(/\\ /gu, ' ')
}

/**
 * Resolve typed input to an absolute path.
 * @param raw - the typed path; empty means the base directory.
 * @param facts - the base directory and the home directory.
 * @returns an absolute path with `~` expanded. Whether it exists, and whether it is a directory or a file, is the caller's check.
 */
export function resolveTypedPath(raw: string, facts: TypedPathFacts): string {
  const path = pastedPath(raw)
  if (path === '') return facts.base
  const { home } = facts
  if (home !== undefined && path === '~') return home
  if (home !== undefined && (path.startsWith('~/') || path.startsWith('~\\'))) return resolve(join(home, path.slice(2)))
  return isAbsolute(path) ? resolve(path) : resolve(facts.base, path)
}
