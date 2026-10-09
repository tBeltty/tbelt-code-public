/**
 * Local file access of the terminal client: reading an image to attach and
 * checking a directory. The Host process and the terminal share one machine,
 * so these read the person's own files directly.
 * @module @deepseek-ai/dsh-terminal-client/files
 */
import { readFile, stat } from 'node:fs/promises'
import { attachedImageName, sniffImageType, t } from '@deepseek-ai/dsh-terminal-views'

/** An image read from disk, ready to send as a prompt part. */
export interface LoadedImage {
  readonly mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  /** Encoded file bytes, base64. */
  readonly base64: string
  /** File name without its directory. */
  readonly name: string
  /** Encoded size in bytes. */
  readonly bytes: number
}

/** File access the terminal depends on. */
export interface TerminalFiles {
  /**
   * Read an image to attach.
   * @param path - absolute path.
   * @returns the image.
   * @throws an Error whose message says why the file cannot be attached: missing, not a file, too large, or not an image.
   */
  readImage(path: string): Promise<LoadedImage>
  /**
   * Check a directory.
   * @param path - absolute path.
   * @returns whether a directory exists there.
   * @throws when the path cannot be examined for a reason other than being absent, such as a permission error.
   */
  isDirectory(path: string): Promise<boolean>
}

/** `20 MB` style size for the limit message. */
function limitText(bytes: number): string {
  return `${String(Math.round(bytes / (1024 * 1024)))} MB`
}

/**
 * Local file access over `node:fs`.
 * @param maxImageBytes - largest image file the person may attach.
 * @returns file access for the runner.
 */
export function nodeFiles(maxImageBytes: number): TerminalFiles {
  return {
    async readImage(path) {
      const info = await stat(path)
      if (!info.isFile()) throw new Error(t('attach.notFile'))
      if (info.size > maxImageBytes) throw new Error(t('attach.tooLarge', { limit: limitText(maxImageBytes) }))
      const bytes = await readFile(path)
      const mediaType = sniffImageType(bytes)
      if (mediaType === undefined) throw new Error(t('attach.unsupported'))
      return { mediaType, base64: bytes.toString('base64'), name: attachedImageName(path), bytes: bytes.length }
    },
    async isDirectory(path) {
      try {
        return (await stat(path)).isDirectory()
      } catch (error) {
        const { code } = error as NodeJS.ErrnoException
        if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error
        return false
      }
    },
  }
}
