import { describe, expect, it } from 'vitest'
import { EXEMPT_MARKER, findCopyViolations, scanRepository } from './verify-client-ui-i18n.ts'

const violations = (code: string): string[] => findCopyViolations('x.tsx', code).map(v => `${String(v.line)} ${v.what}: ${v.text}`)

describe('client UI copy', () => {
  it('takes every visible string from the dictionaries', () => {
    expect(scanRepository()).toEqual([])
  })

  it('accepts dictionary lookups, symbols and numbers', () => {
    expect(violations('const a = <p title={t("a")}>{t("b")} · 12% <b>{count}</b></p>')).toEqual([])
  })

  it('rejects text that renders in every language', () => {
    expect(violations('const a = <button>Save</button>')).toEqual(['1 JSX text: Save'])
    expect(violations('const a = <p>{"Save"}</p>')).toEqual(['1 string child: Save'])
    expect(violations('const a = <input placeholder="Search files" />')).toEqual(['1 placeholder attribute: Search files'])
    expect(violations('const a = <img alt={`Preview`} />')).toEqual(['1 alt attribute: Preview'])
    expect(violations('const a = <p>\n  Guardar\n</p>')).toEqual(['2 JSX text: Guardar'])
  })

  it('accepts a literal that states why it is not product copy', () => {
    expect(violations(`const a = (\n  // ${EXEMPT_MARKER} sample host name\n  <input placeholder="acme-gateway" />\n)`)).toEqual([])
    expect(violations(`const a = <input placeholder="acme-gateway" /> // ${EXEMPT_MARKER} sample host name`)).toEqual([])
  })
})
