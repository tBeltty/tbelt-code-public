/**
 * Pure, unit-testable classifier for shell command strings that should pause
 * for explicit user confirmation before running. No Cordis wiring lives here —
 * `tools/pre-execute` integration is a separate task (P3-T2) so classification
 * correctness can be reviewed and tested in isolation from plumbing.
 *
 * Tokenization and chain-splitting are shell-aware (`./tokenize.ts`, built on
 * `@yarnpkg/parsers`' real POSIX-shell grammar), not whitespace/regex-based.
 *
 * @module @deepseek-ai/dsh-destructive-command-policy
 */

import type { ShellToken } from './tokenize.ts'
import { tokenizeShellLine } from './tokenize.ts'

/** Result of classifying a single command string. */
export interface DestructiveClassification {
  /** `true` when the command should require explicit confirmation before running. */
  destructive: boolean
  /** Human-readable explanation of which pattern matched, present only when `destructive` is `true`. */
  reason?: string
}

/**
 * One named pattern class. `test` receives one command invocation's tokens
 * and returns a match reason, or `undefined` when the pattern does not apply.
 * Patterns are evaluated in order; the first match wins.
 */
interface DestructivePattern {
  /** Short identifier for the pattern class, useful in test names and logs. */
  id: string
  /** Returns a reason string on match, `undefined` otherwise. */
  test: (tokens: ShellToken[]) => string | undefined
}

/**
 * A bare path argument with no further qualification: `/`, `~`, `.`, or a
 * relative/absolute path token that does not look like an option flag. This
 * intentionally matches broadly — per the policy's over-flagging bias, an
 * argument like `./build` still counts as "no further qualification" even
 * though it is nested inside a project directory. Path segments may contain
 * spaces: a shell-quoted argument like `"some dir with spaces"` now arrives
 * as one token with its internal spaces preserved (AST-driven tokenization,
 * not whitespace-splitting), and a space alone does not make a path any less
 * bare.
 */
const BARE_PATH_TOKEN = /^(?:\/|~|\.|\.\.|(?:\.{1,2}\/|\/|~\/)?[\w.\- ]+(?:\/[\w.\- ]+)*\/?)$/

/** True when `token` looks like an `rm`/`chmod`/`chown` flag bundle, e.g. `-rf`, `-r`, `-f`, `--recursive`. */
function isFlagToken(token: ShellToken): boolean {
  return token.text.startsWith('-')
}

/**
 * True when any flag token requests `longName` (`--recursive`) or bundles
 * `shortLetter` into a single-dash cluster (`-r`, `-rf`, `-fr`, `-Rf`, ...).
 * Handles either argument order since `rm -r -f`, `rm -f -r`, `rm -rf`, and
 * `rm -fr` are all equivalent invocations an LLM might emit.
 */
function hasFlag(flagTokens: ShellToken[], shortLetter: string, longName: string): boolean {
  return flagTokens.some((t) => {
    if (t.text.startsWith('--')) return t.text === `--${longName}`
    if (t.text.startsWith('-')) return t.text.slice(1).toLowerCase().includes(shortLetter.toLowerCase())
    return false
  })
}

/**
 * Matches `rm` invocations combining recursive + force removal (`-rf`, `-fr`,
 * `-r -f`, `-f -r`, `--recursive --force`, and combined single-dash bundles in
 * either order) targeting a bare path. Any target path is treated as
 * unqualified enough to flag — see {@link BARE_PATH_TOKEN}'s doc comment. A
 * target computed via unresolved variable expansion or command substitution
 * (`rm -rf "$TARGET"`) is treated the same as a bare path: the classifier
 * cannot rule out danger, so it does not get to rule it in as safe either.
 */
function matchRmRecursiveForce(tokens: ShellToken[]): string | undefined {
  if (tokens[0]?.text !== 'rm') return undefined

  const rest = tokens.slice(1)
  const flagTokens = rest.filter(isFlagToken)
  const pathTokens = rest.filter(t => !isFlagToken(t))

  const hasRecursive = hasFlag(flagTokens, 'r', 'recursive')
  const hasForce = hasFlag(flagTokens, 'f', 'force')
  if (!hasRecursive || !hasForce) return undefined
  if (pathTokens.length === 0) return undefined

  const hasBareTarget = pathTokens.some(t => BARE_PATH_TOKEN.test(t.text) || t.hasExpansion)
  if (!hasBareTarget) return undefined

  return `rm -rf (recursive + force removal) targeting ${pathTokens.map(t => t.text).join(', ')}`
}

/** Matches `git push` with `--force`/`-f`, but NOT a plain `git push` (a common false-positive risk). */
function matchGitPushForce(tokens: ShellToken[]): string | undefined {
  if (tokens[0]?.text !== 'git' || tokens[1]?.text !== 'push') return undefined
  const rest = tokens.slice(2)
  const forced = rest.some((t) => {
    if (t.text === '--force' || t.text === '--force-with-lease') return true
    // Single-dash bundle containing `f`, e.g. `-f`, `-vf`. Long options other
    // than the two above (`--force-if-includes`, etc.) are not force flags.
    return t.text.startsWith('-') && !t.text.startsWith('--') && t.text.slice(1).includes('f')
  })
  if (!forced) return undefined
  return 'git push --force / -f rewrites remote history'
}

/** Matches `git reset --hard`, which discards uncommitted working-tree changes. */
function matchGitResetHard(tokens: ShellToken[]): string | undefined {
  if (tokens[0]?.text !== 'git' || tokens[1]?.text !== 'reset') return undefined
  if (!tokens.slice(2).some(t => t.text === '--hard')) return undefined
  return 'git reset --hard discards uncommitted working-tree changes'
}

/** Matches disk-format commands: `mkfs*`, `diskutil eraseDisk`, and Windows `format`. */
function matchDiskFormat(tokens: ShellToken[]): string | undefined {
  const first = tokens[0]?.text
  const second = tokens[1]?.text
  if (first && /^mkfs(\.\w+)?$/.test(first)) return `${first} formats a filesystem, destroying existing data`
  if (first === 'diskutil' && second === 'eraseDisk') return 'diskutil eraseDisk erases an entire disk'
  if (first && /^format$/i.test(first)) return 'format (Windows) reinitializes a volume, destroying existing data'
  return undefined
}

/**
 * Matches `dd` writing to a block device (`of=/dev/*`), or writing to a
 * destination computed via unresolved variable expansion or command
 * substitution (`dd of=$DEV`, `dd of=$(cat target)`) — the classifier cannot
 * confirm that resolves to a regular file, so it does not get to assume so.
 */
function matchDdToBlockDevice(tokens: ShellToken[]): string | undefined {
  if (tokens[0]?.text !== 'dd') return undefined
  const ofArg = tokens.find(t => t.text.startsWith('of='))
  if (!ofArg) return undefined
  const target = ofArg.text.slice('of='.length)
  if (ofArg.hasExpansion) return `dd writing to a destination computed at runtime (${target}); cannot confirm it is not a block device`
  if (!target.startsWith('/dev/')) return undefined
  return `dd writing directly to block device ${target}`
}

/** Matches recursive `chmod`/`chown` targeting `/` (root filesystem). */
function matchRecursiveChmodChownRoot(tokens: ShellToken[]): string | undefined {
  const first = tokens[0]?.text
  if (first !== 'chmod' && first !== 'chown') return undefined
  const rest = tokens.slice(1)
  const flagTokens = rest.filter(isFlagToken)
  const hasRecursive = hasFlag(flagTokens, 'r', 'recursive')
  if (!hasRecursive) return undefined
  const nonFlagTokens = rest.filter(t => !isFlagToken(t))
  // For chmod the mode is the first non-flag token, the path(s) follow; for
  // chown the owner:group is first, the path(s) follow. Either way, a bare
  // `/` target anywhere after the first non-flag token is the dangerous case.
  const targets = nonFlagTokens.slice(1)
  if (!targets.some(t => t.text === '/')) return undefined
  return `recursive ${first} targeting / (root filesystem)`
}

/**
 * Table-driven pattern list, evaluated in order. Kept as an ordered array
 * (not a map) so pattern precedence is explicit and new classes are a single
 * appended entry.
 */
const PATTERNS: DestructivePattern[] = [
  { id: 'rm-recursive-force', test: matchRmRecursiveForce },
  { id: 'git-push-force', test: matchGitPushForce },
  { id: 'git-reset-hard', test: matchGitResetHard },
  { id: 'disk-format', test: matchDiskFormat },
  { id: 'dd-block-device', test: matchDdToBlockDevice },
  { id: 'chmod-chown-root-recursive', test: matchRecursiveChmodChownRoot },
]

/**
 * Classifies a shell command string as destructive-requires-confirmation or
 * not. Matches realistic command shapes an LLM would actually emit
 * (`rm -rf` variants, `git push --force`, `git reset --hard`, disk-format
 * commands, `dd` to a block device, recursive `chmod`/`chown` on `/`) against
 * a real POSIX-shell parse of the command string — see the package README's
 * "Known Limitations" section for what is deliberately not covered
 * (obfuscated/base64-encoded commands, for example).
 *
 * Command chaining (`;`, `&`, `&&`, `||`, `|`, `|&`, subshells, groups) is
 * resolved through the real grammar, and each resulting command is
 * classified independently, so a destructive command hidden after a benign
 * one — including behind a pipe — is still caught. A command name or a
 * pattern's target argument that depends on unresolved variable expansion or
 * command substitution is treated as destructive: this classifier runs
 * before the command does, so it cannot resolve `$(...)`, `` `...` ``, or
 * `$NAME` to know what they become, and a false "needs confirmation" is
 * preferable to letting a computed destructive target through unflagged.
 *
 * Errs toward over-flagging: a false "needs confirmation" costs one prompt, a
 * false negative is the actual safety failure.
 * @param command - the raw shell command string as the model would emit it.
 * @returns `destructive: true` with a `reason` naming the matched pattern, or `destructive: false`.
 */
export function isDestructiveCommand(command: string): DestructiveClassification {
  const trimmed = command.trim()
  if (!trimmed) return { destructive: false }

  let commands: ShellToken[][]
  try {
    commands = tokenizeShellLine(trimmed)
  } catch (error) {
    // A string that fails to parse as POSIX shell syntax cannot be safely
    // decomposed into commands; the same over-flagging bias applies.
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error)
    return { destructive: true, reason: `command could not be parsed as shell syntax (${message}); treated as destructive out of caution` }
  }

  for (const tokens of commands) {
    const name = tokens[0]
    if (name === undefined) continue
    if (name.hasExpansion) {
      return {
        destructive: true,
        reason: `command name (${name.text}) is computed via unresolved variable expansion or command substitution; cannot classify safely`,
      }
    }
    for (const pattern of PATTERNS) {
      const reason = pattern.test(tokens)
      if (reason) return { destructive: true, reason }
    }
  }
  return { destructive: false }
}
