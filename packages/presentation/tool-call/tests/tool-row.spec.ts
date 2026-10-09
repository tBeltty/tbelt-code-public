/** Tool row model: classification, summaries, paths, state, output and Auto-review denial, without a DOM or a locale. */
import { describe, expect, it } from 'vitest'
import {
  classifyTool, formatToolBody, resultText, toolRowModel, toolTitleKey,
  type StartedToolCall, type ToolResultNode,
} from '../src/index.ts'

const running = (over?: Partial<StartedToolCall>): StartedToolCall => ({
  phase: 'start' as const, callId: 'c1', name: 'bash', argsRaw: '{"command":"ls -la","description":"List files"}',
  turn: 1, step: 1, time: 1_000, subCalls: [], ...over,
})

const result = (over?: Partial<ToolResultNode>): ToolResultNode => ({
  kind: 'tool-result', seq: 10, time: 2_000, callId: 'c1',
  call: { name: 'bash', argsRaw: '{"command":"ls -la","description":"List files"}' },
  callTime: 1_000,
  content: [], isError: false, subCalls: [], ...over,
})

describe('tool row model', () => {
  it('keeps the title key closed over the tool-owned and variant titles', () => {
    expect(toolTitleKey('bash')).toBe('tool.title.bash')
    expect(toolTitleKey('pwsh')).toBe('tool.title.pwsh')
    expect(toolTitleKey('cordis_run')).toBe('tool.title.runCordis')
    expect(toolTitleKey('cordis_define')).toBe('tool.title.generic')
    expect(toolTitleKey('unknown_tool')).toBe('tool.title.generic')
  })

  it('leaves cordis_define and unshipped mount verbs to the generic row', () => {
    for (const name of ['cordis_define', 'cordis_mount', 'cordis_unmount']) {
      const model = toolRowModel(name, running({ name, argsRaw: '{}' }))
      expect(model.variant).toBe('others')
      expect(model.titleKey).toBe('tool.title.generic')
    }
  })

  it('titles each cordis verb and drops the tool name from the summary slot', () => {
    const titleOf = (name: string) => toolRowModel(name, running({ name, argsRaw: '{"id":"dyn-1"}' }))
    expect(titleOf('cordis_run').titleKey).toBe('tool.title.runCordis')
    expect(titleOf('cordis_stop').titleKey).toBe('tool.title.stopCordis')
    expect(titleOf('cordis_undefine').titleKey).toBe('tool.title.removeCordis')
    expect(titleOf('cordis_run').summary).toBe('dyn-1')
  })

  it('gives the pwsh shell row the bash family treatment', () => {
    expect(toolRowModel('pwsh', running())).toMatchObject({ variant: 'bash', titleKey: 'tool.title.pwsh' })
  })

  it('summarizes a bash call by description over command', () => {
    expect(toolRowModel('bash', running())).toMatchObject({ titleKey: 'tool.title.bash', summary: 'List files' })
  })

  it('derives the preparing state and no arguments before the call is dispatched', () => {
    const preparing = toolRowModel('bash', {
      phase: 'preparing', callId: 'c1', name: 'bash', turn: 1, step: 1, time: 1_000, subCalls: [],
    })
    expect(preparing).toMatchObject({ state: 'preparing', summary: '', bodyRaw: null, filePath: undefined, output: null })
  })

  it('classifies known tools and falls back to others', () => {
    expect(classifyTool('bash')).toBe('bash')
    expect(classifyTool('pwsh')).toBe('bash')
    expect(classifyTool('read')).toBe('read')
    expect(classifyTool('web_fetch')).toBe('read')
    expect(classifyTool('web_search')).toBe('search')
    expect(classifyTool('grep')).toBe('search')
    expect(classifyTool('write')).toBe('write')
    expect(classifyTool('edit')).toBe('edit')
    expect(classifyTool('cordis_runtime_inspect')).toBe('read')
    // The v3 run-control verbs: `others` is the decided intent, not an
    // unclassified default (there is no program to show and no file to open).
    expect(classifyTool('cordis_run')).toBe('others')
    expect(classifyTool('cordis_stop')).toBe('others')
    expect(classifyTool('cordis_undefine')).toBe('others')
    expect(classifyTool('todo_write')).toBe('others')
  })

  it('derives state across running/ok/error/interrupted', () => {
    expect(toolRowModel('bash', running()).state).toBe('running')
    expect(toolRowModel('bash', result()).state).toBe('ok')
    expect(toolRowModel('bash', result({ isError: true })).state).toBe('error')
    expect(toolRowModel('bash', result({ isError: true, error: { name: 'E', code: 'interrupted' } })).state).toBe('stopped')
  })

  it('keeps summaries single-line and falls back for opaque args', () => {
    expect(toolRowModel('bash', running({ argsRaw: '{"command":"a\\nb"}' })).summary).toBe('a')
    expect(toolRowModel('read', running({ name: 'read', argsRaw: '{"path":"/tmp/x.ts"}' })).summary).toBe('/tmp/x.ts')
    expect(toolRowModel('write', running({ name: 'write', argsRaw: '{"file_path":"src/x.ts"}' })).summary).toBe('src/x.ts')
    expect(toolRowModel('edit', running({ name: 'edit', argsRaw: '{"file_path":"src/x.ts"}' })).summary).toBe('src/x.ts')
    // Other rows prefix the real tool name into the summary slot (figma
    // flows: static "Tool call" title, the name rides the mutable summary).
    expect(toolRowModel('x', running({ argsRaw: '{"n":1}' })).summary).toBe('x · {"n":1}')
    expect(toolRowModel('x', running({ argsRaw: 'not json' })).summary).toBe('x · not json')
    expect(toolRowModel('x', running({ argsRaw: '' })).summary).toBe('x · c1')
    expect(toolRowModel('', running({ argsRaw: '' })).summary).toBe('c1')
  })

  it('joins multi-query web search arguments in the summary', () => {
    expect(toolRowModel('web_search', running({
      name: 'web_search',
      argsRaw: '{"queries":["first query","second\\nquery"]}',
    })).summary).toBe('first query, second')
  })

  it('exposes filePath for path/file_path args and skips URL-only reads', () => {
    expect(toolRowModel('read', running({ name: 'read', argsRaw: '{"path":"src/a.ts"}' })).filePath).toBe('src/a.ts')
    expect(toolRowModel('write', running({ name: 'write', argsRaw: '{"file_path":"src/a.ts"}' })).filePath).toBe('src/a.ts')
    expect(toolRowModel('edit', running({ name: 'edit', argsRaw: '{"file_path":"src/a.ts"}' })).filePath).toBe('src/a.ts')
    expect(toolRowModel('web_fetch', running({ name: 'web_fetch', argsRaw: '{"url":"https://example.com"}' })).filePath)
      .toBeUndefined()
    expect(toolRowModel('bash', running()).filePath).toBeUndefined()
  })

  it('displays workspace-rooted paths relative to the session cwd', () => {
    const cwd = '/Users/u/ws/'
    expect(toolRowModel('edit', running({ name: 'edit', argsRaw: '{"file_path":"/Users/u/ws/src/x.ts"}' }), cwd).summary).toBe('src/x.ts')
    expect(toolRowModel('read', running({ name: 'read', argsRaw: '{"path":"/Users/u/ws/a.md"}' }), cwd).summary).toBe('a.md')
    // Paths outside the workspace (and non-path summaries) stay verbatim.
    expect(toolRowModel('read', running({ name: 'read', argsRaw: '{"path":"/etc/hosts"}' }), cwd).summary).toBe('/etc/hosts')
    expect(toolRowModel('bash', running({ argsRaw: '{"command":"pwd"}' }), cwd).summary).toBe('pwd')
    expect(toolRowModel('read', running({ name: 'read', argsRaw: '{"path":"/Users/u/ws/a.md"}' }), '').summary).toBe('/Users/u/ws/a.md')
  })

  it('abbreviates leftover POSIX home paths after cwd relativization', () => {
    const home = '/Users/u'
    const cwd = '/tmp/ws'
    expect(toolRowModel('read', running({ name: 'read', argsRaw: '{"path":"/Users/u"}' }), cwd, home).summary).toBe('~')
    expect(toolRowModel('read', running({ name: 'read', argsRaw: '{"path":"/Users/u/notes.md"}' }), cwd, home).summary)
      .toBe('~/notes.md')
    // Workspace-relative wins: a home-and-cwd descendant stays short, not `~/…`.
    expect(toolRowModel(
      'read',
      running({ name: 'read', argsRaw: '{"path":"/Users/u/proj/src/a.ts"}' }),
      '/Users/u/proj',
      home,
    ).summary).toBe('src/a.ts')
    // Prefix boundary: `/Users/u2` is not under `/Users/u`.
    expect(toolRowModel('read', running({ name: 'read', argsRaw: '{"path":"/Users/u2/a.ts"}' }), cwd, home).summary)
      .toBe('/Users/u2/a.ts')
    expect(toolRowModel(
      'read',
      running({ name: 'read', argsRaw: '{"path":"C:\\\\Users\\\\u\\\\a.ts"}' }),
      cwd,
      home,
    ).summary).toBe('C:\\Users\\u\\a.ts')
    expect(toolRowModel('read', running({ name: 'read', argsRaw: '{"path":"/Users/u/a.ts"}' }), cwd).summary)
      .toBe('/Users/u/a.ts')
  })

  it('body pretty-prints JSON args, keeps raw non-JSON, null when empty', () => {
    expect(formatToolBody('bash', toolRowModel('bash', running({ argsRaw: '{"a":1}' })).bodyRaw ?? ''))
      .toBe('{\n  "a": 1\n}')
    expect(formatToolBody('bash', toolRowModel('bash', running({ argsRaw: 'raw' })).bodyRaw ?? ''))
      .toBe('raw')
    expect(toolRowModel('bash', running({ argsRaw: '' })).bodyRaw).toBeNull()
    expect(toolRowModel('bash', result({ call: null })).bodyRaw).toBeNull()
  })

  it('a code row with an empty program falls back to the args JSON envelope', () => {
    const model = toolRowModel('run_code', running({ name: 'run_code', argsRaw: '{"code":""}' }))
    expect(formatToolBody(model.variant, model.bodyRaw ?? ''))
      .toBe('{\n  "code": ""\n}')
  })

  it('resultText flattens text blocks verbatim, other shapes as JSON, empty error content to name: code', () => {
    expect(resultText(result({ content: [{ type: 'text', text: 'a\nb' }] }))).toBe('a\nb')
    expect(resultText(result({ content: [{ type: 'text', text: 'a' }, { type: 'image', data: 'x' } as never] })))
      .toBe(`a\n${JSON.stringify({ type: 'image', data: 'x' }, null, 2)}`)
    expect(resultText(result({ content: [], isError: true, error: { name: 'ToolError', code: 'denied' } })))
      .toBe('ToolError: denied')
    expect(resultText(result({ content: [] }))).toBe('')
  })

  it('derives output from the settled result and null while running or blank', () => {
    expect(toolRowModel('bash', result({ content: [{ type: 'text', text: 'out' }] })).output).toBe('out')
    expect(toolRowModel('bash', running()).output).toBeNull()
    expect(toolRowModel('bash', result({ content: [] })).output).toBeNull()
  })

  it('derives errorSummary as the first output line on error rows only', () => {
    const failed = result({ content: [{ type: 'text', text: 'boom\ndetail' }], isError: true })
    expect(toolRowModel('bash', failed).errorSummary).toBe('boom')
    expect(toolRowModel('bash', result({ content: [{ type: 'text', text: 'boom' }] })).errorSummary).toBeNull()
    expect(toolRowModel('bash', result({ content: [], isError: true })).errorSummary).toBeNull()
    expect(toolRowModel('bash', running()).errorSummary).toBeNull()
  })

  it('derives Auto-review denial only from the exact structured error identity', () => {
    const denied = result({
      parentCallId: 'outer:code:1',
      isError: true,
      error: { name: 'AutoReviewDeniedError', code: 'AUTO_REVIEW_DENIED', reason: ' raw\nreason ' },
    })
    expect(toolRowModel('bash', denied).autoReviewDenial).toEqual({ reason: ' raw\nreason ' })
    expect(toolRowModel('bash', result({
      isError: true,
      error: { name: 'AutoReviewDeniedError', code: 'AUTO_REVIEW_DENIED' },
    })).autoReviewDenial).toEqual({ reason: null })
    expect(toolRowModel('bash', result({
      isError: true,
      error: { name: 'AutoReviewDeniedError', code: 'AUTO_REVIEW_DENIED', reason: 42 },
    } as never)).autoReviewDenial).toEqual({ reason: null })
    expect(toolRowModel('bash', result({
      isError: true,
      error: { name: 'AutoReviewDeniedError', code: 'OTHER' },
    })).autoReviewDenial).toBeNull()
    expect(toolRowModel('bash', result({
      isError: true,
      error: { name: 'OtherError', code: 'AUTO_REVIEW_DENIED' },
    })).autoReviewDenial).toBeNull()
    expect(toolRowModel('bash', result({
      isError: false,
      error: { name: 'AutoReviewDeniedError', code: 'AUTO_REVIEW_DENIED' },
    })).autoReviewDenial).toBeNull()
    expect(toolRowModel('bash', running()).autoReviewDenial).toBeNull()
  })

  it('gives Cordis lifecycle tools action titles over their generic variants', () => {
    expect(toolRowModel('cordis_runtime_inspect', running({
      name: 'cordis_runtime_inspect',
      argsRaw: '{"what":"api","name":"tools"}',
    }))).toMatchObject({
      variant: 'read',
      titleKey: 'tool.title.inspect',
      summary: 'api',
    })
    expect(toolRowModel('cordis_run', running({
      name: 'cordis_run',
      argsRaw: '{"id":"dyn-2"}',
    }))).toMatchObject({
      variant: 'others',
      titleKey: 'tool.title.runCordis',
      summary: 'dyn-2',
    })
    expect(toolRowModel('cordis_undefine', result({
      call: { name: 'cordis_undefine', argsRaw: '{"id":"dyn-2"}' },
    }))).toMatchObject({
      variant: 'others',
      titleKey: 'tool.title.removeCordis',
      summary: 'dyn-2',
    })
  })

  it('falls back to the first string argument, then to the raw first line, when no preferred key matches', () => {
    expect(toolRowModel('web_search', running({ name: 'web_search', argsRaw: '{"queries":[1,""],"note":"first\\nline"}' })).summary)
      .toBe('first')
    expect(toolRowModel('read', running({ name: 'read', argsRaw: '{"n":1}' })).summary).toBe('{"n":1}')
  })

  it('exposes no filePath when a file tool carries a non-object argument payload', () => {
    expect(toolRowModel('read', running({ name: 'read', argsRaw: '[1]' })).filePath).toBeUndefined()
    expect(toolRowModel('read', running({ name: 'read', argsRaw: 'null' })).filePath).toBeUndefined()
  })

  it('formats a code row as the program and an empty payload as null', () => {
    expect(formatToolBody('code', '{"code":"print(1)"}')).toBe('print(1)')
    expect(formatToolBody('bash', '')).toBeNull()
  })
})
