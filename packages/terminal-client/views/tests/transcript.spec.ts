import { describe, expect, it } from 'vitest'
import { TranscriptRenderer } from '../src/transcript.ts'
import {
  assistantEvent, callEvent, liveEvent, options, resultEvent, text, turnEnd, userEvent,
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
