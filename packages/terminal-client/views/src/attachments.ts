/**
 * Attachments: how a file the person adds to a message is named.
 * @module @deepseek-ai/dsh-terminal-views/attachments
 */

/**
 * The name the Host stores for an attached file.
 * @param path - the file's path, with either kind of separator.
 * @returns the last path segment.
 */
export function attachedFileName(path: string): string {
  return path.split(/[\\/]/u).filter(part => part !== '').at(-1) ?? 'file'
}
