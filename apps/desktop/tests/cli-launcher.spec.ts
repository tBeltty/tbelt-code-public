/** Installed launcher scripts preserve terminal invocation through a minimal runtime fixture. */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { prepareDesktopCli } from '../scripts/prepare-cli.ts'

function fixture(layout: 'darwin' | 'win32' | 'linux' = process.platform === 'win32' ? 'win32' : 'darwin') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-cli-launcher-')))
  const children: ChildProcessWithoutNullStreams[] = []
  const exits: Promise<unknown>[] = []
  onTestFinished(async () => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }
    await Promise.allSettled(exits)
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  const application = join(root, 'Application 中文 with spaces.app')
  const platform = layout
  const resources = join(application, ...platform === 'darwin' ? ['Contents', 'Resources'] : ['resources'])
  const cli = join(resources, 'runtime', 'cli')
  prepareDesktopCli(cli, platform)
  const electron = join(application, ...platform === 'darwin' ? ['Contents', 'MacOS', 'tBelt Code'] : platform === 'linux' ? ['tbelt-code'] : ['tBelt Code.exe'])
  mkdirSync(dirname(electron), { recursive: true })
  if (platform === 'win32') copyFileSync(process.execPath, electron)
  else symlinkSync(process.execPath, electron)
  const entry = join(resources, 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js')
  mkdirSync(dirname(entry), { recursive: true })
  writeFileSync(join(dirname(entry), 'package.json'), '{"type":"module"}\n')
  writeFileSync(entry, [
    'const chunks = []',
    'for await (const chunk of process.stdin) chunks.push(chunk)',
    "process.stdout.write(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), value: process.env.DSH_CLI_TEST_VALUE, nodeMode: process.env.ELECTRON_RUN_AS_NODE, home: process.env.DSH_HOME, input: Buffer.concat(chunks).toString('hex') }))",
    "process.stderr.write('separate stderr\\n')",
    'process.exitCode = 23',
    '',
  ].join('\n'))
  const command = join(cli, 'bin', platform === 'win32' ? 'dsh.cmd' : 'dsh')
  const alias = join(cli, 'bin', platform === 'win32' ? 'tbelt.cmd' : 'tbelt')
  const tuiAlias = join(cli, 'bin', platform === 'win32' ? 'dsh-tui.cmd' : 'dsh-tui')
  function start(args: string[], executable = command, environment: NodeJS.ProcessEnv = {}) {
    const env = { ...process.env, DSH_HOME: undefined, DSH_CLI_TEST_VALUE: 'kept', ...environment }
    // cmd fixture inputs contain no metacharacters; POSIX cases exercise literal expansion characters separately.
    const child = platform === 'win32'
      ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `""${executable}" ${args.map(value => `"${value}"`).join(' ')}"`], {
        cwd: root, env, stdio: 'pipe', windowsVerbatimArguments: true,
      })
      : spawn(executable, args, { cwd: root, env, stdio: 'pipe' })
    children.push(child)
    const closed = new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', resolve)
    })
    exits.push(closed)
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (text: string) => { stdout += text })
    child.stderr.setEncoding('utf8').on('data', (text: string) => { stderr += text })
    return { child, closed, stdout: () => stdout, stderr: () => stderr }
  }
  return { root, command, alias, tuiAlias, start }
}

it('preserves common arguments, cwd, environment, binary input, stderr and exit status', async () => {
  const f = fixture()
  const args = ['plugin', '--profile', 'desktop', 'hello world', '中文 🚀', '']
  const run = f.start(args)
  const input = Buffer.from([0, 1, 10, 255])
  run.child.stdin.end(input)
  expect(await run.closed, run.stderr()).toBe(23)
  expect(JSON.parse(run.stdout())).toEqual({ args, cwd: f.root, value: 'kept', nodeMode: '1', home: join(homedir(), '.tbelt-code'), input: input.toString('hex') })
  expect(run.stderr()).toBe('separate stderr\n')
})

it.skipIf(process.platform === 'win32')('resolves chained command symlinks without expanding argument contents', async () => {
  const f = fixture()
  const link = join(f.root, 'command-link')
  const command = join(f.root, 'dsh')
  symlinkSync(relative(f.root, f.command), link)
  symlinkSync(link, command)
  const args = ['quote"inside', 'trailing\\', '%PATH%', '$HOME', '`literal`', '']
  const run = f.start(args, command)
  run.child.stdin.end()
  expect(await run.closed, run.stderr()).toBe(23)
  expect(JSON.parse(run.stdout())).toMatchObject({ args, cwd: f.root, nodeMode: '1' })
})

it.each([
  ['an unset DSH_HOME', undefined, join(homedir(), '.tbelt-code')],
  ['a blank DSH_HOME', '   ', join(homedir(), '.tbelt-code')],
  ['an explicit DSH_HOME', 'custom home', 'custom home'],
])('gives the command the installed application home for %s', async (_name, value, expected) => {
  const f = fixture()
  const run = f.start([], f.command, value === undefined ? {} : { DSH_HOME: value })
  run.child.stdin.end()
  expect(await run.closed, run.stderr()).toBe(23)
  expect(JSON.parse(run.stdout())).toMatchObject({ home: expected })
})

it.each(['alias', 'tuiAlias'] as const)('runs the terminal profile through the %s launcher and keeps the version flags', async (name) => {
  const f = fixture()
  const terminal = f.start(['--resume', 'abc def', ''], f[name])
  terminal.child.stdin.end()
  expect(await terminal.closed, terminal.stderr()).toBe(23)
  expect(JSON.parse(terminal.stdout())).toMatchObject({ args: ['terminal', '--resume', 'abc def', ''], nodeMode: '1' })
  for (const flag of ['--version', '-V']) {
    const version = f.start([flag, 'ignored'], f[name])
    version.child.stdin.end()
    expect(await version.closed, version.stderr()).toBe(23)
    expect(JSON.parse(version.stdout())).toMatchObject({ args: ['--version'] })
  }
})

it.skipIf(process.platform === 'win32').each(['alias', 'tuiAlias'] as const)('resolves the %s launcher through a command symlink', async (name) => {
  const f = fixture()
  const link = join(f.root, 'linked')
  symlinkSync(f[name], link)
  const run = f.start(['hello'], link)
  run.child.stdin.end()
  expect(await run.closed, run.stderr()).toBe(23)
  expect(JSON.parse(run.stdout())).toMatchObject({ args: ['terminal', 'hello'] })
})

it.skipIf(process.platform === 'win32')('runs the Linux launcher beside the unpacked executable with the application home', async () => {
  const f = fixture('linux')
  for (const executable of [f.command, f.alias, f.tuiAlias]) {
    const run = f.start(['hello'], executable)
    run.child.stdin.end()
    expect(await run.closed, run.stderr()).toBe(23)
    expect(JSON.parse(run.stdout())).toMatchObject({
      args: executable !== f.command ? ['terminal', 'hello'] : ['hello'], nodeMode: '1', home: join(homedir(), '.tbelt-code'),
    })
  }
})
