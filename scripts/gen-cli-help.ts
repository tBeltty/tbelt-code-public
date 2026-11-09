/** Generate the CLI reference by invoking the shipped launcher and profile help. */

import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles'
import { defaultParallelism } from './parallelism.ts'

const root = resolve(import.meta.dirname, '..')
const OUT = 'docs/cli-help.md'
const execFileAsync = promisify(execFile)

/** Complete help text and the immediate subcommands it advertises. */
export interface CliHelp {
  /** Complete help text with LF line endings. */
  output: string
  /** Immediate command names and aliases listed in the `Commands:` section, in their displayed order. */
  commands: string[]
}

interface HelpPage {
  help: CliHelp
  invocations: [string, ...string[]]
  children: Map<string, HelpPage>
}

/**
 * Discover commands from actual text help while preserving every displayed line.
 * @param stdout - Successful CLI help output.
 * @returns Help text with LF line endings and the command names and aliases (`serve|s`) listed in its `Commands:` section.
 * @throws When the output is empty.
 */
export function parseCliHelp(stdout: string): CliHelp {
  const output = stdout.replaceAll('\r\n', '\n')
  if (output.trim() === '') throw new Error('CLI help returned empty output')
  const section = /^Commands:\n((?:[ \t][^\n]*\n|\n)*)/mu.exec(output)?.[1] ?? ''
  const commands = [...section.matchAll(/^ {2}\S+/gmu)].flatMap(match => match[0].slice(2).split('|'))
  return { output, commands }
}

// A `help [command]` row prints its parent's help, so a page can list itself as a child.
// An invocation that reaches a page already on the current path joins that page without
// extending its children, which keeps alias propagation finite.
function addAlias(page: HelpPage, invocation: string, path: ReadonlySet<HelpPage>): void {
  if (page.invocations.includes(invocation)) return
  page.invocations.push(invocation)
  if (path.has(page)) return
  const childPath = new Set([...path, page])
  for (const [name, child] of page.children) addAlias(child, `${invocation} ${name}`, childPath)
}

/**
 * List the top-level help invocations in the order {@link collectCliHelp} visits them.
 * @param profiles - shipped profile names whose explicit and shorthand forms must be documented.
 * @returns launcher help, plugin help, then each profile's shorthand and `--profile` forms in sorted profile order.
 */
export function topLevelHelpArgs(profiles: readonly string[]): string[][] {
  return [[], ['plugin'], ...[...profiles].sort().flatMap(profile => [[profile], ['--profile', profile]])]
}

/** Help reads started ahead of an in-order consumer. */
export interface PrefetchedHelpReader {
  /**
   * Return the result of one prefetched invocation, or start a read for an invocation that was not prefetched.
   * Each prefetched result is served once; a repeated request starts a new read.
   * @param args - help invocation arguments.
   * @returns the read's stdout, or its rejection.
   */
  readHelp: (args: readonly string[]) => Promise<string>
  /**
   * Abort the shared signal so queued reads never start and running reads stop.
   * @returns a promise that resolves after every started read settles, whether or not its result was consumed.
   */
  close(): Promise<void>
}

/**
 * Start help reads for known invocations before a sequential consumer requests them.
 * Prefetched and on-demand reads share one first-in, first-out limit. A rejected read
 * reaches the consumer when it requests that invocation; an unconsumed rejection is
 * observed only by {@link PrefetchedHelpReader.close}.
 * @param read - run one help invocation; once `signal` aborts it must stop its work and settle only after that work has stopped.
 * @param prefetch - invocations to start immediately, in the order the consumer requests them.
 * @param concurrency - maximum number of reads in flight.
 * @returns a reader whose `close` the caller awaits after consumption, including after a failure.
 */
export function prefetchHelp(
  read: (args: readonly string[], signal: AbortSignal) => Promise<string>,
  prefetch: readonly (readonly string[])[],
  concurrency: number,
): PrefetchedHelpReader {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error(`gen-cli-help: concurrency must be a positive integer, got ${String(concurrency)}`)
  }
  const controller = new AbortController()
  const settled: Promise<void>[] = []
  const waiting: (() => void)[] = []
  let active = 0
  const acquire = async (): Promise<void> => {
    if (active < concurrency) {
      active++
      return
    }
    // release() hands its slot to the oldest waiter without decrementing `active`.
    await new Promise<void>((resolveSlot) => { waiting.push(resolveSlot) })
  }
  const release = (): void => {
    const next = waiting.shift()
    if (next === undefined) active--
    else next()
  }
  const start = (args: readonly string[]): Promise<string> => {
    const result = (async () => {
      await acquire()
      try {
        controller.signal.throwIfAborted()
        return await read(args, controller.signal)
      } finally {
        release()
      }
    })()
    // Attaching this handler also keeps an unconsumed rejection from surfacing as unhandled.
    settled.push(result.then(() => undefined, () => undefined))
    return result
  }
  const prefetched = new Map(prefetch.map(args => [JSON.stringify(args), start(args)]))
  return {
    readHelp: (args) => {
      const key = JSON.stringify(args)
      const result = prefetched.get(key)
      if (result === undefined) return start(args)
      prefetched.delete(key)
      return result
    },
    async close() {
      controller.abort()
      await Promise.all(settled)
    },
  }
}

/**
 * Collect launcher, plugin, and profile help even when root help lists no commands.
 * @param readHelp - run one help invocation and return its complete stdout.
 * @param profiles - shipped profile names whose explicit and shorthand forms must be documented.
 * @returns distinct help pages with every discovered invocation and nested command.
 */
export async function collectCliHelp(
  readHelp: (args: readonly string[]) => Promise<string>, profiles: readonly string[],
): Promise<HelpPage[]> {
  const pages = new Map<string, HelpPage>()
  const visit = async (args: string[], path: ReadonlySet<HelpPage>): Promise<HelpPage> => {
    const invocation = ['dsh', ...args].join(' ')
    const help = parseCliHelp(await readHelp(args))
    const existing = pages.get(help.output)
    if (existing !== undefined) {
      addAlias(existing, invocation, path)
      return existing
    }
    const page: HelpPage = { help, invocations: [invocation], children: new Map() }
    pages.set(help.output, page)
    const childPath = new Set([...path, page])
    for (const name of help.commands) page.children.set(name, await visit([...args, name], childPath))
    return page
  }
  const top = new Set<HelpPage>()
  for (const args of topLevelHelpArgs(profiles)) await visit(args, top)
  return [...pages.values()]
}

async function collectHelp(): Promise<HelpPage[]> {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-cli-help-'))
  const profiles = Object.keys(PROFILE_TEMPLATES)
  // Concurrent profile boots share the repository worker budget.
  const reader = prefetchHelp(async (args, signal) => {
    // Each invocation boots against its own empty Harness and agents homes.
    const home = mkdtempSync(join(directory, 'invocation-'))
    const environment = {
      ...process.env,
      DSH_HOME: join(home, 'harness'),
      DSH_AGENTS_HOME: join(home, 'agents'),
      DSH_TELEMETRY_DISABLED: '1',
      NO_COLOR: '1',
    }
    for (const name of ['NODE_OPTIONS', 'FORCE_COLOR']) Reflect.deleteProperty(environment, name)
    const help = execFileAsync(process.execPath, [
      '--import', 'tsx/esm', 'apps/cli/src/bin.ts', ...args, '--help',
    ], {
      cwd: root, env: environment, encoding: 'utf8', timeout: 30_000,
      killSignal: 'SIGKILL', maxBuffer: 2 * 1024 * 1024,
    })
    // Killing directly, not through execFile's signal option, settles the read only after the child closes.
    const abort = (): void => { help.child.kill('SIGKILL') }
    signal.addEventListener('abort', abort, { once: true })
    try {
      const { stdout, stderr } = await help
      if (stderr !== '') throw new Error(`${['dsh', ...args].join(' ')} --help wrote diagnostics: ${stderr}`)
      return stdout
    } finally {
      signal.removeEventListener('abort', abort)
    }
  }, topLevelHelpArgs(profiles), defaultParallelism())
  try {
    return await collectCliHelp(reader.readHelp, profiles)
  } finally {
    try {
      await reader.close()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

function anchor(page: HelpPage): string {
  return page.invocations[0].replaceAll(/[^a-zA-Z0-9]+/gu, '-').replace(/-$/u, '').toLowerCase()
}

function renderHelp(pages: readonly HelpPage[]): string {
  const lines = [
    '<!-- Generated by scripts/gen-cli-help.ts — do not edit by hand.',
    '     Run `pnpm run gen-cli-help` to regenerate. -->',
    '',
    '# dsh CLI help',
    '',
    'This reference contains complete help for the launcher, subcommands, and shipped profiles. Identical help appears once with every invocation listed. Help output retains its original language.',
    '',
    'Run `pnpm run gen-cli-help` to regenerate; run `pnpm run verify-cli-help` to check freshness.',
    '',
    '## Contents',
    '',
    ...pages.map(page => `- [\`${page.invocations[0]}\`](#${anchor(page)})`),
    '',
  ]
  for (const page of pages) {
    lines.push(
      `<a id="${anchor(page)}"></a>`,
      `## \`${page.invocations[0]}\``,
      '',
      `Invocations: ${page.invocations.map(invocation => `\`${invocation} --help\``).join(', ')}`,
      '',
      `\`\`\`text\n${page.help.output}${page.help.output.endsWith('\n') ? '' : '\n'}\`\`\``,
      '',
    )
  }
  return lines.join('\n')
}

/** Regenerate the CLI reference page, or check its bytes with --check. @returns Nothing. */
export async function main(): Promise<void> {
  const check = process.argv.includes('--check')
  const pages = await collectHelp()
  const outputs = new Map([[OUT, renderHelp(pages)]])
  const changed: string[] = []
  for (const [path, content] of outputs) {
    const destination = resolve(root, path)
    if (existsSync(destination) && readFileSync(destination, 'utf8') === content) continue
    changed.push(path)
    if (!check) writeFileSync(destination, content)
  }
  if (check && changed.length > 0) {
    console.error(`gen-cli-help: stale — ${changed.join(', ')}. Run pnpm run gen-cli-help.`)
    process.exitCode = 1
  } else {
    console.log(`gen-cli-help: ${pages.length} help pages; ${check ? 'all outputs are current' : `${changed.length} files written`}.`)
  }
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) await main()
