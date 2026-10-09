/** Package terminal launch scripts (`dsh` and its `tbelt` and `dsh-tui` aliases) that reuse the installed Electron runtime. */

import { chmodSync, copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Copy the platform launchers into the application's public command directory.
 * @param destination - Physical runtime/cli directory prepared for the application.
 * @param platform - Target Desktop operating system.
 */
export function prepareDesktopCli(destination: string, platform: 'darwin' | 'win32' | 'linux'): void {
  const windows = platform === 'win32'
  mkdirSync(join(destination, 'bin'), { recursive: true })
  // The Linux executable sits beside `resources`, not in a macOS bundle.
  const sources = windows ? { 'dsh.cmd': 'dsh.cmd', 'tbelt.cmd': 'tbelt.cmd', 'dsh-tui.cmd': 'dsh-tui.cmd' }
    : { dsh: platform === 'linux' ? 'dsh-linux' : 'dsh', tbelt: 'tbelt', 'dsh-tui': 'dsh-tui' }
  for (const [name, source] of Object.entries(sources)) {
    const command = join(destination, 'bin', name)
    copyFileSync(join(import.meta.dirname, '..', 'cli', source), command)
    if (!windows) chmodSync(command, 0o755)
  }
}
