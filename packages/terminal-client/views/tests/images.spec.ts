import { describe, expect, it } from 'vitest'
import { createStyle } from '../src/ansi.ts'
import { attachedImageName, detectImageProtocol, imageMarker, renderImage, sniffImageType } from '../src/images.ts'
import type { ImageFacts } from '../src/images.ts'

const style = createStyle(false)
const png: ImageFacts = { mediaType: 'image/png', base64: 'QUJD', bytes: 3, name: 'a.png', width: 2, height: 1 }

describe('detectImageProtocol', () => {
  it('honours a forced setting and off', () => {
    expect(detectImageProtocol('kitty', {})).toBe('kitty')
    expect(detectImageProtocol('iterm2', { TMUX: '1' })).toBe('iterm2')
    expect(detectImageProtocol('off', { TERM_PROGRAM: 'iTerm.app' })).toBe('none')
  })

  it('detects terminals from the environment', () => {
    expect(detectImageProtocol('auto', { TERM_PROGRAM: 'iTerm.app' })).toBe('iterm2')
    expect(detectImageProtocol('auto', { TERM_PROGRAM: 'WezTerm' })).toBe('iterm2')
    expect(detectImageProtocol('auto', { TERM: 'xterm-kitty' })).toBe('kitty')
    expect(detectImageProtocol('auto', { KITTY_WINDOW_ID: '4' })).toBe('kitty')
    expect(detectImageProtocol('auto', { TERM_PROGRAM: 'ghostty' })).toBe('kitty')
    expect(detectImageProtocol('auto', { TERM: 'xterm-256color' })).toBe('none')
  })

  it('does not draw through a multiplexer', () => {
    expect(detectImageProtocol('auto', { TMUX: '/tmp/tmux', TERM_PROGRAM: 'iTerm.app' })).toBe('none')
    expect(detectImageProtocol('auto', { STY: '123.pts', TERM: 'xterm-kitty' })).toBe('none')
  })
})

describe('imageMarker', () => {
  it('lists the name, the size in pixels and the encoded size', () => {
    expect(imageMarker(style, png)).toBe('[image a.png · 2×1 · 3 B]')
    expect(imageMarker(style, { ...png, bytes: 2048 })).toContain('2 KB')
    expect(imageMarker(style, { ...png, bytes: 3 * 1024 * 1024 })).toContain('3.0 MB')
  })

  it('omits what is unknown and strips control characters from the name', () => {
    expect(imageMarker(style, { mediaType: 'image/png', base64: '', bytes: 1 })).toBe('[image 1 B]')
    expect(imageMarker(style, { ...png, name: 'a\u001B[2Jb.png', width: undefined })).not.toContain('\u001B')
  })
})

describe('renderImage', () => {
  it('draws a PNG with Kitty graphics in 4096-character chunks', () => {
    const big = { ...png, base64: 'A'.repeat(4096 + 10) }
    const out = renderImage('kitty', style, 100, big)
    const chunks = out.match(/\u001B_G[^\u001B]*\u001B\\/gu) ?? []
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toMatch(/^\u001B_Ga=T,f=100,q=2,c=50,m=1;A{4096}\u001B\\$/u)
    expect(chunks[1]).toBe(`\u001B_Gm=0;${'A'.repeat(10)}\u001B\\`)
    expect(out.endsWith('[image a.png · 2×1 · 3 B]\n')).toBe(true)
  })

  it('sends one Kitty chunk when the payload is small', () => {
    expect(renderImage('kitty', style, 80, png)).toContain('\u001B_Ga=T,f=100,q=2,c=40,m=0;QUJD\u001B\\')
  })

  it('shows other formats as the marker under Kitty, which only decodes PNG', () => {
    expect(renderImage('kitty', style, 80, { ...png, mediaType: 'image/jpeg' })).toBe('[image a.png · 2×1 · 3 B]\n')
  })

  it('draws any format with iTerm2 and encodes the name', () => {
    const out = renderImage('iterm2', style, 200, { ...png, mediaType: 'image/webp' })
    expect(out).toContain(`\u001B]1337;File=inline=1;size=3;name=${Buffer.from('a.png').toString('base64')};width=60;preserveAspectRatio=1:QUJD\u0007`)
    expect(renderImage('iterm2', style, 4, { mediaType: 'image/gif', base64: 'QQ==', bytes: 1 })).toContain('name=aW1hZ2U=;width=10')
  })

  it('shows only the marker without a protocol', () => {
    expect(renderImage('none', style, 80, png)).toBe('[image a.png · 2×1 · 3 B]\n')
  })
})

describe('sniffImageType', () => {
  const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values)
  it('recognises the four attachable formats from their first bytes', () => {
    expect(sniffImageType(bytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0))).toBe('image/png')
    expect(sniffImageType(bytes(0xFF, 0xD8, 0xFF, 0xE0))).toBe('image/jpeg')
    expect(sniffImageType(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe('image/gif')
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe('image/webp')
  })

  it('refuses everything else, including a RIFF file that is not WebP and a short file', () => {
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45))).toBeUndefined()
    expect(sniffImageType(bytes(0x25, 0x50, 0x44, 0x46))).toBeUndefined()
    expect(sniffImageType(bytes())).toBeUndefined()
  })
})

describe('attachedImageName', () => {
  it('keeps the last segment of either kind of path', () => {
    expect(attachedImageName('/home/me/pics/a.png')).toBe('a.png')
    expect(attachedImageName('C:\\Users\\me\\a b.png')).toBe('a b.png')
    expect(attachedImageName('dir/')).toBe('dir')
    expect(attachedImageName('/')).toBe('image')
  })
})
