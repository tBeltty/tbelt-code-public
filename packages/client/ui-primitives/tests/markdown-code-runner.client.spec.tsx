// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CodeToolbarAction, MarkdownDelegateProvider, type MarkdownCodeRunner, type MarkdownCodeRunnerProps } from '../src/index.ts'
import { MarkdownText } from './markdown-test-components.tsx'

afterEach(cleanup)

const run = vi.fn()
function Runner({ code, lang, renderBlock }: MarkdownCodeRunnerProps) {
  return renderBlock({
    actions: <CodeToolbarAction label={`Run ${lang}`} icon="▶" onClick={() => { run(code) }} />,
    footer: <p data-testid="runner-footer">{code}</p>,
  })
}
const runner: MarkdownCodeRunner = { accepts: lang => lang === 'bash', Component: Runner }
const text = '```bash\necho one\necho two\n```\n\n```python\nprint(1)\n```\n'

it('wraps settled fences in accepted languages with the runner actions and footer', () => {
  const view = render(
    <MarkdownDelegateProvider codeRunner={runner}>
      <MarkdownText text={text} />
    </MarkdownDelegateProvider>,
  )
  fireEvent.click(view.getByRole('button', { name: 'Run bash' }))
  expect(run).toHaveBeenCalledWith('echo one\necho two')
  expect(view.getAllByTestId('runner-footer').map(node => node.textContent)).toEqual(['echo one\necho two'])
  expect(view.container.querySelectorAll('.md-code-block')).toHaveLength(2)
})

it('renders plain code blocks while streaming and without a runner', () => {
  const streaming = render(
    <MarkdownDelegateProvider codeRunner={runner}>
      <MarkdownText text={text} streaming />
    </MarkdownDelegateProvider>,
  )
  expect(streaming.queryByRole('button', { name: 'Run bash' })).toBeNull()
  cleanup()
  const plain = render(<MarkdownText text={text} />)
  expect(plain.queryByTestId('runner-footer')).toBeNull()
  expect(plain.container.querySelectorAll('.md-code-block')).toHaveLength(2)
})
