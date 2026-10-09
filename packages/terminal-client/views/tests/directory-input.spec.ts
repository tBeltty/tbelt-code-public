import { describe, expect, it } from 'vitest'
import { pastedPath, resolveTypedPath } from '../src/directory-input.ts'

const facts = { base: '/work/app', home: '/home/me' }

describe('pastedPath', () => {
  it('strips whitespace, matching quotes and escaped spaces', () => {
    expect(pastedPath('  /a/b  ')).toBe('/a/b')
    expect(pastedPath('"/a/my dir"')).toBe('/a/my dir')
    expect(pastedPath('\'/a/my dir\'')).toBe('/a/my dir')
    expect(pastedPath('/a/my\\ dir')).toBe('/a/my dir')
    expect(pastedPath('"/a/b')).toBe('"/a/b')
  })
})

describe('resolveTypedPath', () => {
  it('uses the base directory for empty input', () => {
    expect(resolveTypedPath('  ', facts)).toBe('/work/app')
  })

  it('expands the home directory', () => {
    expect(resolveTypedPath('~', facts)).toBe('/home/me')
    expect(resolveTypedPath('~/code/x', facts)).toBe('/home/me/code/x')
    expect(resolveTypedPath('~\\code', facts)).toBe('/home/me/code')
  })

  it('leaves ~ alone when no home is known', () => {
    expect(resolveTypedPath('~/x', { base: '/work/app' })).toBe('/work/app/~/x')
    expect(resolveTypedPath('~', { base: '/work/app' })).toBe('/work/app/~')
  })

  it('resolves relative paths against the base and normalizes absolute ones', () => {
    expect(resolveTypedPath('../other', facts)).toBe('/work/other')
    expect(resolveTypedPath('sub', facts)).toBe('/work/app/sub')
    expect(resolveTypedPath('/srv//data/../logs', facts)).toBe('/srv/logs')
    expect(resolveTypedPath('"/srv/my dir"', facts)).toBe('/srv/my dir')
  })
})
