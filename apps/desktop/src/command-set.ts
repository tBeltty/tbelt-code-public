/** The `dsh` command and its `tbelt` and `dsh-tui` aliases as one managed set; Linux adds the AppImage wrapper scripts both link to. */

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import {
  inspectFileCommand, installFileCommand, removeFileCommand,
  type CommandInspection, type FileCommandInstallation,
} from './command-installation.ts'

/** Aliases that run `dsh terminal`; `dsh-tui` is the name Orca looks for on the PATH. */
export const ALIAS_COMMANDS = ['tbelt', 'dsh-tui'] as const

/** Name of one terminal client alias. */
export type AliasCommand = typeof ALIAS_COMMANDS[number]

/** Link locations of the commands; `dsh` carries the user's decision and each alias follows it. */
export interface CommandSet {
  readonly dsh: FileCommandInstallation
  readonly aliases: Readonly<Record<AliasCommand, FileCommandInstallation>>
}

/** Operation requested from the command-management worker. */
export type CommandOperation = 'inspect' | 'install' | 'remove'

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

/**
 * Shell script that runs one bundled launcher from an AppImage.
 *
 * An AppImage mounts at a different path on every launch, so a link cannot point into it. The script unpacks the
 * AppImage once per file version under the application home (no FUSE needed) and runs the unpacked launcher.
 * @param appImage - Absolute path of the AppImage file.
 * @param command - Bundled launcher to run: `dsh`, or a terminal client alias.
 * @returns POSIX shell source.
 */
export function appImageWrapper(appImage: string, command: 'dsh' | AliasCommand): string {
  return `#!/bin/sh
# Written by tBelt Code for Manage dsh Command. Repair or remove it from there instead of editing it.
appimage=${shellQuote(appImage)}
if [ ! -f "$appimage" ]; then
  echo "tBelt Code: $appimage was moved or removed. Open tBelt Code and choose Manage dsh Command, then Repair." >&2
  exit 127
fi
case \${DSH_HOME:-} in
  *[![:space:]]*) ;;
  *) DSH_HOME=$HOME/.tbelt-code; export DSH_HOME ;;
esac
runtimes=$DSH_HOME/cli-runtime
key=$(stat -c '%s-%Y' "$appimage")
root=$runtimes/$key
launcher=$root/resources/runtime/cli/bin/${command}
if [ ! -x "$launcher" ]; then
  mkdir -p "$runtimes"
  staging=$(mktemp -d "$runtimes/.extract.XXXXXX")
  if ! (cd "$staging" && "$appimage" --appimage-extract > /dev/null); then
    rm -rf "$staging"
    echo "tBelt Code: could not unpack $appimage" >&2
    exit 1
  fi
  [ -e "$root" ] || mv "$staging/squashfs-root" "$root" 2> /dev/null
  rm -rf "$staging"
  find "$runtimes" -mindepth 1 -maxdepth 1 -type d ! -name "$key" -mtime +1 -exec rm -rf {} +
fi
exec "$launcher" "$@"
`
}

/**
 * Write the `dsh` and alias wrapper scripts for an AppImage.
 * @param directory - Directory under the application home that holds the scripts.
 * @param appImage - Absolute path of the AppImage file.
 * @returns the script paths, in the shape a {@link CommandSet} links to.
 */
export async function writeAppImageWrappers(directory: string, appImage: string): Promise<Record<'dsh' | AliasCommand, string>> {
  await mkdir(directory, { recursive: true })
  const paths = { dsh: join(directory, 'dsh'), tbelt: join(directory, 'tbelt'), 'dsh-tui': join(directory, 'dsh-tui') }
  for (const command of ['dsh', ...ALIAS_COMMANDS] as const) {
    await writeFileAtomic(paths[command], appImageWrapper(appImage, command), { mode: 0o755 })
  }
  return paths
}

/**
 * Run one management operation. An alias never replaces or removes a command it does not own: an
 * existing `tbelt` or `dsh-tui` from another installation is left alone, and the dialog reports only `dsh`.
 * @param set - Link locations of the commands.
 * @param operation - Requested operation.
 * @param expected - Fingerprint of the `dsh` state the user confirmed; required for install and remove.
 * @returns State of the `dsh` command after the operation.
 */
export async function runCommandSet(set: CommandSet, operation: CommandOperation, expected: string): Promise<CommandInspection> {
  if (operation === 'inspect') return inspectFileCommand(set.dsh)
  if (operation === 'remove') {
    const state = await removeFileCommand(set.dsh, expected)
    for (const alias of Object.values(set.aliases)) await removeFileCommand(alias, (await inspectFileCommand(alias)).fingerprint)
    return state
  }
  const state = await installFileCommand(set.dsh, expected)
  for (const alias of Object.values(set.aliases)) {
    const inspection = await inspectFileCommand(alias)
    if (inspection.kind === 'missing' || inspection.managed) await installFileCommand(alias, inspection.fingerprint)
  }
  return state
}
