/** Private command-management worker; macOS mutation targets are fixed before elevation. */

import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CommandInstallationError } from './command-installation.ts'
import { ALIAS_COMMANDS, runCommandSet, writeAppImageWrappers, type AliasCommand, type CommandOperation, type CommandSet } from './command-set.ts'

const [operation, expected] = process.argv.slice(2)
const fingerprint = expected ?? ''
const resources = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
// This dedicated worker writes public command ownership metadata, not user secrets.
if (process.platform === 'darwin') process.umask(0o022)

try {
  if (!['inspect', 'install', 'remove'].includes(operation ?? '')) throw new CommandInstallationError('EINVAL', 'Invalid command-management operation.')
  if (operation !== 'inspect' && !/^[a-f0-9]{64}$/u.test(fingerprint)) throw new CommandInstallationError('EINVAL', 'Missing command confirmation.')
  if (process.platform === 'darwin') {
    const cli = join(resources, 'runtime', 'cli')
    const link = (name: 'dsh' | AliasCommand) => ({ destination: `/usr/local/bin/${name}`, launcher: join(cli, 'bin', name), linkHelper: join(cli, 'link-entry') })
    const state = await runCommandSet({ dsh: link('dsh'), aliases: { tbelt: link('tbelt'), 'dsh-tui': link('dsh-tui') } }, operation as CommandOperation, fingerprint)
    process.stdout.write(JSON.stringify({ ok: true, state }) + '\n')
  } else if (process.platform === 'linux') {
    // The AppImage path changes on update only through the file itself, so wrappers record the file, not its mount.
    const appImage = process.env.APPIMAGE
    if (appImage === undefined || !isAbsolute(appImage)) {
      throw new CommandInstallationError('EUNSUPPORTED', 'Command installation on Linux requires the AppImage.')
    }
    const configuredHome = process.env.DSH_HOME?.trim()
    const home = configuredHome === undefined || configuredHome === '' ? join(homedir(), '.tbelt-code') : resolve(configuredHome)
    const wrappers = operation === 'install' ? await writeAppImageWrappers(join(home, 'bin'), appImage)
      : { dsh: join(home, 'bin', 'dsh'), tbelt: join(home, 'bin', 'tbelt'), 'dsh-tui': join(home, 'bin', 'dsh-tui') }
    const link = (name: 'dsh' | AliasCommand) => ({ destination: join(homedir(), '.local', 'bin', name), launcher: wrappers[name], linkHelper: '' })
    const set: CommandSet = { dsh: link('dsh'), aliases: { tbelt: link('tbelt'), 'dsh-tui': link('dsh-tui') } }
    const state = await runCommandSet(set, operation as CommandOperation, fingerprint)
    if (operation === 'remove') for (const name of ['dsh', ...ALIAS_COMMANDS] as const) await rm(wrappers[name], { force: true })
    process.stdout.write(JSON.stringify({ ok: true, state }) + '\n')
  } else if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR
    if (systemRoot === undefined) throw new CommandInstallationError('ENOENT', 'Windows system directory is unavailable.')
    const child = spawn(join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(resources, 'runtime', 'cli', 'command-path.ps1')],
      { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true })
    child.stdout.pipe(process.stdout)
    const exited = new Promise<number | null>((accept, reject) => {
      child.once('error', reject)
      child.once('close', accept)
    })
    child.stdin.end(JSON.stringify({ operation, expected, directory: join(resources, 'runtime', 'cli', 'bin') }))
    process.exitCode = await exited ?? 1
  } else {
    throw new CommandInstallationError('EUNSUPPORTED', 'Command installation is supported on macOS, Windows and Linux.')
  }
} catch (error) {
  // osascript preserves stdout only when the command exits successfully; the response owns operation failures.
  process.stdout.write(JSON.stringify({
    ok: false,
    code: error instanceof CommandInstallationError ? error.code : (error as NodeJS.ErrnoException).code ?? 'EIO',
    message: error instanceof Error ? error.message : 'Command management failed.',
  }) + '\n')
}
