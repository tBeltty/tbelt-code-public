import { describe, expect, it } from 'vitest'
import { ApprovalGrants, approvalModel, approvalOutcome, approvalScopeKey } from '../src/index.ts'

describe('approvalModel', () => {
  it.each([
    ['bash', 'need.shell'],
    ['pwsh', 'need.shell'],
    ['write', 'need.edit'],
    ['edit', 'need.edit'],
    ['read', 'need.read'],
    ['web_fetch', 'need.read'],
    ['grep', 'need.search'],
    ['run_code', 'need.code'],
    ['cordis_run', 'need.generic'],
    ['some_plugin_tool', 'need.generic'],
  ])('describes %s in plain language with the key %s', (toolName, needKey) => {
    expect(approvalModel({ toolName }).needKey).toBe(needKey)
  })

  it('keeps the requester reason as the because line and the identifiers in the technical block', () => {
    const model = approvalModel({ toolName: 'bash', callId: 'call-1', reason: 'It writes outside the workspace' })
    expect(model.because).toBe('It writes outside the workspace')
    expect(model.technical).toEqual({ toolName: 'bash', callId: 'call-1', reason: 'It writes outside the workspace' })
  })

  it('has no because line when the requester gave no usable reason', () => {
    expect(approvalModel({ toolName: 'bash' }).because).toBeNull()
    expect(approvalModel({ toolName: 'bash', reason: '   ' }).because).toBeNull()
    expect(approvalModel({ toolName: 'bash', reason: '   ' }).technical.reason).toBeUndefined()
  })

  it('offers allow once as the primary action, allow for the session in its menu, and reject', () => {
    expect(approvalModel({ toolName: 'bash' }).choices).toEqual([
      { id: 'allowed-once', labelKey: 'allowOnce', role: 'primary' },
      { id: 'allowed-session', labelKey: 'allowSession', role: 'menu' },
      { id: 'rejected', labelKey: 'reject', role: 'reject' },
    ])
  })
})

describe('approvalScopeKey', () => {
  it('names the same permission for the same tool and reason', () => {
    expect(approvalModel({ toolName: 'bash', reason: 'net' }).scopeKey).toBe(approvalScopeKey({ toolName: 'bash', reason: 'net' }))
  })

  it('separates tools, reasons and a missing reason', () => {
    const keys = new Set([
      approvalScopeKey({ toolName: 'bash', reason: 'net' }),
      approvalScopeKey({ toolName: 'bash', reason: 'disk' }),
      approvalScopeKey({ toolName: 'edit', reason: 'net' }),
      approvalScopeKey({ toolName: 'bash' }),
    ])
    expect(keys.size).toBe(4)
  })

  it('does not let a tool name run into a reason', () => {
    expect(approvalScopeKey({ toolName: 'a', reason: 'b\nc' })).not.toBe(approvalScopeKey({ toolName: 'a\nb', reason: 'c' }))
  })
})

describe('approvalOutcome', () => {
  it('gives the Host a one-time allow for both allow choices and a rejection otherwise', () => {
    expect(approvalOutcome('allowed-once')).toBe('allowed-once')
    expect(approvalOutcome('allowed-session')).toBe('allowed-once')
    expect(approvalOutcome('rejected')).toBe('rejected')
  })
})

describe('ApprovalGrants', () => {
  it('answers only for permissions that were granted', () => {
    const grants = new ApprovalGrants()
    const key = approvalScopeKey({ toolName: 'bash', reason: 'net' })
    expect(grants.allows(key)).toBe(false)
    grants.grant(key)
    expect(grants.allows(key)).toBe(true)
    expect(grants.allows(approvalScopeKey({ toolName: 'bash', reason: 'disk' }))).toBe(false)
  })

  it('forgets every grant on clear', () => {
    const grants = new ApprovalGrants()
    grants.grant('k')
    grants.clear()
    expect(grants.allows('k')).toBe(false)
  })
})
