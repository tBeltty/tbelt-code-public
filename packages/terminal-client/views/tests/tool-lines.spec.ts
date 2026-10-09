import type { StartedToolCall, ToolResultNode } from '@deepseek-ai/dsh-presentation-tool-call'
import { describe, expect, it } from 'vitest'
import { createStyle } from '../src/ansi.ts'
import { sanitizeOutput, toolCallLine, toolResultLines, type ToolViewContext } from '../src/tool-lines.ts'

const ctx = (over: Partial<ToolViewContext> = {}): ToolViewContext =>
  ({ style: createStyle(false), cwd: '/w', home: '/home/me', columns: 80, maxOutputLines: 3, ...over })

const started = (name: string, args: unknown): StartedToolCall => ({
  phase: 'start', callId: 'c1', name, argsRaw: JSON.stringify(args), turn: 1, step: 1, time: 1, subCalls: [],
})

const settled = (name: string, args: unknown, text: string | undefined, over: Partial<ToolResultNode> = {}): ToolResultNode => ({
  kind: 'tool-result', seq: 2, time: 2, callId: 'c1', call: { name, argsRaw: JSON.stringify(args) }, callTime: 1,
  content: text === undefined ? [] : [{ type: 'text', text }], isError: false, subCalls: [], ...over,
})

describe('sanitizeOutput', () => {
  it('keeps visible text: no escapes, carriage-return rewrites or control bytes', () => {
    expect(sanitizeOutput('a\u001B[31mb\u001B[0m\nprogress 1\rprogress 2\nx\u0007y\tz')).toBe('ab\nprogress 2\nxy\tz')
  })
})

describe('toolCallLine', () => {
  it('shows the title and the summary', () => {
    expect(toolCallLine(ctx(), started('bash', { command: 'ls', description: 'List files' }))).toBe('● Bash  List files')
  })

  it('shows only the title when there is no summary and works for a call still being prepared', () => {
    const preparing = { phase: 'preparing', callId: 'c1', name: 'bash', turn: 1, step: 1, time: 1, subCalls: [] } as const
    expect(toolCallLine(ctx(), preparing)).toMatch(/^● \S/u)
    expect(toolCallLine(ctx(), preparing)).not.toContain('  ')
  })

  it('cuts a long summary to the line', () => {
    const line = toolCallLine(ctx({ columns: 30 }), started('bash', { command: 'x'.repeat(200) }))
    expect(line.length).toBeLessThanOrEqual(30)
  })
})

describe('toolResultLines', () => {
  it('explains an auto-review denial with and without a reason', () => {
    const denied = (reason?: string) => settled('bash', { command: 'rm' }, '', {
      isError: true, error: { name: 'AutoReviewDeniedError', code: 'AUTO_REVIEW_DENIED', ...reason === undefined ? {} : { reason } },
    })
    expect(toolResultLines(ctx(), denied('too risky'))).toEqual(['  ⎿ Auto review rejected this action. Reason: too risky'])
    expect(toolResultLines(ctx(), denied())).toEqual(['  ⎿ Auto review did not allow this action'])
  })

  it('shows a stopped call and an error', () => {
    const stopped = settled('bash', { command: 'sleep' }, '', { isError: true, error: { name: 'E', code: 'interrupted' } })
    expect(toolResultLines(ctx(), stopped)).toEqual(['  ⎿ stopped'])
    const failed = settled('read', { file_path: 'x' }, 'ENOENT: no such file', { isError: true })
    expect(toolResultLines(ctx(), failed)).toEqual(['  ⎿ ENOENT: no such file'])
    expect(toolResultLines(ctx(), settled('read', { file_path: 'x' }, undefined, { isError: true }))).toEqual(['  ⎿ '])
  })

  it('shows the end of shell output and the exit status', () => {
    const lines = toolResultLines(ctx(), settled('bash', { command: 'make', description: 'Build' }, 'a\nb\nc\nd\ne\n[exit code: 2]'))
    expect(lines).toEqual(['  ⎿ … 2 more lines', '    c', '    d', '    e', '    exit 2'])
  })

  it('shows a signal, a clean command without output, and a clean command with output', () => {
    expect(toolResultLines(ctx(), settled('bash', { command: 'x', description: 'Run' }, 'a\n[killed by signal: SIGTERM]'))).toEqual(['  ⎿ a', '    killed by SIGTERM'])
    expect(toolResultLines(ctx(), settled('bash', { command: 'x', description: 'Run' }, ''))).toEqual(['  ⎿ done'])
    expect(toolResultLines(ctx(), settled('bash', { command: 'x', description: 'Run' }, 'ok'))).toEqual(['  ⎿ ok'])
  })

  it('summarizes an edit by added and removed lines', () => {
    const edit = { file_path: 'a.ts', old_string: 'one\n', new_string: 'two\nthree\n' }
    const node = settled('edit', edit, 'ok', { meta: { diffs: [{ path: 'a.ts', oldText: 'one\n', newText: 'two\nthree\n' }] } })
    expect(toolResultLines(ctx(), node)).toEqual(['  ⎿ +2 -1'])
    const same = settled('edit', edit, 'ok', { meta: { diffs: [{ path: 'a.ts', oldText: 'one\n', newText: 'one\n' }] } })
    expect(toolResultLines(ctx(), same)).toEqual(['  ⎿ done'])
  })

  it('colors the diff counts', () => {
    const edit = { file_path: 'a.ts', old_string: 'one\n', new_string: 'two\nthree\n' }
    const node = settled('edit', edit, 'ok', { meta: { diffs: [{ path: 'a.ts', oldText: 'one\n', newText: 'two\nthree\n' }] } })
    expect(toolResultLines(ctx({ style: createStyle(true) }), node)[0]).toContain('\u001B[32m+2\u001B[39m \u001B[31m-1\u001B[39m')
  })

  it('counts the lines of a read', () => {
    const meta = { path: '/w/a.ts', offset: 1, lines: [{ number: 1, text: 'one' }, { number: 2, text: 'two' }], totalLines: 9 }
    expect(toolResultLines(ctx(), settled('read', { file_path: '/w/a.ts' }, '<path>/w/a.ts</path>\n<type>file</type>\n<content>\n1: one\n2: two\n</content>', { meta }))).toEqual(['  ⎿ Read 2 of 9 lines'])
  })

  it('counts search results', () => {
    const matches = { shape: 'matches', truncated: false, total: 3, files: [{ path: 'a', matches: [{ lineNumber: 1, line: 'x' }] }] }
    expect(toolResultLines(ctx(), settled('grep', { pattern: 'x' }, 't', { meta: matches }))).toEqual(['  ⎿ 3 matches in 1 files'])
    const paths = { shape: 'paths', truncated: false, total: 2, paths: ['a', 'b'] }
    expect(toolResultLines(ctx(), settled('glob', { pattern: '*' }, 't', { meta: paths }))).toEqual(['  ⎿ 2 files'])
  })

  it('shows generic output capped at the line limit, or nothing without output', () => {
    expect(toolResultLines(ctx(), settled('mystery', {}, 'a\nb\nc\nd'))).toEqual(['  ⎿ … 1 more lines', '    b', '    c'])
    expect(toolResultLines(ctx(), settled('mystery', {}, undefined))).toEqual([])
  })

  it('treats a result with no recorded call as a generic tool', () => {
    expect(toolResultLines(ctx(), settled('x', {}, 'out', { call: null }))).toEqual(['  ⎿ out'])
  })
})
