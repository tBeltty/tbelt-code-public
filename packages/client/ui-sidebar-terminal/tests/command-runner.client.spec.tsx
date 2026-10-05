// @vitest-environment jsdom
/** Run actions report command outcomes once and survive fence unmounting. */
import { createElement } from 'react'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { TerminalCommandResult, WebTerminalId } from '@deepseek-ai/dsh-api-terminal-controller/types'
import type { MarkdownCodeRunner } from '@deepseek-ai/dsh-client-ui-primitives'
import { commandReport, createCommandRunner, fence, type CommandRunnerDeps } from '../src/client/command-runner.tsx'

afterEach(cleanup)

const t: CommandRunnerDeps['t'] = (key, params) => params === undefined ? key : `${key}(${Object.values(params).join(',')})`
const id = 'command' as WebTerminalId
const exited = (patch: Partial<TerminalCommandResult> = {}): TerminalCommandResult => ({ state: 'exited', exitCode: 0, output: 'ok', truncated: false, ...patch })

function deps(overrides: Partial<CommandRunnerDeps> = {}) {
  const lifetime = new AbortController()
  const value = {
    run: vi.fn<CommandRunnerDeps['run']>(async () => ({ id, result: Promise.resolve(exited()) })),
    open: vi.fn<CommandRunnerDeps['open']>(),
    report: vi.fn<CommandRunnerDeps['report']>(async () => null),
    t, signal: lifetime.signal, ...overrides,
  }
  return { ...value, lifetime }
}

function mount(runner: MarkdownCodeRunner, code = 'echo ok', lang = 'bash') {
  const view = render(createElement(runner.Component, {
    code, lang, renderBlock: ({ actions, footer }) => createElement('div', null, actions, footer),
  }))
  return Object.assign(within(view.container), { unmount: view.unmount })
}

it('fences text with a marker longer than any backtick run inside it', () => {
  expect(fence('plain', 'text')).toBe('```text\nplain\n```')
  expect(fence('a ```` b ` c', 'bash')).toBe('`````bash\na ```` b ` c\n`````')
})

it('reports failed, stopped, empty and truncated outcomes', () => {
  expect(commandReport('ls', 'sh', exited({ state: 'failed', exitCode: null, error: 'pty lost', output: '' }), t))
    .toBe('run.report.intro\n\n```sh\nls\n```\n\nrun.report.failed(pty lost)\n\nrun.report.empty')
  expect(commandReport('ls', 'sh', exited({ state: 'failed', exitCode: null, output: '' }), t)).toContain('run.report.failed()')
  expect(commandReport('ls', 'sh', exited({ exitCode: null, output: 'tail', truncated: true }), t))
    .toBe('run.report.intro\n\n```sh\nls\n```\n\nrun.report.stopped\n\nrun.report.truncated\n\n```text\ntail\n```')
})

it('accepts shell fence languages regardless of case', () => {
  const runner = createCommandRunner(deps())
  expect(['bash', 'SH', 'shell', 'zsh'].map(runner.accepts)).toEqual([true, true, true, true])
  expect(['console', 'python', 'pwsh'].map(runner.accepts)).toEqual([false, false, false])
})

it('shares one run between identical fences, reports after unmount, and reopens the terminal on request', async () => {
  const result = Promise.withResolvers<TerminalCommandResult>()
  const d = deps({ run: vi.fn(async () => ({ id, result: result.promise })) })
  const runner = createCommandRunner(d)
  const first = mount(runner)
  const second = mount(runner)
  fireEvent.click(first.getByRole('button', { name: 'run.action' }))
  await waitFor(() => { expect(second.getByRole('status').textContent).toBe('run.running') })
  expect(second.getByRole('button', { name: 'run.again' })).toHaveProperty('disabled', true)
  expect(d.open).toHaveBeenCalledWith(id)
  first.unmount()
  fireEvent.click(second.getByRole('button', { name: 'run.show' }))
  expect(d.open).toHaveBeenCalledTimes(2)
  second.unmount()
  result.resolve(exited({ state: 'failed', exitCode: null, output: '' }))
  await waitFor(() => { expect(d.report).toHaveBeenCalledOnce() })
  const later = mount(runner)
  await waitFor(() => { expect(later.getByRole('status').textContent).toBe('failed() · run.reported') })
})

it('shows stopped and unreported outcomes, and a failure to start', async () => {
  const report = Promise.withResolvers<string | null>()
  const stopped = createCommandRunner(deps({
    run: vi.fn(async () => ({ id, result: Promise.resolve(exited({ exitCode: null })) })), report: vi.fn(() => report.promise),
  }))
  const view = mount(stopped)
  fireEvent.click(view.getByRole('button', { name: 'run.action' }))
  await waitFor(() => { expect(view.getByRole('status').textContent).toBe('run.stopped') })
  report.resolve('session closed')
  await waitFor(() => { expect(view.getByRole('status').textContent).toBe('run.failed(session closed)') })
  expect(view.getByRole('button', { name: 'run.show' })).toBeDefined()
  cleanup()
  const refused = createCommandRunner(deps({ run: vi.fn<CommandRunnerDeps['run']>().mockRejectedValue('no shell') }))
  const failed = mount(refused)
  fireEvent.click(failed.getByRole('button', { name: 'run.action' }))
  await waitFor(() => { expect(failed.getByRole('status').textContent).toBe('run.failed(no shell)') })
  expect(failed.queryByRole('button', { name: 'run.show' })).toBeNull()
})

it('drops a run silently when the plugin unloads before its result', async () => {
  const result = Promise.withResolvers<TerminalCommandResult>()
  const d = deps({ run: vi.fn(async () => ({ id, result: result.promise })) })
  const view = mount(createCommandRunner(d))
  fireEvent.click(view.getByRole('button', { name: 'run.action' }))
  await waitFor(() => { expect(view.getByRole('status').textContent).toBe('run.running') })
  d.lifetime.abort()
  result.reject(new Error('cancelled'))
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(view.getByRole('status').textContent).toBe('run.running')
  expect(d.report).not.toHaveBeenCalled()
})
