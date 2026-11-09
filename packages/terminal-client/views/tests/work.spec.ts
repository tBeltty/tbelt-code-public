import { describe, expect, it } from 'vitest'
import { createStyle } from '../src/ansi.ts'
import { jobIsLive, jobItems, jobOutputLines } from '../src/jobs.ts'
import type { JobRow } from '../src/jobs.ts'
import { skillItems, skillMessage } from '../src/skills.ts'
import { subagentItems, subagentRows } from '../src/subagent.ts'

const plain = createStyle(false)

describe('skills', () => {
  it('names each skill as the command that runs it, with a one-line description', () => {
    expect(skillItems([{ name: 'review', description: 'Review the\nchanges' }])).toEqual([
      { value: 'review', label: '/review', detail: 'Review the changes' },
    ])
  })

  it('builds the message that invokes a skill', () => {
    expect(skillMessage('review', '')).toBe('/review')
    expect(skillMessage('review', 'src/')).toBe('/review src/')
  })
})

describe('subagents', () => {
  it('reads the catalog and skips entries without an id or a known mode', () => {
    expect(subagentRows([
      { id: 'session-aaaa1111', mode: 'continuable', label: 'Researcher' },
      { id: 'session-bbbb2222', mode: 'one-shot' },
      { id: 'session-cccc3333', mode: 'unknown', label: '' },
      { id: 'session-dddd4444', mode: 'strange' },
      { mode: 'one-shot' },
      null,
    ])).toEqual([
      { id: 'session-aaaa1111', mode: 'continuable', label: 'Researcher' },
      { id: 'session-bbbb2222', mode: 'one-shot', label: undefined },
      { id: 'session-cccc3333', mode: 'unknown', label: undefined },
    ])
    expect(subagentRows(undefined)).toEqual([])
  })

  it('names a child by its label or its short id and says how it can be used', () => {
    expect(subagentItems([
      { id: 'session-aaaa1111-x', mode: 'continuable', label: 'Researcher' },
      { id: 'session-bbbb2222-x', mode: 'one-shot', label: undefined },
    ])).toEqual([
      { value: 'session-aaaa1111-x', label: 'Researcher', detail: 'can be continued' },
      { value: 'session-bbbb2222-x', label: 'bbbb2222', detail: 'one task' },
    ])
  })
})

const job = (over: Partial<JobRow> = {}): JobRow => ({ id: 'j1', kind: 'shell', label: 'npm test', status: 'running', startedAt: 1000, ...over })

describe('jobs', () => {
  it('lists status, run time and progress, counting up to now while a job runs and to its end once it has finished', () => {
    expect(jobItems([job({ progress: '3/10' }), job({ id: 'j2', status: 'failed', startedAt: 0, finishedAt: 61_000, progress: '' })], 6000)).toEqual([
      { value: 'j1', label: 'npm test', detail: 'running · 5s · 3/10' },
      { value: 'j2', label: 'npm test', detail: 'failed · 1m 01s' },
    ])
  })

  it('stops only a job that runs', () => {
    expect(jobIsLive(job())).toBe(true)
    expect(jobIsLive(job({ status: 'stopping' }))).toBe(false)
  })

  it('shows the last lines of output, and what is missing before them', () => {
    const output = { text: 'a\nb\nc\nd\n', gapBefore: true, streaming: true, error: undefined }
    expect(jobOutputLines(plain, output, 2)).toEqual([
      '… output before this was dropped', '… 2 earlier lines', 'c', 'd', 'Still running. Open the job again for more.',
    ])
    expect(jobOutputLines(plain, { ...output, text: 'x', gapBefore: false, streaming: false }, 5)).toEqual(['x'])
  })

  it('says when there is no output yet and when following failed', () => {
    expect(jobOutputLines(plain, undefined, 5)).toEqual(['No output yet.'])
    expect(jobOutputLines(plain, { text: '', gapBefore: false, streaming: false, error: 'boom' }, 5)).toEqual([
      'No output yet.', 'Could not follow the job: boom',
    ])
  })
})
