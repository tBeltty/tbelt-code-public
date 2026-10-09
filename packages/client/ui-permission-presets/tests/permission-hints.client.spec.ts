import { describe, expect, it } from 'vitest'
import { presetHintKey } from '../src/client/presentation.ts'

describe('presetHintKey', () => {
  it('describes each built-in preset under its built-in or default name', () => {
    expect(presetHintKey('read-only', 'read-only')).toBe('hint.readOnly')
    expect(presetHintKey('workspace-write', 'Workspace Write')).toBe('hint.workspaceWrite')
    expect(presetHintKey('danger-full-access', 'danger-full-access')).toBe('hint.fullAccess')
  })

  it('gives a host-renamed preset no built-in hint, since the host may have redefined it', () => {
    expect(presetHintKey('workspace-write', 'Project Files')).toBeUndefined()
  })

  it('gives a host-defined preset no hint', () => {
    expect(presetHintKey('custom-mode', 'custom-mode')).toBeUndefined()
  })
})
