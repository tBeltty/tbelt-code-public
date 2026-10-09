// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDisclosure } from '@deepseek-ai/dsh-client-ui-chat/src/client/chat/use-disclosure.ts'
import { cleanup, fireEvent, render } from '@testing-library/react'

import type { StartedToolCall, ToolResultNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { localizeAutoReviewDenial, normalizeAutoReviewReason } from '../src/client/tool/models/auto-review-denial.ts'
import { classifyTool, toolRowModel } from '@deepseek-ai/dsh-presentation-tool-call'
import { ToolRow } from '../src/client/tool/components/ToolRow.tsx'
import { GenericToolCard, type GenericToolCardProps } from '../src/client/tool/toolviews/GenericToolCard.tsx'
import { zh } from '@deepseek-ai/dsh-client-ui-conversation/src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const t: GenericToolCardProps['t'] = makeTranslate(zh, commonZh)

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

describe('tool-call-model titles', () => {
  it('names each cordis verb instead of leaving it a bare tool call', () => {
    // Every define/run pair the model makes puts a row in the flow, so the
    // generic "Tool call · cordis_run · dyn-1" fallback is user-visible slop.
    const titleOf = (name: string) => toolRowModel(name, running({ name, argsRaw: '{"id":"dyn-1"}' }))
    expect(t(titleOf('cordis_run').titleKey)).toBe('运行 Cordis 插件')
    expect(t(titleOf('cordis_stop').titleKey)).toBe('停止 Cordis 插件')
    expect(t(titleOf('cordis_undefine').titleKey)).toBe('移除 Cordis 插件')
    // An owned title takes the tool name out of the summary slot, leaving the
    // package id as the only mutable text.
    expect(titleOf('cordis_run').summary).toBe('dyn-1')
  })

  it('leaves cordis_define to its own keyed toolview', () => {
    // ui-cordis registers a keyed `tool.call.toolview` entry for cordis_define,
    // and a keyed hit replaces the generic row (this model is only reached
    // through the dispatch fallback). A mapping here would be unreachable, and a
    // title here would be a second answer to what the card already renders.
    const model = toolRowModel('cordis_define', running({ name: 'cordis_define', argsRaw: '{"name":"clock"}' }))
    expect(model.variant).toBe('others')
    expect(t(model.titleKey)).toBe('工具调用')
  })

  it('renders cordis mount verbs no shipped tool implements as generic calls', () => {
    // No shipped tool implements these cordis mount verbs, so a mapping would
    // be unreachable.
    expect(classifyTool('cordis_mount')).toBe('others')
    expect(t(toolRowModel('cordis_mount', running({ name: 'cordis_mount', argsRaw: '{}' })).titleKey)).toBe('工具调用')
    expect(t(toolRowModel('cordis_unmount', running({ name: 'cordis_unmount', argsRaw: '{}' })).titleKey)).toBe('工具调用')
  })

  it('gives the pwsh shell row the bash family treatment and localized command title', () => {
    const m = toolRowModel('pwsh', running())
    expect(m.variant).toBe('bash')
    expect(t(m.titleKey)).toBe('运行命令')
  })

  it('derives the bash summary from description over command', () => {
    const m = toolRowModel('bash', running())
    expect(t(m.titleKey)).toBe('运行命令')
    expect(m.summary).toBe('List files')
    expect(toolRowModel('bash', running({ argsRaw: '{"command":"pwd"}' })).summary).toBe('pwd')
  })

  it('normalizes Auto-review reasons only for localized display and falls back when blank', () => {
    expect(normalizeAutoReviewReason('  first\r\n\nsecond\u2028\u2029third  ')).toBe('first second third')
    expect(normalizeAutoReviewReason(' \r\n\u2028 ')).toBeNull()
    expect(normalizeAutoReviewReason(null)).toBeNull()
    expect(localizeAutoReviewDenial({ reason: null }, t)).toEqual({
      summary: 'Auto review 已拒绝',
      output: '工具未执行。原因：Auto review 未授权此次操作',
    })
  })
})

describe('ToolRow', () => {
  const rowProps = {
    useDisclosure,
    t,
    variant: 'bash' as const, icon: <i data-testid="tool-icon" />, title: 'Bash',
    summary: 'List files', bodyRaw: '{"a":1}', state: 'ok' as const,
  }

  it('renders leading icon, title and summary while collapsed', () => {
    const view = render(<ToolRow {...rowProps} />)
    expect(view.queryByTestId('tool-icon')).not.toBeNull()
    expect(view.getByText('Bash')).toBeTruthy()
    expect(view.getByText('List files')).toBeTruthy()
    expect(view.container.querySelector('[aria-expanded]')?.getAttribute('aria-expanded')).toBe('false')
  })

  it('row click expands: chevron leading, summary kept inline, body in the scrolling card', () => {
    const view = render(<ToolRow {...rowProps} />)
    fireEvent.click(view.getByRole('button'))
    expect(view.queryByTestId('tool-icon')).toBeNull()
    expect(view.container.querySelector('svg')).not.toBeNull()
    expect(view.getByText('List files')).toBeTruthy()
    expect(view.getByText(/"a": 1/)).toBeTruthy()
    expect(view.container.querySelector('[class*="ioCard"]')).not.toBeNull()
    fireEvent.click(view.getByRole('button'))
    expect(view.queryByTestId('tool-icon')).not.toBeNull()
    expect(view.getByText('List files')).toBeTruthy()
  })

  it('shows totals once and shared context once when an edit expands', () => {
    const view = render(<ToolRow {...rowProps} variant="edit" title="Edit" summary="settings.ts" diff={{
      card: { diffs: [{
        path: 'settings.ts',
        oldText: 'start\nsecond\nthird\nold\nfourth\nfifth\nend',
        newText: 'start\nsecond\nthird\nnew\nfourth\nfifth\nend',
      }] },
    }} />)
    expect(view.container.querySelector('[data-disclosure-row]')?.textContent).toContain('+1 -1')
    expect(view.container.querySelector('[data-diff]')).toBeNull()
    fireEvent.click(view.getByRole('button'))
    expect(view.getAllByText('+1')).toHaveLength(1)
    expect(view.getAllByText('-1')).toHaveLength(1)
    expect(view.getAllByText('start')).toHaveLength(1)
    expect(view.getAllByText('end')).toHaveLength(1)
    expect(view.getByText('old', { exact: true })).toBeTruthy()
    expect(view.getByText('new', { exact: true })).toBeTruthy()
    expect(view.queryByRole('button', { name: /展开其余/ })).toBeNull()
  })

  it('formats the argument body only while expanding it', () => {
    const stringify = vi.spyOn(JSON, 'stringify')
    const bodyFormatCalls = () => stringify.mock.calls.filter(
      ([value, replacer, space]) => typeof value === 'object'
        && value !== null
        && 'a' in value
        && (value as { a?: unknown }).a === 1
        && replacer === null
        && space === 2,
    ).length
    const view = render(<ToolRow {...rowProps} />)
    expect(bodyFormatCalls()).toBe(0)

    fireEvent.click(view.getByRole('button'))
    expect(bodyFormatCalls()).toBe(1)
    expect(view.getByText(/"a": 1/)).toBeTruthy()

    fireEvent.click(view.getByRole('button'))
    expect(bodyFormatCalls()).toBe(1)
    expect(view.queryByText(/"a": 1/)).toBeNull()
  })

  it('keeps the business icon across running and error states', () => {
    const runningView = render(<ToolRow {...rowProps} state="running" />)
    expect(runningView.queryByTestId('tool-icon')).not.toBeNull()
    expect(runningView.container.querySelector('[data-state="running"]')).not.toBeNull()
    const errorView = render(<ToolRow {...rowProps} state="error" />)
    expect(errorView.container.querySelector('[data-testid="tool-icon"]')).not.toBeNull()
    expect(errorView.container.querySelector('[class*="chevronHover"]')).not.toBeNull()
  })

  it('non-expandable rows render a passive leading slot and no row button', () => {
    const view = render(<ToolRow {...rowProps} bodyRaw={null} />)
    expect(view.queryByRole('button')).toBeNull()
    expect(view.container.querySelector('[aria-expanded]')).toBeNull()
    expect(view.queryByTestId('tool-icon')).not.toBeNull()
  })

  it('the row toggles from Enter and Space, ignoring other keys', () => {
    const view = render(<ToolRow {...rowProps} />)
    const row = view.getByRole('button')
    fireEvent.keyDown(row, { key: 'Tab' })
    expect(row.getAttribute('aria-expanded')).toBe('false')
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(row.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(row, { key: ' ' })
    expect(row.getAttribute('aria-expanded')).toBe('false')
  })

  it('file rows expand from the row while the path link opens without toggling', () => {
    const open = vi.fn()
    const view = render(
      <ToolRow {...rowProps} variant="read" title="Read" summary="src/a.ts" filePath="src/a.ts" onOpenFile={open} />,
    )
    const row = view.getByRole('button', { name: /Read/ })
    const path = view.getByText('src/a.ts')
    for (const key of ['Enter', ' ', 'Tab']) {
      fireEvent.keyDown(path, { key })
      expect(row.getAttribute('aria-expanded')).toBe('false')
    }
    // Path click opens the file and leaves the row collapsed.
    fireEvent.click(path)
    expect(open).toHaveBeenCalledWith('src/a.ts')
    expect(row.getAttribute('aria-expanded')).toBe('false')
    // Row click (outside the link) expands the args body.
    fireEvent.click(row)
    expect(row.getAttribute('aria-expanded')).toBe('true')
    expect(view.getByText(/"a": 1/)).toBeTruthy()
  })

  it('a file path without onOpenFile renders a plain summary on an expandable row', () => {
    const view = render(
      <ToolRow {...rowProps} variant="write" title="Write" summary="作文.md" filePath="作文.md" />,
    )
    expect(view.container.querySelector('button')).toBeNull()
    const row = view.getByRole('button')
    fireEvent.click(row)
    expect(row.getAttribute('aria-expanded')).toBe('true')
    expect(view.getByText(/"a": 1/)).toBeTruthy()
  })

  it('non-file rows do not open anything when the summary is clicked', () => {
    const open = vi.fn()
    const view = render(<ToolRow {...rowProps} onOpenFile={open} />)
    fireEvent.click(view.getByText('List files'))
    expect(open).not.toHaveBeenCalled()
  })

  it('an error row shows the failure first line in the collapsed summary and the full text expanded', () => {
    const view = render(
      <ToolRow {...rowProps} state="error" errorSummary="boom" output={'boom\ndetail'} />,
    )
    expect(view.getByText('boom')).toBeTruthy()
    expect(view.queryByText('List files')).toBeNull()
    fireEvent.click(view.getByRole('button'))
    expect(view.getByText(/detail/)).toBeTruthy()
    expect(view.container.querySelector('[data-error]')).not.toBeNull()
  })

  it('an error row without an error summary keeps the args summary', () => {
    const view = render(<ToolRow {...rowProps} state="error" errorSummary={null} />)
    const summary = view.getByText('List files')
    expect(summary.parentElement?.className).toContain('errorSummary')
  })

  it('renders summarySuffix outside the ellipsized summary span, and drops it on a failure line', () => {
    const view = render(<ToolRow {...rowProps} summarySuffix="+2" />)
    const summary = view.getByText('List files')
    const suffix = view.getByText('+2')
    // Separate spans: .summary truncates, the suffix must not travel inside it.
    expect(summary.contains(suffix)).toBe(false)
    view.unmount()
    // The failure line replaces the summary wholesale, so the suffix goes with it.
    const failed = render(
      <ToolRow {...rowProps} state="error" errorSummary="boom" summarySuffix="+2" />,
    )
    expect(failed.queryByText('+2')).toBeNull()
  })

  it('an error file row drops the open-file link (the summary is failure prose, not the path)', () => {
    const open = vi.fn()
    const view = render(
      <ToolRow
        {...rowProps}
        variant="write" title="Write" state="error" errorSummary="cannot overwrite"
        filePath="src/a.ts" onOpenFile={open}
      />,
    )
    fireEvent.click(view.getByText('cannot overwrite'))
    expect(open).not.toHaveBeenCalled()
    // The failure line renders as plain text, not the underlined link button.
    expect(view.container.querySelector('[class*="fileLink"]')).toBeNull()
  })

  it('the expanded body carries a hover Inspect pill that fires the callback', () => {
    const inspect = vi.fn()
    const view = render(<ToolRow {...rowProps} inspect={inspect} />)
    // Collapsed: no pill.
    expect(view.queryByText('查看')).toBeNull()
    fireEvent.click(view.getByRole('button', { name: /Bash/ }))
    const pill = view.getByText('查看')
    fireEvent.click(pill)
    expect(inspect).toHaveBeenCalledTimes(1)
    // The pill click must not collapse the row (body is a .row sibling).
    expect(view.getByRole('button', { name: /Bash/ }).getAttribute('aria-expanded')).toBe('true')
  })

  it('no inspect callback, no pill', () => {
    const view = render(<ToolRow {...rowProps} />)
    fireEvent.click(view.getByRole('button'))
    expect(view.queryByText('查看')).toBeNull()
  })

  it('the expanded card gutter-labels each section it carries (IN / OUT)', () => {
    const both = render(<ToolRow {...rowProps} output="result text" />)
    fireEvent.click(both.getByRole('button'))
    expect(both.getByText('输入')).toBeTruthy()
    expect(both.getByText('输出')).toBeTruthy()
    expect(both.getByText('result text')).toBeTruthy()
    cleanup()
    const inputOnly = render(<ToolRow {...rowProps} />)
    fireEvent.click(inputOnly.getByRole('button'))
    expect(inputOnly.getByText('输入')).toBeTruthy()
    expect(inputOnly.queryByText('输出')).toBeNull()
    cleanup()
    const outputOnly = render(<ToolRow {...rowProps} bodyRaw={null} output="only out" />)
    fireEvent.click(outputOnly.getByRole('button'))
    expect(outputOnly.queryByText('输入')).toBeNull()
    expect(outputOnly.getByText('输出')).toBeTruthy()
    expect(outputOnly.getByText('only out')).toBeTruthy()
  })
})

describe('GenericToolCard', () => {
  const props = (toolName: string, block: StartedToolCall | ToolResultNode): GenericToolCardProps => ({
    loadImage: vi.fn(() => Promise.reject(new Error('not used'))),
    useDisclosure, callId: 'c1', toolName, ...('kind' in block ? { phase: 'result' as const, block: block } : { phase: block.phase, block: block }), openFile: vi.fn(), t,
  })

  it('renders the classified variant row from the frozen slice', () => {
    const view = render(<GenericToolCard {...props('bash', result())} />)
    expect(view.getByText('运行命令')).toBeTruthy()
    expect(view.getByText('List files')).toBeTruthy()
    expect(view.container.querySelector('[data-variant="bash"]')).not.toBeNull()
  })

  it.each([
    'bash', 'read', 'grep', 'write', 'run_code', 'unknown_tool',
  ] as const)('keeps the %s business family artwork on failure', (toolName) => {
    const failed = result({
      call: { name: toolName, argsRaw: '{}' },
      content: [{ type: 'text', text: 'failed' }],
      isError: true,
    })
    const view = render(<GenericToolCard {...props(toolName, failed)} />)
    const root = view.container.querySelector(`[data-tool="${toolName}"]`)!
    expect(root.querySelector('[data-disclosure-row] > :first-child svg')).not.toBeNull()
    expect(root.querySelector('[data-state]')).toBeNull()
  })

  it('unknown tools land on the others variant titled Tool call', () => {
    const view = render(
      <GenericToolCard {...props('custom_tool', running({ name: 'custom_tool', argsRaw: '{"note":"x"}' }))} />,
    )
    expect(view.getByText('工具调用')).toBeTruthy()
    expect(view.container.querySelector('[data-variant="others"]')).not.toBeNull()
    expect(view.container.querySelector('[data-state="running"]')).not.toBeNull()
  })

  it('renders edit with its dedicated title, icon variant, and path summary', () => {
    const view = render(
      <GenericToolCard {...props('edit', running({
        name: 'edit',
        argsRaw: '{"file_path":"src/x.ts","old_string":"before","new_string":"after"}',
      }))} />,
    )
    expect(view.getByText('编辑')).toBeTruthy()
    expect(view.getByText('src/x.ts')).toBeTruthy()
    expect(view.container.querySelector('[data-variant="edit"]')).not.toBeNull()
    expect(view.container.querySelector('svg')).not.toBeNull()
  })

  it('renders write with its dedicated title, icon variant, and path summary', () => {
    const view = render(
      <GenericToolCard {...props('write', running({
        name: 'write',
        argsRaw: '{"file_path":"src/x.ts","content":"hello"}',
      }))} />,
    )
    expect(view.getByText('写入')).toBeTruthy()
    expect(view.getByText('src/x.ts')).toBeTruthy()
    expect(view.container.querySelector('[data-variant="write"]')).not.toBeNull()
    expect(view.container.querySelector('svg')).not.toBeNull()
  })

  it('passes the owner inspect callback through to the expanded row pill', () => {
    const inspect = vi.fn()
    const view = render(<GenericToolCard {...props('bash', result())} inspect={inspect} />)
    fireEvent.click(view.getByRole('button', { name: /运行命令/ }))
    fireEvent.click(view.getByText('查看'))
    expect(inspect).toHaveBeenCalledTimes(1)
  })

  it('file-path summary click reaches openFile; bash summary does not', () => {
    const file = props('read', running({ name: 'read', argsRaw: '{"path":"src/x.ts"}' }))
    const fileView = render(<GenericToolCard {...file} />)
    fireEvent.click(fileView.getByText('src/x.ts'))
    expect(file.openFile).toHaveBeenCalledWith('src/x.ts')

    const bash = props('bash', result())
    const bashView = render(<GenericToolCard {...bash} />)
    fireEvent.click(bashView.getByText('List files'))
    expect(bash.openFile).not.toHaveBeenCalled()
  })

  it('renders a nested Auto denial as one localized OUT line without formatting its input', () => {
    const stringify = vi.spyOn(JSON, 'stringify')
    const denied = result({
      parentCallId: 'outer',
      call: { name: 'mystery', argsRaw: '{"path":"secret"}' },
      content: [{ type: 'text', text: 'Tool execution rejected by user' }],
      isError: true,
      error: { name: 'AutoReviewDeniedError', code: 'AUTO_REVIEW_DENIED', reason: '  scope\r\nwas not authorized  ' },
    })
    const view = render(<GenericToolCard {...props('mystery', denied)} />)
    expect(view.getByText('Auto review 已拒绝')).toBeTruthy()
    fireEvent.click(view.getByRole('button'))
    expect(view.getByText('工具未执行。原因：scope was not authorized')).toBeTruthy()
    expect(view.queryByText('输入')).toBeNull()
    expect(view.getAllByText('输出')).toHaveLength(1)
    expect(stringify.mock.calls.some(([value]) => (
      typeof value === 'object' && value !== null && 'path' in value
    ))).toBe(false)
    expect(view.queryByText('Tool execution rejected by user')).toBeNull()
    expect(view.queryByText(/"path"/)).toBeNull()
  })
})
