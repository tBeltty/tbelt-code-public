import { describe, expect, it } from 'vitest'
import { TranscriptRenderer } from '../src/transcript.ts'
import {
  assistantEvent, callEvent, liveEvent, options, resultEvent, text, turnEnd, userEvent, wireEvent,
} from './fixtures.ts'

const image = (attachmentId: string): never => ({
  type: 'image',
  attachment: { attachmentId, mediaType: 'image/png', bytes: 2048, width: 4, height: 3, name: 'shot.png' },
}) as never

const render = (events: Parameters<TranscriptRenderer['append']>[0][], over = {}): string => {
  const renderer = new TranscriptRenderer(options(over))
  return events.map(event => renderer.append(event)).join('')
}

describe('TranscriptRenderer messages', () => {
  it('prints user text with a marker and continuation lines indented', () => {
    expect(render([userEvent([text('hi\nthere')])])).toBe('› hi\n  there\n')
  })

  it('names a file without a name and ignores other block types', () => {
    expect(render([userEvent([text('x'), { type: 'file' } as never, { type: 'audio' } as never])])).toBe('› x\n  [file ]\n')
  })

  it('marks attachments and skips blank user messages', () => {
    const out = render([userEvent([text('see'), image('a1'), { type: 'file', name: 'a.pdf' } as never])])
    expect(out).toBe('› see\n  [file a.pdf]\n[image shot.png · 4×3 · 2 KB]\n')
    expect(render([userEvent([text('  ')])])).toBe('')
  })

  it('shows an image without text under the message gap', () => {
    expect(render([userEvent([image('a1')])])).toBe('[image shot.png · 4×3 · 2 KB]\n')
  })

  it('draws a fetched image with the terminal protocol and falls back to the marker without its bytes', () => {
    const images = { protocol: 'iterm2' as const, data: (id: string) => (id === 'a1' ? 'QUJD' : undefined) }
    const drawn = render([userEvent([text('see'), image('a1'), image('a2')])], { images })
    expect(drawn).toContain(']1337;File=inline=1;')
    expect(drawn).toContain('QUJD')
    expect(drawn.match(/\[image shot\.png/gu)).toHaveLength(2)
    expect(render([userEvent([image('a2')])], { images })).toBe('[image shot.png · 4×3 · 2 KB]\n')
  })

  it('shows a notice-form synthetic message as one dim line and hides other synthetic ones', () => {
    expect(render([userEvent([text('x')], { kind: 'goal', form: 'notice', summary: 'Goal continues' } as never)])).toBe('· Goal continues\n')
    expect(render([userEvent([text('x')], { kind: 'goal', form: 'notice' } as never)])).toBe('')
    expect(render([userEvent([text('x')], { kind: 'goal' } as never)])).toBe('')
  })

  it('separates blocks with one blank line', () => {
    expect(render([userEvent([text('a')]), userEvent([text('b')])])).toBe('› a\n\n› b\n')
  })
})

describe('TranscriptRenderer assistant output', () => {
  it('streams a reply and prints nothing more when the durable message lands', () => {
    const renderer = new TranscriptRenderer(options())
    const out = [
      renderer.append(liveEvent({ type: 'text-delta', text: 'Hel' })),
      renderer.append(liveEvent({ type: 'text-delta', text: 'lo\n' })),
      renderer.append(assistantEvent(1, 1, [text('Hello\n')])),
      renderer.append(turnEnd({ kind: 'completed' } as never)),
    ].join('')
    expect(out).toBe('Hello\n')
  })

  it('closes an unfinished streamed line when the durable message lands', () => {
    const renderer = new TranscriptRenderer(options())
    const out = renderer.append(liveEvent({ type: 'text-delta', text: 'Hi' })) + renderer.append(assistantEvent(1, 1, [text('Hi')]))
    expect(out).toBe('Hi\n')
  })

  it('prints a durable message that was never streamed, with reasoning dimmed in its own block', () => {
    const out = render([assistantEvent(1, 1, [{ type: 'reasoning', text: 'thinking' } as never, text('answer'), text('  '), { type: 'image' } as never])])
    expect(out).toBe('thinking\n\nanswer\n')
  })

  it('ignores chunks that carry no text, empty deltas and unrelated events', () => {
    const renderer = new TranscriptRenderer(options())
    expect(renderer.append(liveEvent({ type: 'tool-call-start' } as never))).toBe('')
    expect(renderer.append(liveEvent({ type: 'text-delta', text: '' }))).toBe('')
    expect(renderer.append({ type: 'session/created', seq: 1, time: 1, data: {} } as never)).toBe('')
  })

  it('strips terminal escapes and carriage returns from streamed text', () => {
    expect(render([liveEvent({ type: 'text-delta', text: 'a\u001B[2Jb\r\n' })])).toBe('ab\n')
  })

  it('switches blocks between reasoning and text', () => {
    const out = render([liveEvent({ type: 'reasoning-delta', text: 'hm' }), liveEvent({ type: 'text-delta', text: 'ok' })])
    expect(out).toBe('hm\n\nok')
  })

  it('flush finishes an open line once', () => {
    const renderer = new TranscriptRenderer(options())
    renderer.append(liveEvent({ type: 'text-delta', text: 'x' }))
    expect(renderer.flush()).toBe('\n')
    expect(renderer.flush()).toBe('')
  })
})

describe('TranscriptRenderer tools', () => {
  it('prints the call line when the call starts and the outcome under it', () => {
    const out = render([
      callEvent('c1', 'bash', { command: 'ls', description: 'List' }),
      resultEvent('c1', 'a\nb'),
    ])
    expect(out).toBe('● Bash  List\n  ⎿ a\n    b\n')
  })

  it('repeats the call line when other output came between the call and its outcome', () => {
    const out = render([
      callEvent('c1', 'bash', { command: 'ls', description: 'List' }),
      callEvent('c2', 'bash', { command: 'pwd', description: 'Where' }),
      resultEvent('c1', 'one'),
    ])
    expect(out).toBe('● Bash  List\n● Bash  Where\n● Bash  List\n  ⎿ one\n')
  })

  it('prints nothing for a settled call that has no outcome to show', () => {
    expect(render([callEvent('c1', 'mystery', {}), resultEvent('c1', '')])).toBe('● Tool call  mystery · {}\n')
  })

  it('shows an outcome whose call was not seen, such as in a partial window', () => {
    expect(render([resultEvent('zz', 'late')])).toBe('  ⎿ late\n')
  })

  it('passes the structured error and the metadata of a result to the views', () => {
    const edit = { file_path: 'a.ts', old_string: 'one\n', new_string: 'two\n' }
    const out = render([
      callEvent('c1', 'edit', edit),
      resultEvent('c1', 'ok', { meta: { diffs: [{ path: 'a.ts', oldText: 'one\n', newText: 'two\n' }] } }),
      callEvent('c2', 'bash', { command: 'rm', description: 'Remove' }),
      resultEvent('c2', '', { isError: true, error: { name: 'AutoReviewDeniedError', code: 'AUTO_REVIEW_DENIED' } }),
    ])
    expect(out).toContain('  ⎿ +1 -1')
    expect(out).toContain('  ⎿ Auto review did not allow this action')
  })

  it('reports an error result with its reason', () => {
    const out = render([callEvent('c1', 'read', { file_path: 'x' }), resultEvent('c1', 'ENOENT', { isError: true })])
    expect(out).toContain('  ⎿ ENOENT')
  })
})

describe('TranscriptRenderer slash commands', () => {
  const run = (commandId: string, name: string, args?: string): never => (
    { type: 'command/run', seq: 1, time: 1, data: { commandId, name, ...args === undefined ? {} : { args }, source: { kind: 'user' } } }
  ) as never
  const done = (commandId: string, kind: 'success' | 'error', text?: string): never => (
    { type: 'command/done', seq: 2, time: 2, data: { commandId, kind, ...text === undefined ? {} : { text } } }
  ) as never

  it('prints the command line and its outcome under it when the command settles', () => {
    expect(render([run('k1', 'goal', ' ship the site'), done('k1', 'success', 'Goal set.\nIt has 3 steps.')]))
      .toBe('/goal ship the site\n  Goal set.\n  It has 3 steps.\n')
  })

  it('says a command without text is done and an error did not run', () => {
    expect(render([run('k1', 'clear'), done('k1', 'success')])).toBe('/clear\n  Done.\n')
    expect(render([run('k1', 'undo'), done('k1', 'error')])).toBe('/undo\n  It did not run.\n')
    expect(render([run('k1', 'undo'), done('k1', 'error', 'nothing to undo')])).toBe('/undo\n  nothing to undo\n')
  })

  it('separates the command from earlier output and names one whose start was not seen', () => {
    expect(render([userEvent([text('hi')]), run('k1', 'budget'), done('k1', 'success', '12 USD left')]))
      .toBe('› hi\n\n/budget\n  12 USD left\n')
    expect(render([done('k9', 'success', 'ok')])).toBe('Command\n  ok\n')
  })

  it('shows nothing for a start, and ignores events that carry no command id', () => {
    expect(render([run('k1', 'goal')])).toBe('')
    expect(render([{ type: 'command/done', seq: 1, time: 1, data: {} } as never, { type: 'turn/start', seq: 2, time: 2, data: null } as never])).toBe('')
    expect(render([{ type: 'command/other', seq: 1, time: 1, data: { commandId: 'k1' } } as never])).toBe('')
  })

  it('prints a bare slash for a start that carries no name', () => {
    const nameless = { type: 'command/run', seq: 1, time: 1, data: { commandId: 'k1' } } as never
    expect(render([nameless, done('k1', 'success')])).toBe('/\n  Done.\n')
  })

  it('removes terminal escapes from the line and the text', () => {
    expect(render([run('k1', 'x', ' \u001B[31mred'), done('k1', 'success', 'a\u001B[0mb')])).toBe('/x red\n  ab\n')
  })
})

describe('TranscriptRenderer turn ends', () => {
  const end = (reason: unknown): string => render([turnEnd(reason as never)])

  it('says nothing for a completed turn and explains the others', () => {
    expect(end({ kind: 'completed' })).toBe('')
    expect(end({ kind: 'aborted' })).toBe('Interrupted\n')
    expect(end({ kind: 'blocked' })).toBe('The turn was blocked\n')
    expect(end({ kind: 'max-tokens' })).toBe('The reply reached the output limit\n')
    expect(end({ kind: 'error', error: { message: 'boom\u001B[0m' } })).toBe('Error: boom\n')
    expect(end({ kind: 'other' })).toBe('')
  })

  it('closes an open streamed line first', () => {
    const renderer = new TranscriptRenderer(options())
    renderer.append(liveEvent({ type: 'text-delta', text: 'half' }))
    expect(renderer.append(turnEnd({ kind: 'aborted' } as never))).toBe('\nInterrupted\n')
  })
})

describe('TranscriptRenderer history', () => {
  it('renders a window of events and ends on a line boundary', () => {
    const renderer = new TranscriptRenderer(options())
    const out = renderer.history([userEvent([text('q')]), liveEvent({ type: 'text-delta', text: 'a' })])
    expect(out).toBe('› q\n\na\n')
  })
})

describe('TranscriptRenderer files a turn produced', () => {
  const write = (callId: string, path: string, turn = 1) => callEvent(callId, 'write', { file_path: path, content: 'x' }, turn)

  it('says how many files a turn changed when it ends, once their writes succeeded', () => {
    const out = render([
      write('c1', '/work/app/a.ts'), resultEvent('c1', 'ok'),
      write('c2', '/work/app/b.ts'), resultEvent('c2', 'denied', { isError: true }),
      turnEnd({ kind: 'completed' }),
    ])
    expect(out.endsWith('Files changed: 1 · /deliverables lists them\n')).toBe(true)
  })

  it('puts the count after the reason an interrupted turn ended', () => {
    const out = render([write('c1', '/work/app/a.ts'), resultEvent('c1', 'ok'), turnEnd({ kind: 'aborted', reason: { kind: 'legacy' } })])
    expect(out.endsWith('Interrupted\nFiles changed: 1 · /deliverables lists them\n')).toBe(true)
  })

  it('prints the files the agent presents as they are declared', () => {
    const out = render([
      assistantEvent(1, 1, [text('Done')]),
      wireEvent('deliverables/presented', { turn: 1, callId: 'c9', files: [{ path: 'report.md', description: 'Summary' }] }),
    ])
    expect(out).toBe('Done\nPresented report.md — Summary\n')
  })
})

describe('TranscriptRenderer workflow runs', () => {
  it('prints a run, its members and how it ended, with a blank line before the run', () => {
    const out = render([
      userEvent([text('go')]),
      wireEvent('tool-workflow/run-start', { runId: 'r1', name: 'review' }),
      wireEvent('tool-workflow/agent-start', { runId: 'r1', seq: 1, label: 'lint' }),
      wireEvent('tool-workflow/agent-end', { runId: 'r1', seq: 1, outcome: 'completed' }),
      wireEvent('tool-workflow/run-end', { runId: 'r1', stopReason: 'completed' }),
    ])
    expect(out).toBe('› go\n\nWorkflow review\n  lint started\n  lint completed\nWorkflow review completed\n')
  })

  it('shows nothing for a workflow event without a run id', () => {
    expect(render([wireEvent('tool-workflow/agent-start', {})])).toBe('')
  })
})
