/** The dsh command and its tbelt and dsh-tui aliases are installed and removed together without touching foreign commands. */

import { execFile } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it, onTestFinished } from 'vitest'
import { inspectFileCommand } from '../src/command-installation.ts'
import { ALIAS_COMMANDS, appImageWrapper, runCommandSet, writeAppImageWrappers, type AliasCommand, type CommandSet } from '../src/command-set.ts'

const run = promisify(execFile)

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "dsh-command-set-it's-"))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const bin = join(root, 'bin')
  await mkdir(bin)
  for (const name of ['dsh', ...ALIAS_COMMANDS]) await writeFile(join(root, `launcher-${name}`), `${name}\n`, { mode: 0o755 })
  const link = (name: 'dsh' | AliasCommand) => ({ destination: join(bin, name), launcher: join(root, `launcher-${name}`), linkHelper: '' })
  const set: CommandSet = { dsh: link('dsh'), aliases: { tbelt: link('tbelt'), 'dsh-tui': link('dsh-tui') } }
  return { root, bin, set }
}

it.skipIf(process.platform === 'win32')('installs and removes both links under the dsh confirmation', async () => {
  const f = await fixture()
  const installed = await runCommandSet(f.set, 'install', (await inspectFileCommand(f.set.dsh)).fingerprint)
  expect(installed.managed).toBe(true)
  expect(await readlink(f.set.dsh.destination)).toBe(f.set.dsh.launcher)
  for (const alias of Object.values(f.set.aliases)) expect(await readlink(alias.destination)).toBe(alias.launcher)
  const removed = await runCommandSet(f.set, 'remove', (await inspectFileCommand(f.set.dsh)).fingerprint)
  expect(removed.managed).toBe(false)
  await expect(lstat(f.set.dsh.destination)).rejects.toMatchObject({ code: 'ENOENT' })
  for (const alias of Object.values(f.set.aliases)) await expect(lstat(alias.destination)).rejects.toMatchObject({ code: 'ENOENT' })
})

it.skipIf(process.platform === 'win32')('reports only dsh and keeps an alias from another installation', async () => {
  const f = await fixture()
  await symlink('foreign-tbelt', f.set.aliases.tbelt.destination)
  expect(await runCommandSet(f.set, 'inspect', '')).toMatchObject({ kind: 'missing', managed: false })
  await runCommandSet(f.set, 'install', (await inspectFileCommand(f.set.dsh)).fingerprint)
  expect(await readlink(f.set.dsh.destination)).toBe(f.set.dsh.launcher)
  expect(await readlink(f.set.aliases.tbelt.destination)).toBe('foreign-tbelt')
  expect(await readlink(f.set.aliases['dsh-tui'].destination)).toBe(f.set.aliases['dsh-tui'].launcher)
  await runCommandSet(f.set, 'remove', (await inspectFileCommand(f.set.dsh)).fingerprint)
  expect(await readlink(f.set.aliases.tbelt.destination)).toBe('foreign-tbelt')
  await expect(lstat(f.set.aliases['dsh-tui'].destination)).rejects.toMatchObject({ code: 'ENOENT' })
})

it.skipIf(process.platform === 'win32')('repairs a managed alias on a second install', async () => {
  const f = await fixture()
  await runCommandSet(f.set, 'install', (await inspectFileCommand(f.set.dsh)).fingerprint)
  await runCommandSet(f.set, 'install', (await inspectFileCommand(f.set.dsh)).fingerprint)
  expect(await readlink(f.set.aliases['dsh-tui'].destination)).toBe(f.set.aliases['dsh-tui'].launcher)
})

it.skipIf(process.platform === 'win32')('writes wrapper scripts whose quoting survives a path with spaces and quotes', async () => {
  const f = await fixture()
  const appImage = join(f.root, "tBelt Code $HOME `x` 'q'.AppImage")
  const paths = await writeAppImageWrappers(join(f.root, 'wrappers'), appImage)
  expect(await readFile(paths.dsh, 'utf8')).toBe(appImageWrapper(appImage, 'dsh'))
  expect(await readFile(paths.tbelt, 'utf8')).toContain('resources/runtime/cli/bin/tbelt')
  await run('sh', ['-n', paths.dsh])
  expect(await readFile(paths['dsh-tui'], 'utf8')).toContain('resources/runtime/cli/bin/dsh-tui')
  for (const alias of ALIAS_COMMANDS) await run('sh', ['-n', paths[alias]])
  const missing = await run(paths.dsh, [], { env: { ...process.env, DSH_HOME: join(f.root, 'home') } }).catch((error: { code: number; stderr: string }) => error)
  expect(missing).toMatchObject({ code: 127 })
  expect((missing as { stderr: string }).stderr).toContain('was moved or removed')
})

it.skipIf(process.platform !== 'linux')('unpacks the AppImage once per file version and runs the unpacked launcher', async () => {
  const f = await fixture()
  const appImage = join(f.root, 'tBelt Code.AppImage')
  const counter = join(f.root, 'extractions')
  await writeFile(appImage, [
    '#!/bin/sh',
    '[ "$1" = "--appimage-extract" ] || exit 2',
    'echo x >> "$COUNTER"',
    'mkdir -p squashfs-root/resources/runtime/cli/bin',
    "cat > squashfs-root/resources/runtime/cli/bin/dsh <<'EOS'",
    '#!/bin/sh',
    'printf "%s|%s" "$DSH_HOME" "$*"',
    'EOS',
    "cat > squashfs-root/resources/runtime/cli/bin/tbelt <<'EOS'",
    '#!/bin/sh',
    'printf "tbelt|%s" "$*"',
    'EOS',
    "cat > squashfs-root/resources/runtime/cli/bin/dsh-tui <<'EOS'",
    '#!/bin/sh',
    'printf "dsh-tui|%s" "$*"',
    'EOS',
    'chmod +x squashfs-root/resources/runtime/cli/bin/*',
    '',
  ].join('\n'), { mode: 0o755 })
  const paths = await writeAppImageWrappers(join(f.root, 'wrappers'), appImage)
  const home = join(f.root, 'home')
  const env = { ...process.env, DSH_HOME: home, COUNTER: counter }
  expect((await run(paths.dsh, ['--version', 'a b'], { env })).stdout).toBe(`${home}|--version a b`)
  expect((await run(paths.tbelt, ['--resume'], { env })).stdout).toBe('tbelt|--resume')
  expect((await run(paths['dsh-tui'], ['--resume'], { env })).stdout).toBe('dsh-tui|--resume')
  expect((await run(paths.dsh, [], { env })).stdout).toBe(`${home}|`)
  expect((await readFile(counter, 'utf8')).trim().split('\n')).toHaveLength(1)
  // A replaced AppImage file is a new version: it unpacks again.
  await writeFile(appImage, `${await readFile(appImage, 'utf8')}# updated\n`, { mode: 0o755 })
  await run(paths.dsh, [], { env })
  expect((await readFile(counter, 'utf8')).trim().split('\n')).toHaveLength(2)
})

it.skipIf(process.platform !== 'linux')('fails with a message when the AppImage cannot unpack', async () => {
  const f = await fixture()
  const appImage = join(f.root, 'broken.AppImage')
  await writeFile(appImage, '#!/bin/sh\nexit 1\n', { mode: 0o755 })
  const paths = await writeAppImageWrappers(join(f.root, 'wrappers'), appImage)
  const failure = await run(paths.dsh, [], { env: { ...process.env, DSH_HOME: join(f.root, 'home') } }).catch((error: { code: number; stderr: string }) => error)
  expect(failure).toMatchObject({ code: 1 })
  expect((failure as { stderr: string }).stderr).toContain('could not unpack')
})
