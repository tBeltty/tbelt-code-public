/**
 * Commands: the rows of the `/commands` list.
 * @module @deepseek-ai/dsh-terminal-views/commands
 */
import type { PickerItem } from './picker.ts'
import { oneLine } from './lines.ts'

/** A command the Host offers. */
export interface CommandRow {
  readonly name: string
  readonly description: string
  readonly input?: { readonly hint: string } | undefined
}

/**
 * Rows of the command list.
 * @param commands - the commands the Host registered for the session.
 * @returns one item per command, named with its argument hint and described as detail.
 */
export function commandItems(commands: readonly CommandRow[]): PickerItem[] {
  return [...commands].sort((a, b) => a.name.localeCompare(b.name)).map(command => ({
    value: command.name,
    label: command.input === undefined ? `/${command.name}` : `/${command.name} ${command.input.hint}`,
    detail: oneLine(command.description),
  }))
}
