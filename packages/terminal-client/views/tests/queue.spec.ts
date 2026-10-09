import { describe, expect, it } from 'vitest'
import { createStyle } from '../src/ansi.ts'
import { queueItems, queueRows, queueStatusLine } from '../src/queue.ts'

const text = (value: string) => ({ type: 'text', text: value })
const wire = (id: string, ...content: unknown[]) => ({ id, content, source: { kind: 'user' } })

describe('queue rows', () => {
  it('reads the messages waiting for the next turn and ignores the ones waiting for the next step', () => {
    const rows = queueRows({
      'next-turn': [wire('m1', text('first   question\nsecond line')), wire('m2', text('one line'))],
      'next-step': [wire('m3', text('steer me'))],
    })
    expect(rows.map(row => row.id)).toEqual(['m1', 'm2'])
    expect(rows[0]).toMatchObject({ preview: 'first question second line', text: undefined, attachments: 0 })
    expect(rows[1]).toMatchObject({ preview: 'one line', text: 'one line', attachments: 0 })
  })

  it('counts images and files and leaves a message with attachments or no content uneditable', () => {
    const rows = queueRows({
      'next-turn': [
        wire('m1', text('look'), { type: 'image', attachment: {} }, { type: 'file', attachment: {} }),
        wire('m2', { type: 'image', attachment: {} }),
        wire('m3'),
      ],
    })
    expect(rows.map(row => [row.attachments, row.text])).toEqual([[2, undefined], [1, undefined], [0, undefined]])
    expect(rows[1]!.preview).toBe('')
  })

  it('skips wire entries that are not messages and tolerates an absent projection', () => {
    expect(queueRows(undefined)).toEqual([])
    expect(queueRows({ 'next-turn': 'nope' })).toEqual([])
    expect(queueRows({ 'next-turn': [null, 4, { id: 7, content: [] }, { id: 'm1' }, { id: 'm2', content: [null, { type: 'text' }] }] }))
      .toEqual([{ id: 'm2', preview: '', text: undefined, attachments: 0 }])
  })
})

describe('queue items', () => {
  it('shows the preview, or says a message is only an attachment, and counts attachments in the detail', () => {
    const items = queueItems([
      { id: 'a', preview: 'hello', text: 'hello', attachments: 0 },
      { id: 'b', preview: '', text: undefined, attachments: 2 },
    ])
    expect(items).toEqual([
      { value: 'a', label: 'hello', detail: undefined },
      { value: 'b', label: 'attachment only', detail: '2 attached' },
    ])
  })

  it('states how many messages wait', () => {
    expect(queueStatusLine(createStyle(false), 3)).toBe('3 queued · /queue edits them')
  })
})
