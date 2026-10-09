/**
 * Local file access of the terminal client: reading a file or image to attach
 * and checking a directory. The Host process and the terminal share one machine,
 * so these read the person's own files directly.
 * @module @deepseek-ai/dsh-terminal-client/files
 */
import { readFile, stat } from 'node:fs/promises'
import { attachedFileName, attachedImageName, sniffImageType, t } from '@deepseek-ai/dsh-terminal-views'

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

/** A file read from disk. */
export interface LoadedFile {
  /** File name without its directory. */
  readonly name: string
  readonly data: Uint8Array
}

/** What `/attach` read: an image, sent as an image part, or any other file, uploaded first. */
export type LoadedAttachment =
  | { readonly kind: 'image'; readonly image: LoadedImage }
  | { readonly kind: 'file'; readonly file: LoadedFile }

/** File access the terminal depends on. */
export interface TerminalFiles {
  /**
   * Read a file to attach. An image is recognized by its first bytes, never by its extension.
   * @param path - absolute path.
   * @returns the image when the bytes are a PNG, JPEG, WebP or GIF, otherwise the file as it is.
   * @throws an Error whose message says why the file cannot be attached: missing, not a file, or larger than the limit for its kind.
   */
  readAttachment(path: string): Promise<LoadedAttachment>
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
 * @param maxFileBytes - largest other file the person may attach.
 * @returns file access for the runner.
 */
export function nodeFiles(maxImageBytes: number, maxFileBytes: number): TerminalFiles {
  return {
    async readAttachment(path) {
      const info = await stat(path)
      if (!info.isFile()) throw new Error(t('attach.notFile'))
      const largest = Math.max(maxImageBytes, maxFileBytes)
      if (info.size > largest) throw new Error(t('attach.tooLarge', { limit: limitText(largest) }))
      const bytes = await readFile(path)
      const mediaType = sniffImageType(bytes)
      if (mediaType !== undefined) {
        if (info.size > maxImageBytes) throw new Error(t('attach.tooLarge', { limit: limitText(maxImageBytes) }))
        return { kind: 'image', image: { mediaType, base64: bytes.toString('base64'), name: attachedImageName(path), bytes: bytes.length } }
      }
      if (info.size > maxFileBytes) throw new Error(t('attach.tooLarge', { limit: limitText(maxFileBytes) }))
      return { kind: 'file', file: { name: attachedFileName(path), data: bytes } }
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
