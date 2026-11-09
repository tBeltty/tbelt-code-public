/**
 * Images in the terminal: detects which inline-image protocol the terminal
 * speaks and draws one image with it, or as a one-line text marker.
 * @module @deepseek-ai/dsh-terminal-views/images
 */
import { t } from './copy.ts'
import type { Style } from './ansi.ts'
import { sanitizeOutput } from './tool-lines.ts'

/** Inline-image protocol a terminal speaks; `none` draws the text marker. */
export type ImageProtocol = 'kitty' | 'iterm2' | 'none'

/** The `images` setting: detect from the environment, force a protocol, or never draw. */
export type ImageSetting = 'auto' | 'kitty' | 'iterm2' | 'off'

/** Media types the Host accepts for attached images. */
export type AttachableImageType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

/** One image to show. */
export interface ImageFacts {
  readonly mediaType: string
  /** Encoded image bytes, base64. */
  readonly base64: string
  /** Encoded size in bytes. */
  readonly bytes: number
  readonly name?: string | undefined
  readonly width?: number | undefined
  readonly height?: number | undefined
}

const ESC = '\u001B'
const BEL = '\u0007'
/** Largest base64 payload of one Kitty graphics chunk. */
const KITTY_CHUNK = 4096
/** Narrowest and widest inline image, in terminal cells. */
const MIN_CELLS = 10
const MAX_CELLS = 60

/**
 * Choose the protocol for this terminal.
 * @param setting - the configured choice; `auto` reads `env`.
 * @param env - process environment.
 * @returns the protocol to draw with. Under tmux or screen the sequences would need passthrough, so `auto` falls back to the marker there.
 */
export function detectImageProtocol(setting: ImageSetting, env: Readonly<Record<string, string | undefined>>): ImageProtocol {
  switch (setting) {
    case 'off': return 'none'
    case 'kitty': return 'kitty'
    case 'iterm2': return 'iterm2'
    case 'auto': break
  }
  if ((env['TMUX'] ?? '') !== '' || (env['STY'] ?? '') !== '') return 'none'
  const program = env['TERM_PROGRAM']
  if (program === 'iTerm.app' || program === 'WezTerm') return 'iterm2'
  if (env['TERM'] === 'xterm-kitty' || (env['KITTY_WINDOW_ID'] ?? '') !== '' || program === 'ghostty') return 'kitty'
  return 'none'
}

/** `12 KB` style size. */
function sizeText(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * One-line description of an image.
 * @param style - text styles.
 * @param facts - the image.
 * @returns a dim line such as `[image screenshot.png · 800×600 · 24 KB]`, without a trailing newline.
 */
export function imageMarker(style: Style, facts: ImageFacts): string {
  const parts: string[] = []
  if (facts.name !== undefined && facts.name !== '') parts.push(sanitizeOutput(facts.name))
  if (facts.width !== undefined && facts.height !== undefined) parts.push(`${String(facts.width)}×${String(facts.height)}`)
  parts.push(sizeText(facts.bytes))
  return style.dim(t('image.marker', { details: parts.join(' · ') }))
}

/** Cells an inline image spans for a terminal of `columns` cells. */
function cellsFor(columns: number): number {
  return Math.max(MIN_CELLS, Math.min(MAX_CELLS, Math.floor(columns / 2)))
}

/** Kitty graphics sequence for a PNG, chunked as the protocol requires. */
function kittySequence(base64: string, cells: number): string {
  let out = ''
  for (let offset = 0; offset < base64.length; offset += KITTY_CHUNK) {
    const chunk = base64.slice(offset, offset + KITTY_CHUNK)
    const more = offset + KITTY_CHUNK < base64.length ? 1 : 0
    const control = offset === 0 ? `a=T,f=100,q=2,c=${String(cells)},m=${String(more)}` : `m=${String(more)}`
    out += `${ESC}_G${control};${chunk}${ESC}\\`
  }
  return out
}

/** iTerm2 inline-image sequence; the name travels as base64 so it cannot end the sequence. */
function iterm2Sequence(facts: ImageFacts, cells: number): string {
  const name = Buffer.from(facts.name ?? 'image', 'utf8').toString('base64')
  return `${ESC}]1337;File=inline=1;size=${String(facts.bytes)};name=${name};width=${String(cells)};preserveAspectRatio=1:${facts.base64}${BEL}`
}

/**
 * Draw an image for the terminal.
 * @param protocol - the protocol from {@link detectImageProtocol}.
 * @param style - text styles.
 * @param columns - terminal width in cells.
 * @param facts - the image.
 * @returns text ending in a newline: the image followed by the marker, or the marker alone.
 *   Kitty decodes PNG only, so other formats under Kitty return the marker alone.
 */
export function renderImage(protocol: ImageProtocol, style: Style, columns: number, facts: ImageFacts): string {
  const marker = `${imageMarker(style, facts)}\n`
  const cells = cellsFor(columns)
  if (protocol === 'iterm2') return `${iterm2Sequence(facts, cells)}\n${marker}`
  if (protocol === 'kitty' && facts.mediaType === 'image/png') return `${kittySequence(facts.base64, cells)}\n${marker}`
  return marker
}

/**
 * Identify an attachable image by its first bytes; a file extension proves nothing.
 * @param bytes - the start of the file.
 * @returns the media type, or undefined when the bytes are not PNG, JPEG, WebP or GIF.
 */
export function sniffImageType(bytes: Uint8Array): AttachableImageType | undefined {
  const starts = (signature: readonly number[], offset = 0): boolean =>
    signature.every((byte, index) => bytes[offset + index] === byte)
  if (starts([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return 'image/png'
  if (starts([0xFF, 0xD8, 0xFF])) return 'image/jpeg'
  if (starts([0x47, 0x49, 0x46, 0x38])) return 'image/gif'
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'
  return undefined
}

/**
 * Display name of an attached file.
 * @param path - the file's path, with either kind of separator.
 * @returns the last path segment; the Host stores only this name, never the directory.
 */
export function attachedImageName(path: string): string {
  return path.split(/[\\/]/u).filter(part => part !== '').at(-1) ?? 'image'
}
