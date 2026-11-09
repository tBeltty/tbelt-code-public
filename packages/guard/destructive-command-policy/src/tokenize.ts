/**
 * Shell-aware tokenization built on `@yarnpkg/parsers`' real POSIX-shell
 * grammar: chain-splitting across `;`, `&`, `&&`, `||`, `|`, `|&`, subshells,
 * and groups, plus per-argument shell-quoting — replacing the whitespace and
 * regex splitting `classify.ts` used before.
 *
 * @module @deepseek-ai/dsh-destructive-command-policy/tokenize
 */

import { parseShell } from '@yarnpkg/parsers'
import type { Argument, CommandChain, CommandLine, ShellLine } from '@yarnpkg/parsers'

/** One command invocation node, as opposed to a subshell, group, or bare assignment. */
type CommandNode = Extract<CommandChain, { type: 'command' }>

/** An argument that becomes an argv field, as opposed to a redirection. */
type ValueArgument = Extract<Argument, { type: 'argument' }>

/**
 * Characters that make this module ask the parser to treat an unquoted word
 * as a glob segment rather than plain text. Classification below treats both
 * segment kinds as literal, so this predicate only shapes how a match's
 * `text` is reconstructed, never whether it is flagged.
 */
const GLOB_PATTERN = /[*?]|\[[^\]]*\]/

/** Whether one unquoted word contains a shell glob wildcard. */
function isGlobPattern(word: string): boolean {
  return GLOB_PATTERN.test(word)
}

/** One argv-position token, reconstructed from its parsed argument segments. */
export interface ShellToken {
  /** Literal text this token is known to contain; unresolved expansions render as placeholders, not their runtime value. */
  text: string
  /**
   * `true` when this argument contains a shell variable (`$NAME`, `${NAME}`),
   * command substitution (`$(...)`, `` `...` ``), or arithmetic (`$((...))`)
   * segment — its actual runtime value cannot be known from the command
   * string alone.
   */
  hasExpansion: boolean
}

/** Render one parsed argument into a token, tracking whether any segment can only be known at runtime. */
function renderArgument(argument: ValueArgument): ShellToken {
  let text = ''
  let hasExpansion = false
  for (const segment of argument.segments) {
    switch (segment.type) {
      case 'text':
        text += segment.text
        break
      case 'glob':
        text += segment.pattern
        break
      case 'variable':
        hasExpansion = true
        text += `\${${segment.name}}`
        break
      case 'shell':
        hasExpansion = true
        text += '$(...)'
        break
      case 'arithmetic':
        hasExpansion = true
        text += '$((...))'
        break
    }
  }
  return { text, hasExpansion }
}

/** Tokens for one command invocation: its name and arguments, redirections excluded. */
function tokenizeCommand(command: CommandNode): ShellToken[] {
  return command.args
    .filter((argument): argument is ValueArgument => argument.type === 'argument')
    .map(renderArgument)
}

/** Yield the command node itself, or recurse into a subshell/group's nested line; a bare assignment starts no program. */
function* walkCommandNode(node: CommandChain): Generator<CommandNode> {
  switch (node.type) {
    case 'command':
      yield node
      return
    case 'subshell':
      yield* walkShellLine(node.subshell)
      return
    case 'group':
      yield* walkShellLine(node.group)
      return
    case 'envs':
      return
  }
}

/** Walk one `|` / `|&` pipeline, yielding every stage's command node. */
function* walkChain(chain: CommandChain): Generator<CommandNode> {
  yield* walkCommandNode(chain)
  if (chain.then) yield* walkChain(chain.then.chain)
}

/** Walk one `&&` / `||` chain, yielding every linked pipeline's command nodes. */
function* walkCommandLine(commandLine: CommandLine): Generator<CommandNode> {
  yield* walkChain(commandLine.chain)
  if (commandLine.then) yield* walkCommandLine(commandLine.then.line)
}

/** Walk every `;` / `&` entry of a parsed line, yielding every command node it reaches. */
function* walkShellLine(line: ShellLine): Generator<CommandNode> {
  for (const entry of line) yield* walkCommandLine(entry.command)
}

/**
 * Parses `source` as a POSIX shell line and returns every command invocation
 * it contains, each already reduced to its argv tokens. Covers every real
 * chain operator (`;`, `&`, `&&`, `||`, `|`, `|&`) and recurses into
 * subshells (`( … )`) and groups (`{ … }`), so a destructive command hidden
 * behind any of those still surfaces as its own entry.
 * @param source - the raw shell command string.
 * @returns one token array per command invocation, in source order; empty when the line parses to no commands.
 * @throws when `source` is not valid POSIX shell syntax.
 */
export function tokenizeShellLine(source: string): ShellToken[][] {
  const line = parseShell(source, { isGlobPattern })
  return [...walkShellLine(line)].map(tokenizeCommand)
}
