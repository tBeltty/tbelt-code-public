/**
 * The terminal app's command-line provider: it parses `--resume`, `--continue`,
 * `--cwd` and `--help`, then publishes {@link TERMINAL_STARTUP_SERVICE}. The terminal
 * runner is an ordinary consumer whose lazy config waits for that service.
 * @module @deepseek-ai/dsh-terminal-app
 */

import { Command } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'
import * as hooksClaudeCode from '@deepseek-ai/dsh-hooks-claude-code'
import { orcaHooksConfigPath, processProbe } from './orca-hooks.ts'

/** Stable Cordis plugin name. */
export const name = 'terminal-startup'

/** Services required before the flags can be resolved. */
export const inject = ['cmdlineArgs']

/** Plugin config. */
export interface Config {
  /** `auto` loads Orca's status hooks when the terminal runs in an Orca pane; `off` never does. */
  orcaHooks: 'auto' | 'off'
}

export const Config: z<Config> = z.object({
  orcaHooks: z.union([z.const('auto' as const), z.const('off' as const)]).default('auto'),
})

/** Service provided by this plugin and injected by the terminal runner. */
export const TERMINAL_STARTUP_SERVICE = 'terminalStartup'

/** What the runner row reads from {@link TERMINAL_STARTUP_SERVICE}. */
export interface TerminalStartupValues {
  /** Session id or unique id prefix to reopen; absent for a new session. */
  resume: string | undefined
  /** Whether to reopen the latest session started in the working directory. */
  continueLatest: boolean
  /** Directory to work in instead of the process working directory (`--cwd` or the positional directory). */
  cwd: string | undefined
}

/** The terminal flag family, as commander parsed it. */
interface TerminalOptions {
  resume?: string
  continue?: boolean
  cwd?: string
}

/**
 * This app's command: its flags, its description, and its help text.
 * @returns a fresh program, so one process can parse more than once (tests).
 */
function terminalCommand(): Command {
  return new Command()
    .name('dsh terminal')
    .description('Work with the agent in this terminal.')
    .helpOption('-h, --help', 'show this help')
    .option('--resume <session>', 'reopen a session by id or by a unique prefix of its id')
    .option('--continue', 'reopen the latest session started in this directory')
    .option('--cwd <directory>', 'work in this directory instead of the current one')
    .argument('[directory]', 'the same as --cwd; terminal hosts such as Orca pass the workspace this way')
    .addHelpText('after', `
Examples:
  dsh terminal                       start a new session in this directory
  dsh terminal --continue            reopen the latest session of this directory
  dsh terminal --resume 3f9a         reopen the session whose id starts with 3f9a
  dsh terminal --cwd ~/code/app      start a session in another directory
  dsh terminal .                     start a session in this directory
`)
}

/**
 * Parse and provide the terminal invocation as an ordinary Cordis service.
 * `--resume` together with `--continue` is a usage error, so on rejection (and
 * on `--help`) nothing is provided.
 * @param ctx - plugin context carrying the command line.
 */
export function apply(ctx: Context, config: Config): void {
  const program = terminalCommand()
  program.action((directory: string | undefined) => {
    const options = program.opts<TerminalOptions>()
    if (options.resume !== undefined && options.continue === true) {
      program.error('error: use --resume or --continue, not both')
    }
    if (options.resume !== undefined && options.resume.trim() === '') {
      program.error('error: --resume needs a session id')
    }
    if (options.cwd !== undefined && options.cwd.trim() === '') {
      program.error('error: --cwd needs a directory')
    }
    if (directory !== undefined && directory.trim() === '') {
      program.error('error: the directory is empty')
    }
    if (options.cwd !== undefined && directory !== undefined) {
      program.error('error: use --cwd or a directory, not both')
    }
    ctx.provide(TERMINAL_STARTUP_SERVICE, {
      resume: options.resume,
      continueLatest: options.continue === true,
      cwd: options.cwd ?? directory,
    } satisfies TerminalStartupValues)
  })
  parseCmdline(ctx, program)
  const orcaHooks = config.orcaHooks === 'auto' ? orcaHooksConfigPath(processProbe()) : undefined
  if (orcaHooks !== undefined) ctx.plugin(hooksClaudeCode, { configPath: orcaHooks })
}
