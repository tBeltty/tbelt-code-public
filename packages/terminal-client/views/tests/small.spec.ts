import { approvalModel } from '@deepseek-ai/dsh-presentation-approval'
import { describe, expect, it } from 'vitest'
import { createStyle } from '../src/ansi.ts'
import { approvalKeyChoice, approvalPromptLines } from '../src/approval.ts'
import { copyKey, t } from '../src/copy.ts'
import { helpLines } from '../src/help.ts'
import { classifyInput } from '../src/input.ts'
import { chooseSession, type OpenCandidate } from '../src/session-open.ts'
import { bannerLines, farewellLine, shortSessionId, workingLine } from '../src/status.ts'

const style = createStyle(false)

describe('copy', () => {
  it('fills placeholders and leaves missing ones visible', () => {
    expect(t('open.noMatch', { id: 'ab' })).toBe('No session matches "ab".')
    expect(t('open.noMatch')).toBe('No session matches "{id}".')
  })

  it('accepts presenter keys and rejects unknown ones', () => {
    expect(copyKey('need.shell')).toBe('need.shell')
    expect(() => copyKey('need.nothing' as never)).toThrow('lacks the key')
  })
})

describe('approval', () => {
  it('draws the sentence, the reason, the technical detail and the keys', () => {
    const lines = approvalPromptLines(style, approvalModel({ toolName: 'bash', callId: 'c1', reason: 'It installs a package' }))
    expect(lines).toHaveLength(4)
    expect(lines[0]).toMatch(/^\? /u)
    expect(lines[1]).toContain('It installs a package')
    expect(lines[2]).toContain('bash')
    expect(lines[2]).toContain('c1')
  })

  it('omits the reason and the call id when absent', () => {
    const lines = approvalPromptLines(style, approvalModel({ toolName: 'read' }))
    expect(lines).toHaveLength(3)
    expect(lines[1]).not.toContain('·')
  })

  it('maps keys to decisions', () => {
    const text = (value: string) => ({ type: 'text', text: value }) as const
    const key = (name: 'enter' | 'escape' | 'tab') => ({ type: 'key', name }) as const
    expect(approvalKeyChoice(key('enter'))).toBe('allowed-once')
    expect(approvalKeyChoice(text('Y'))).toBe('allowed-once')
    expect(approvalKeyChoice(text('s'))).toBe('allowed-session')
    expect(approvalKeyChoice(text('n'))).toBe('rejected')
    expect(approvalKeyChoice(key('escape'))).toBe('rejected')
    expect(approvalKeyChoice(key('tab'))).toBeUndefined()
    expect(approvalKeyChoice(text('x'))).toBeUndefined()
    expect(approvalKeyChoice({ type: 'paste', text: 'y' })).toBeUndefined()
  })
})

describe('help, status and input', () => {
  it('lists keys and commands', () => {
    expect(helpLines(style)).toHaveLength(39)
  })

  it('draws the banner and farewell with short ids', () => {
    const fresh = bannerLines(style, { sessionId: 'abcdef1234567890', cwd: '/home/me/app', home: '/home/me', resumed: false })
    expect(fresh[1]).toBe('New session abcdef12 in ~/app')
    expect(bannerLines(style, { sessionId: 'abcdef1234567890', cwd: '/x', resumed: true })[1]).toContain('Resumed session abcdef12')
    expect(farewellLine(style, 'abcdef1234567890')).toContain('--resume abcdef12')
    expect(workingLine(style, false)).not.toBe(workingLine(style, true))
  })

  it('classifies submitted lines', () => {
    expect(classifyInput('hello')).toEqual({ kind: 'prompt', text: 'hello' })
    expect(classifyInput('/help')).toEqual({ kind: 'help' })
    expect(classifyInput('/exit')).toEqual({ kind: 'exit' })
    expect(classifyInput('/quit now')).toEqual({ kind: 'exit' })
    expect(classifyInput('/goal ship it')).toEqual({ kind: 'command', line: '/goal ship it' })
    expect(classifyInput('/sessions')).toEqual({ kind: 'sessions' })
    expect(classifyInput('/model')).toEqual({ kind: 'model', asDefault: false })
    expect(classifyInput('/model default')).toEqual({ kind: 'model', asDefault: true })
    expect(classifyInput('/providers')).toEqual({ kind: 'config', screen: 'providers' })
    expect(classifyInput('/permissions')).toEqual({ kind: 'config', screen: 'permissions' })
    expect(classifyInput('/rename  Fix the build ')).toEqual({ kind: 'rename', title: 'Fix the build' })
    expect(classifyInput('/rename')).toEqual({ kind: 'rename', title: '' })
    expect(classifyInput('/new ~/work')).toEqual({ kind: 'new', directory: '~/work' })
    expect(classifyInput('/attach a b.png')).toEqual({ kind: 'attach', path: 'a b.png' })
    expect(classifyInput('/detach')).toEqual({ kind: 'detach' })
    expect(classifyInput('/queue')).toEqual({ kind: 'panel', panel: 'queue', argument: '' })
    expect(classifyInput('/open src/app')).toEqual({ kind: 'panel', panel: 'open', argument: 'src/app' })
    expect(classifyInput('/goal')).toEqual({ kind: 'panel', panel: 'goal', argument: '' })
    expect(classifyInput('/budget')).toEqual({ kind: 'panel', panel: 'budget', argument: '' })
    expect(classifyInput('/budget 5')).toEqual({ kind: 'command', line: '/budget 5' })
    expect(classifyInput('/feedback great')).toEqual({ kind: 'command', line: '/feedback great' })
    expect(classifyInput('/plan')).toEqual({ kind: 'command', line: '/plan' })
    expect(classifyInput('/plan show')).toEqual({ kind: 'panel', panel: 'plan', argument: 'show' })
    expect(classifyInput('/ path')).toEqual({ kind: 'prompt', text: '/ path' })
    expect(classifyInput('/help\nmore')).toEqual({ kind: 'prompt', text: '/help\nmore' })
  })
})

describe('chooseSession', () => {
  const row = (id: string, extra: Partial<OpenCandidate> = {}): OpenCandidate =>
    ({ id, cwd: '/work', blank: false, updatedAt: 1, ...extra })
  const catalog = [
    row('aaaa1111', { updatedAt: 5 }),
    row('aaaa2222', { updatedAt: 9, blank: true }),
    row('bbbb1111', { updatedAt: 7 }),
    row('cccc1111', { updatedAt: 99, origin: 'subagent' }),
    row('dddd1111', { cwd: '/other', updatedAt: 50 }),
  ]

  it('starts a new session by default', () => {
    expect(chooseSession({ continueLatest: false, cwd: '/work' }, catalog)).toEqual({ kind: 'new' })
  })

  it('resumes by exact id or unique prefix', () => {
    expect(chooseSession({ resume: 'bbbb1111', continueLatest: false, cwd: '/work' }, catalog)).toEqual({ kind: 'resume', sessionId: 'bbbb1111' })
    expect(chooseSession({ resume: 'bb', continueLatest: false, cwd: '/work' }, catalog)).toEqual({ kind: 'resume', sessionId: 'bbbb1111' })
  })

  it('reports no match, an empty id and ambiguity', () => {
    expect(chooseSession({ resume: 'zz', continueLatest: false, cwd: '/work' }, catalog)).toMatchObject({ kind: 'error', message: expect.stringContaining('No session matches') })
    expect(chooseSession({ resume: 'cccc', continueLatest: false, cwd: '/work' }, catalog)).toMatchObject({ kind: 'error' })
    expect(chooseSession({ resume: '', continueLatest: false, cwd: '/work' }, [row('a')])).toMatchObject({ kind: 'error', message: expect.stringContaining('No session matches') })
    expect(chooseSession({ resume: 'a', continueLatest: false, cwd: '/work' }, catalog)).toMatchObject({ kind: 'error', message: expect.stringContaining('aaaa1111, aaaa2222') })
  })

  it('matches the part of a session-prefixed id that the banner shows', () => {
    const prefixed = [row('session-3f9a0c1e-1111'), row('session-77aa0000-2222')]
    expect(chooseSession({ resume: '3f9a', continueLatest: false, cwd: '/work' }, prefixed)).toEqual({ kind: 'resume', sessionId: 'session-3f9a0c1e-1111' })
    expect(chooseSession({ resume: 'session-77', continueLatest: false, cwd: '/work' }, prefixed)).toEqual({ kind: 'resume', sessionId: 'session-77aa0000-2222' })
    expect(shortSessionId('session-3f9a0c1e-1111')).toBe('3f9a0c1e')
  })

  it('continues the latest non-blank session of the directory', () => {
    expect(chooseSession({ continueLatest: true, cwd: '/work' }, catalog)).toEqual({ kind: 'resume', sessionId: 'bbbb1111' })
    expect(chooseSession({ continueLatest: true, cwd: '/work' }, [row('x', { updatedAt: 9 }), row('y', { updatedAt: 3 })])).toEqual({ kind: 'resume', sessionId: 'x' })
    expect(chooseSession({ continueLatest: true, cwd: '/empty' }, catalog)).toMatchObject({ kind: 'error', message: expect.stringContaining('/empty') })
  })
})
