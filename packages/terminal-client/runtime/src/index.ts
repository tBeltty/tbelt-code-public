/**
 * @deepseek-ai/dsh-terminal-client: the Host plugin of the `terminal` profile.
 * It connects a Remote API client to this Host over an in-process carrier and
 * draws one session in the terminal. No socket, port or token exists, so
 * nothing else on the machine can reach this session.
 * @module @deepseek-ai/dsh-terminal-client
 */
import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { detectImageProtocol, resolveTypedPath, t } from '@deepseek-ai/dsh-terminal-views'
import type { ImageSetting } from '@deepseek-ai/dsh-terminal-views'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import type { TypertGateway } from '@deepseek-ai/dsh-api-gateway'
import type {} from '@deepseek-ai/dsh-cmdline'
import { createInProcessTransport } from './carrier.ts'
import { bootClientTree, installedSources } from './client-tree.ts'
import type { ClientTree } from './client-tree.ts'
import { nodeFiles } from './files.ts'
import { runTerminal } from './runner.ts'
import type { TerminalRun } from './runner.ts'

/** Stable Cordis plugin name. */
export const name = 'terminal-client'

/** Services the in-process carrier connects to. */
export const inject = ['connection', 'typertGateway']

/** Plugin config: the start-up choice of this invocation. */
export interface Config {
  /** Session id or unique id prefix to reopen. */
  resume?: string
  /** Reopen the latest session started in the working directory. */
  continueLatest: boolean
  /** Directory new sessions start in and `--continue` searches; the process working directory when absent. */
  cwd?: string
  /** Inline images: `auto` reads the terminal from the environment, a protocol name forces it, `off` shows a text marker. */
  images: ImageSetting
  /** Largest image file `/attach` accepts, in bytes. */
  imageMaxBytes: number
  /** Window title: `auto` keeps it in step with the session, `off` never touches it. */
  title: 'auto' | 'off'
  /** Time between spinner frames in the window title while a turn runs, in milliseconds. */
  titleFrameMs: number
}

export const Config: z<Config> = z.object({
  resume: z.string(),
  continueLatest: z.boolean().default(false),
  cwd: z.string(),
  images: z.union([z.const('auto' as const), z.const('kitty' as const), z.const('iterm2' as const), z.const('off' as const)]).default('auto'),
  imageMaxBytes: z.natural().min(1).default(20 * 1024 * 1024),
  title: z.union([z.const('auto' as const), z.const('off' as const)]).default('auto'),
  titleFrameMs: z.natural().min(100).default(500),
})

/** Path the Host mounts its Remote API at. */
const API_PATH = '/api'

/**
 * Start the terminal client once the Host tree is active.
 * @param ctx - Host plugin context.
 * @param config - start-up choice.
 */
export function apply(ctx: Context, config: Config): void {
  const exit = ctx.get('appExit')
  if (exit === undefined) {
    throw new Error('terminal-client: the launcher must provide ctx.appExit before the tree mounts')
  }
  const connection = ctx.get('connection') as HostConnectionHandle
  const gateway = ctx.get('typertGateway') as TypertGateway
  const transport = createInProcessTransport(connection.createSharedFetchHandler(API_PATH), gateway.wireStream)

  let run: TerminalRun | undefined
  let tree: ClientTree | undefined
  let disposed = false

  const start = async (): Promise<void> => {
    const files = nodeFiles(config.imageMaxBytes)
    const home = homedir()
    const cwd = resolveTypedPath(config.cwd ?? '', { base: process.cwd(), home })
    if (!await files.isDirectory(cwd)) throw new Error(t('new.notDirectory', { path: cwd }))
    if (disposed) return
    tree = await bootClientTree(transport, await installedSources())
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- dispose() can run while the client tree boots.
    if (disposed) {
      await tree.dispose()
      return
    }
    const started = await runTerminal(tree.services, {
      stdin: process.stdin,
      stdout: process.stdout,
      cwd,
      home,
      // oxlint-disable-next-line typescript/no-unnecessary-condition, typescript/no-unnecessary-boolean-literal-compare -- TTY-only method.
      color: process.env['NO_COLOR'] === undefined && process.stdout.hasColors?.() === true,
      exit,
      files,
      imageProtocol: detectImageProtocol(config.images, process.env),
      now: Date.now,
      hostTitle: config.title === 'off'
        ? undefined
        : { marker: (process.env['ORCA_PANE_KEY'] ?? '') !== '', frameIntervalMs: config.titleFrameMs },
    }, { resume: config.resume, continueLatest: config.continueLatest })
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- dispose() can run while the terminal starts.
    if (disposed) started.stop()
    else run = started
  }
  void start().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    exit(1)
  })

  ctx.effect(() => () => {
    disposed = true
    run?.stop()
    return tree?.dispose()
  })
}
