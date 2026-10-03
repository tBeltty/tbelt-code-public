// @vitest-environment jsdom
/** Preview rows open a target once when its call settles live and keep a manual open action. */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { StartedToolCall, ToolResultNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { PreviewRow, previewTarget } from '../src/client/PreviewRow.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)
type Props = Parameters<typeof PreviewRow>[0]
function running(target: string): StartedToolCall {
  return { phase: 'start', callId: 'v', name: 'preview', argsRaw: JSON.stringify({ target }), turn: 1, step: 1, time: 1, subCalls: [] }
}
function settled(target: string, extra: Partial<ToolResultNode> = {}): ToolResultNode {
  return { kind: 'tool-result', seq: 2, time: 2, callId: 'v', call: { name: 'preview', argsRaw: JSON.stringify({ target }) }, callTime: 1, content: [{ type: 'text', text: `Showing ${target} in the preview panel` }], isError: false, subCalls: [], ...extra }
}
function props(block: Props['block'], openFile = vi.fn(), openUrl = vi.fn()): Props {
  return { ...('kind' in block ? { phase: 'result' as const, block } : { phase: block.phase, block }), callId: 'v', toolName: 'preview', openFile, openUrl, t: makeTranslate(en) } as Props
}

it('opens a file once when its call settles while on screen', () => {
  const openFile = vi.fn()
  const openUrl = vi.fn()
  const view = render(<PreviewRow {...props(running('site/index.html'), openFile, openUrl)} />)
  expect(view.container.querySelector('[data-tool="preview"]')?.getAttribute('data-state')).toBe('running')
  expect(openFile).not.toHaveBeenCalled()
  view.rerender(<PreviewRow {...props(settled('site/index.html'), openFile, openUrl)} />)
  expect(openFile).toHaveBeenCalledExactlyOnceWith('site/index.html')
  view.rerender(<PreviewRow {...props(settled('site/index.html'), openFile, openUrl)} />)
  expect(openFile).toHaveBeenCalledOnce()
  expect(openUrl).not.toHaveBeenCalled()
  expect(view.getByText('Shown in the panel')).toBeTruthy()
})

it('opens a live localhost result in the URL opener', () => {
  const openUrl = vi.fn()
  const view = render(<PreviewRow {...props(running('http://localhost:5173/'), vi.fn(), openUrl)} />)
  view.rerender(<PreviewRow {...props(settled('http://localhost:5173/'), vi.fn(), openUrl)} />)
  expect(openUrl).toHaveBeenCalledExactlyOnceWith('http://localhost:5173/')
})

it('leaves history closed and reopens on request', () => {
  const openFile = vi.fn()
  const view = render(<PreviewRow {...props(settled('index.html'), openFile)} />)
  expect(openFile).not.toHaveBeenCalled()
  fireEvent.click(view.getByRole('button', { name: 'Open' }))
  expect(openFile).toHaveBeenCalledExactlyOnceWith('index.html')
})

it.each([
  [{ isError: true }, 'Preview failed'],
  [{ error: { name: 'Interrupted', code: 'interrupted' } }, 'Interrupted'],
] as const)('does not open failed calls', (extra, label) => {
  const openFile = vi.fn()
  const view = render(<PreviewRow {...props(running('index.html'), openFile)} />)
  view.rerender(<PreviewRow {...props(settled('index.html', extra), openFile)} />)
  expect(openFile).not.toHaveBeenCalled()
  expect(view.getByText(label)).toBeTruthy()
  expect(view.queryByRole('button', { name: 'Open' })).toBeNull()
})

it('shows preparation and an orphaned result without a target', () => {
  const view = render(<PreviewRow {...props({ phase: 'preparing', callId: 'v', name: 'preview', turn: 1, step: 1, time: 1, subCalls: [] })} />)
  expect(view.container.querySelector('[data-tool="preview"]')?.getAttribute('data-state')).toBe('preparing')
  view.rerender(<PreviewRow {...props(settled('', { call: null }))} />)
  expect(view.queryByRole('button', { name: 'Open' })).toBeNull()
})

it.each(['', '{', 'null', '{"target":1}'])('reads no target from %j', (raw) => {
  expect(previewTarget(raw)).toBe('')
})
