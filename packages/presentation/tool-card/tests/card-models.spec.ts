/** Shell, diff, read and search card models from recorded tool calls, on plain Node. */
import { describe, expect, it } from 'vitest'
import { SpillLocator } from '@deepseek-ai/dsh-spill'
import { formatSpillNotice } from '@deepseek-ai/dsh-spill-policy/notice'
import type { StartedToolCall, ToolCallBlock, ToolResultNode } from '@deepseek-ai/dsh-presentation-tool-call'
import {
  diffCardModel, isSettledPersistentShellCall, isSpilledShellCall, readCallLine, readCardModel,
  searchCardModel, terminalCardModel, terminalFailed,
} from '../src/index.ts'

const running = (name: string, args: unknown, over?: Partial<StartedToolCall>): StartedToolCall => ({
  phase: 'start', callId: 'c1', name, argsRaw: typeof args === 'string' ? args : JSON.stringify(args),
  turn: 1, step: 1, time: 1_000, subCalls: [], ...over,
})

const settled = (
  name: string, args: unknown, text: string | undefined, meta?: unknown, over?: Partial<ToolResultNode>,
): ToolResultNode => ({
  kind: 'tool-result', seq: 10, time: 2_000, callId: 'c1',
  call: { name, argsRaw: typeof args === 'string' ? args : JSON.stringify(args) },
  callTime: 1_000,
  content: text === undefined ? [] : [{ type: 'text', text }], isError: false,
  ...meta === undefined ? {} : { meta },
  subCalls: [], ...over,
})

describe('diffCardModel', () => {
  const edit = { file_path: 'a.ts', old_string: 'one', new_string: 'two' }
  const applied = [{ path: 'a.ts', oldText: 'one', newText: 'two' }]

  it('shows the intended edit while the call runs', () => {
    expect(diffCardModel(running('edit', edit))).toEqual({ card: { diffs: [{ path: 'a.ts', oldText: 'one', newText: 'two' }] } })
    expect(diffCardModel(running('edit', { ...edit, old_string: '' }))?.card.diffs[0]?.oldText).toBeNull()
  })

  it('shows a write as a whole new file', () => {
    expect(diffCardModel(running('write', { file_path: 'n.ts', content: 'x' }))?.card.diffs)
      .toEqual([{ path: 'n.ts', oldText: null, newText: 'x' }])
  })

  it('uses the applied hunks of a settled edit and the whole file for a write with empty metadata', () => {
    expect(diffCardModel(settled('edit', edit, 'ok', { diffs: applied }))?.card.diffs).toEqual(applied)
    expect(diffCardModel(settled('write', { file_path: 'n.ts', content: 'x' }, 'ok', { diffs: [] }))?.card.diffs)
      .toEqual([{ path: 'n.ts', oldText: null, newText: 'x' }])
    expect(diffCardModel(settled('write', { file_path: 'n.ts', content: 'x' }, 'ok'))?.card.diffs)
      .toEqual([{ path: 'n.ts', oldText: null, newText: 'x' }])
  })

  it('leaves a settled edit without usable metadata, a failed call and nested calls to the generic row', () => {
    expect(diffCardModel(settled('edit', edit, 'ok'))).toBeNull()
    expect(diffCardModel(settled('edit', edit, 'ok', { diffs: [] }))).toBeNull()
    expect(diffCardModel(settled('edit', edit, 'ok', { diffs: 'x' }))).toBeNull()
    expect(diffCardModel(settled('edit', edit, 'no', { diffs: applied }, { isError: true }))).toBeNull()
    expect(diffCardModel(running('edit', edit, { parentCallId: 'p' }))).toBeNull()
  })

  it.each([
    ['a non-object hunk', ['x']],
    ['a null hunk', [null]],
    ['a hunk without a path', [{ oldText: 'a', newText: 'b' }]],
    ['a hunk with a numeric old text', [{ path: 'a', oldText: 1, newText: 'b' }]],
    ['a hunk without new text', [{ path: 'a', oldText: 'a' }]],
  ])('rejects metadata with %s', (_label, diffs) => {
    expect(diffCardModel(settled('edit', edit, 'ok', { diffs }))).toBeNull()
  })

  it('accepts a hunk with no prior content', () => {
    expect(diffCardModel(settled('edit', edit, 'ok', { diffs: [{ path: 'a', oldText: null, newText: 'b' }] }))?.card.diffs)
      .toEqual([{ path: 'a', oldText: null, newText: 'b' }])
  })

  it.each([
    ['no arguments', running('edit', '{')],
    ['a blank path', running('edit', { ...edit, file_path: ' ' })],
    ['a numeric path', running('edit', { ...edit, file_path: 3 })],
    ['a bad escalation pair', running('edit', { ...edit, sandbox_permissions: 'x' })],
    ['a numeric old string', running('edit', { ...edit, old_string: 1 })],
    ['a numeric new string', running('edit', { ...edit, new_string: 1 })],
    ['a non-boolean replace_all', running('edit', { ...edit, replace_all: 'yes' })],
    ['numeric write content', running('write', { file_path: 'n', content: 1 })],
    ['another tool', running('bash', { file_path: 'n' })],
  ])('has no card for %s', (_label, block) => {
    expect(diffCardModel(block)).toBeNull()
  })

  it('draws str_replace_editor create and replace while running but settles it generically', () => {
    const create = { command: 'create', path: 'n.ts', file_text: 'x' }
    expect(diffCardModel(running('str_replace_editor', create))?.card.diffs)
      .toEqual([{ path: 'n.ts', oldText: null, newText: 'x' }])
    expect(diffCardModel(running('str_replace_editor', { command: 'create', path: 'n.ts' }))?.card.diffs[0]?.newText).toBe('')
    expect(diffCardModel(running('str_replace_editor', { command: 'str_replace', path: 'n.ts', old_str: 'a', new_str: 'b' }))?.card.diffs)
      .toEqual([{ path: 'n.ts', oldText: 'a', newText: 'b' }])
    expect(diffCardModel(running('str_replace_editor', { command: 'str_replace', path: 'n.ts' }))?.card.diffs)
      .toEqual([{ path: 'n.ts', oldText: null, newText: '' }])
    expect(diffCardModel(settled('str_replace_editor', create, 'ok'))).toBeNull()
  })

  it.each([
    { command: 'create', path: ' ' },
    { command: 'create', path: 'n', file_text: 1 },
    { command: 'str_replace', path: 'n', old_str: 1 },
    { command: 'str_replace', path: 'n', new_str: 1 },
    { command: 'view', path: 'n' },
  ])('rejects the str_replace_editor call %j', (args) => {
    expect(diffCardModel(running('str_replace_editor', args))).toBeNull()
  })
})

describe('readCardModel', () => {
  const args = { file_path: '/w/a.ts' }
  const text = '<path>/w/a.ts</path>\n<type>file</type>\n<content>\n1: one\n2: two\n</content>'
  const meta = { path: '/w/a.ts', offset: 1, lines: [{ number: 1, text: 'one' }, { number: 2, text: 'two' }], totalLines: 2, lang: 'ts' }

  it('returns the lines with the label relative to the workspace', () => {
    expect(readCardModel(settled('read', args, text, meta), '/w')).toEqual({
      label: 'a.ts', lines: meta.lines, totalLines: 2, lang: 'ts',
    })
  })

  it('leaves the language absent when the read tool recorded none', () => {
    const { lang: _lang, ...withoutLang } = meta
    expect(readCardModel(settled('read', args, text, withoutLang))?.lang).toBeUndefined()
  })

  it('reports the line a call started at', () => {
    expect(readCallLine(running('read', { ...args, offset: 7 }))).toBe(7)
    expect(readCallLine(running('read', args))).toBeUndefined()
    expect(readCallLine(running('read', { ...args, offset: 0 }))).toBeUndefined()
    expect(readCallLine(running('bash', args))).toBeUndefined()
  })

  it.each([
    ['a running call', running('read', args)],
    ['a failed call', settled('read', args, text, meta, { isError: true })],
    ['another tool', settled('bash', args, text, meta)],
    ['a blank path', settled('read', { file_path: ' ' }, text, meta)],
    ['a zero offset', settled('read', { ...args, offset: 0 }, text, meta)],
    ['a fractional limit', settled('read', { ...args, limit: 1.5 }, text, meta)],
    ['no metadata', settled('read', args, text)],
    ['array metadata', settled('read', args, text, [])],
    ['a numeric metadata path', settled('read', args, text, { ...meta, path: 1 })],
    ['a zero metadata offset', settled('read', args, text, { ...meta, offset: 0 })],
    ['a negative total', settled('read', args, text, { ...meta, totalLines: -1 })],
    ['lines that are not a list', settled('read', args, text, { ...meta, lines: 'x' })],
    ['a numeric language', settled('read', args, text, { ...meta, lang: 1 })],
    ['a line that is not a record', settled('read', args, text, { ...meta, lines: ['x'] })],
    ['a line number below the offset', settled('read', args, text, { ...meta, offset: 3, totalLines: 5, lines: [{ number: 2, text: 'x' }] })],
    ['a line past the total', settled('read', args, text, { ...meta, lines: [{ number: 3, text: 'x' }] })],
    ['a line without text', settled('read', args, text, { ...meta, lines: [{ number: 1 }] })],
    ['content in two blocks', settled('read', args, text, meta, { content: [{ type: 'text', text }, { type: 'text', text }] })],
    ['text outside the read envelope', settled('read', args, 'plain', meta)],
  ])('has no card for %s', (_label, block) => {
    expect(readCardModel(block, '/w')).toBeNull()
  })
})

describe('searchCardModel', () => {
  const grep = { pattern: 'foo', path: 'src', include: '*.{ts,tsx}' }
  const grepMeta = {
    shape: 'matches', truncated: false, total: 1,
    files: [{ path: 'src/a.ts', matches: [{ lineNumber: 3, line: 'foo()' }] }],
  }

  it('groups grep matches by file', () => {
    expect(searchCardModel(settled('grep', grep, 'text', grepMeta))).toEqual({
      recovery: undefined,
      card: { kind: 'matches', truncated: false, total: 1, files: grepMeta.files },
    })
  })

  it('lists glob paths and keeps the full text of a capped result for recovery', () => {
    expect(searchCardModel(settled('glob', { pattern: '*.ts' }, 'a.ts\nb.ts', { shape: 'paths', truncated: true, total: 9, paths: ['a.ts', 'b.ts'] })))
      .toEqual({ recovery: 'a.ts\nb.ts', card: { kind: 'paths', truncated: true, total: 9, paths: ['a.ts', 'b.ts'] } })
    expect(searchCardModel(settled('glob', { pattern: '*.ts' }, undefined, { shape: 'paths', truncated: true, total: 9, paths: [] }))?.recovery)
      .toBeUndefined()
  })

  it.each([
    ['a running call', running('grep', grep)],
    ['a failed call', settled('grep', grep, 'x', grepMeta, { isError: true })],
    ['another tool', settled('read', grep, 'x', grepMeta)],
    ['unparsable arguments', settled('grep', '{', 'x', grepMeta)],
    ['a numeric pattern', settled('grep', { pattern: 1 }, 'x', grepMeta)],
    ['an empty grep pattern', settled('grep', { pattern: '' }, 'x', grepMeta)],
    ['a blank glob pattern', settled('glob', { pattern: ' ' }, 'x', grepMeta)],
    ['a blank path', settled('grep', { pattern: 'a', path: ' ' }, 'x', grepMeta)],
    ['a numeric path', settled('grep', { pattern: 'a', path: 1 }, 'x', grepMeta)],
    ['a numeric include', settled('grep', { pattern: 'a', include: 1 }, 'x', grepMeta)],
    ['a blank include', settled('grep', { pattern: 'a', include: ' ' }, 'x', grepMeta)],
    ['a negated include', settled('grep', { pattern: 'a', include: '!*.ts' }, 'x', grepMeta)],
    ['a comma list include', settled('grep', { pattern: 'a', include: '*.ts,*.js' }, 'x', grepMeta)],
    ['no metadata', settled('grep', grep, 'x')],
    ['array metadata', settled('grep', grep, 'x', [])],
    ['a non-boolean truncated flag', settled('grep', grep, 'x', { ...grepMeta, truncated: 'no' })],
    ['a negative total', settled('grep', grep, 'x', { ...grepMeta, total: -1 })],
    ['the glob shape on grep', settled('grep', grep, 'x', { ...grepMeta, shape: 'paths' })],
    ['files that are not a list', settled('grep', grep, 'x', { ...grepMeta, files: 'x' })],
    ['a file that is not a record', settled('grep', grep, 'x', { ...grepMeta, files: ['x'] })],
    ['a file without matches', settled('grep', grep, 'x', { ...grepMeta, files: [{ path: 'a' }] })],
    ['a match that is not a record', settled('grep', grep, 'x', { ...grepMeta, files: [{ path: 'a', matches: ['x'] }] })],
    ['a match on line zero', settled('grep', grep, 'x', { ...grepMeta, files: [{ path: 'a', matches: [{ lineNumber: 0, line: 'x' }] }] })],
    ['a match without text', settled('grep', grep, 'x', { ...grepMeta, files: [{ path: 'a', matches: [{ lineNumber: 1 }] }] })],
    ['the grep shape on glob', settled('glob', { pattern: '*' }, 'x', grepMeta)],
    ['non-string paths', settled('glob', { pattern: '*' }, 'x', { shape: 'paths', truncated: false, total: 1, paths: [1] })],
  ])('has no card for %s', (_label, block) => {
    expect(searchCardModel(block)).toBeNull()
  })

  it('keeps brace lists in an include and tolerates a stray closing brace', () => {
    expect(searchCardModel(settled('grep', { pattern: 'a', include: '*.{ts,js}' }, 'x', grepMeta))).not.toBeNull()
    expect(searchCardModel(settled('grep', { pattern: 'a', include: '}*.ts' }, 'x', grepMeta))).not.toBeNull()
  })
})

describe('terminalCardModel', () => {
  const bash = { command: 'ls', description: 'List' }

  it('shows a running command with the workspace as its directory', () => {
    expect(terminalCardModel(running('bash', bash), '/w')).toEqual({
      copy: { kind: 'shell', command: 'ls', description: 'List' },
      card: { cwd: '/w', output: undefined, exitCode: undefined, signal: undefined, running: true },
    })
  })

  it('parses the exit marker of a settled command', () => {
    expect(terminalCardModel(settled('bash', bash, 'a\nb\n[exit code: 2]'), '/w')?.card)
      .toEqual({ cwd: '/w', output: 'a\nb', exitCode: 2, signal: undefined, running: false })
    expect(terminalCardModel(settled('bash', bash, 'a\n[killed by signal: SIGTERM]'))?.card)
      .toMatchObject({ output: 'a', signal: 'SIGTERM', exitCode: undefined })
    expect(terminalCardModel(settled('pwsh', bash, 'plain'))?.card).toMatchObject({ output: 'plain', exitCode: 0 })
  })

  it('reports a failing exit or a signal, but not a running or clean command', () => {
    expect(terminalFailed(terminalCardModel(settled('bash', bash, 'x\n[exit code: 1]'))!)).toBe(true)
    expect(terminalFailed(terminalCardModel(settled('bash', bash, 'x\n[killed by signal: SIGKILL]'))!)).toBe(true)
    expect(terminalFailed(terminalCardModel(settled('bash', bash, 'x\n[exit code: 0]'))!)).toBe(false)
    expect(terminalFailed(terminalCardModel(running('bash', bash))!)).toBe(false)
  })

  it('resolves the working directory against the session workspace', () => {
    const dir = (workdir?: string, cwd?: string) => terminalCardModel(running('bash', { ...bash, workdir }), cwd)?.card.cwd
    expect(dir(undefined, '/w')).toBe('/w')
    expect(dir('', '/w')).toBe('/w')
    expect(dir('/abs/./x/..', '/w')).toBe('/abs')
    expect(dir('app', '/w')).toBe('/w/app')
    expect(dir('app/../..', '/w/x')).toBe('/w')
    expect(dir('../up', undefined)).toBe('../up')
    expect(dir('sub', '')).toBe('sub')
    expect(dir(undefined, undefined)).toBeUndefined()
  })

  it('collapses dot segments in Windows and UNC paths without climbing past the root', () => {
    const dir = (workdir: string) => terminalCardModel(running('bash', { ...bash, workdir }), '/w')?.card.cwd
    expect(dir('C:\\a\\..\\b')).toBe('C:\\b')
    expect(dir('C:\\..\\..')).toBe('C:\\')
    expect(dir('\\\\srv\\share\\a\\..\\..\\..')).toBe('\\\\srv\\share')
    expect(dir('\\\\srv\\share\\a\\..\\b')).toBe('\\\\srv\\share\\b')
    expect(dir('/..')).toBe('/')
  })

  it('shows terminal_send text and session', () => {
    const send = { sessionId: 't1', text: 'q', submit: true }
    expect(terminalCardModel(running('terminal_send', send))?.copy).toEqual({ kind: 'terminal-send', text: 'q', sessionId: 't1' })
    expect(terminalCardModel(settled('terminal_send', send, 'echo'))?.card.output).toBe('echo')
  })

  it('has persistent shells omit the description and settle generically', () => {
    const persistent = { command: 'ls' }
    expect(terminalCardModel(running('bash', persistent))?.copy).toMatchObject({ description: undefined })
    expect(terminalCardModel(settled('bash', persistent, 'x'))).toBeNull()
    expect(isSettledPersistentShellCall(settled('bash', persistent, 'x'))).toBe(true)
    expect(isSettledPersistentShellCall(settled('bash', bash, 'x'))).toBe(false)
    expect(isSettledPersistentShellCall(running('bash', persistent))).toBe(false)
    expect(isSettledPersistentShellCall(settled('bash', '{', 'x'))).toBe(false)
    expect(isSettledPersistentShellCall(settled('bash', persistent, 'x', undefined, { parentCallId: 'p' }))).toBe(false)
  })

  it('keeps spilled output generic because its footer can hide the exit marker', () => {
    const spilled = formatSpillNotice({ kind: 'exact', count: 9000 }, {
      locator: SpillLocator('/spill/shell.txt'), retrievalHint: 'Read the saved text.',
    })
    expect(isSpilledShellCall(settled('bash', bash, spilled))).toBe(true)
    expect(terminalCardModel(settled('bash', bash, spilled))).toBeNull()
    expect(isSpilledShellCall(running('bash', bash))).toBe(false)
    expect(isSpilledShellCall(settled('bash', '{', 'x'))).toBe(false)
    expect(isSpilledShellCall(settled('read', bash, 'x'))).toBe(false)
    expect(isSpilledShellCall(settled('bash', { ...bash, run_in_background: true }, 'x'))).toBe(false)
    expect(isSpilledShellCall(settled('bash', bash, undefined))).toBe(false)
  })

  it.each([
    ['unparsable arguments', running('bash', '{')],
    ['another tool', running('read', bash)],
    ['a blank command', running('bash', { ...bash, command: ' ' })],
    ['a bad timeout', running('bash', { ...bash, timeoutMs: 0 })],
    ['a numeric timeout string', running('bash', { ...bash, timeoutMs: 'x' })],
    ['a numeric workdir', running('bash', { ...bash, workdir: 1 })],
    ['a non-boolean background flag', running('bash', { ...bash, run_in_background: 'x' })],
    ['a bad escalation pair', running('bash', { ...bash, sandbox_permissions: 'x' })],
    ['a blank description', running('bash', { ...bash, description: ' ' })],
    ['a numeric description', running('bash', { ...bash, description: 1 })],
    ['a background command', running('bash', { ...bash, run_in_background: true })],
    ['terminal_send without a session', running('terminal_send', { text: 'q' })],
    ['terminal_send with numeric text', running('terminal_send', { sessionId: 't', text: 1 })],
    ['terminal_send with a numeric submit', running('terminal_send', { sessionId: 't', text: 'q', submit: 1 })],
    ['terminal_send in the background', running('terminal_send', { sessionId: 't', text: 'q', run_in_background: true })],
    ['terminal_send with a numeric background flag', running('terminal_send', { sessionId: 't', text: 'q', run_in_background: 1 })],
    ['a failed settled command', settled('bash', bash, 'x', undefined, { isError: true })],
    ['a settled command without text', settled('bash', bash, undefined)],
  ])('has no card for %s', (_label, block: ToolCallBlock) => {
    expect(terminalCardModel(block)).toBeNull()
  })
})
