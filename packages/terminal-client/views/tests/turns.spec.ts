import { describe, expect, it } from 'vitest'
import { createStyle } from '../src/ansi.ts'
import { changedSummaryLine, DeliverablesTracker, deliverableLines, mutationPath, presentedLines, turnDeliverables } from '../src/deliverables.ts'
import { lastReply, ratingItems } from '../src/feedback.ts'
import { FORK_END, forkItems, ledgerLines, outlineRows, statsRow, trajectoryHeader, trajectoryItems, turnSlices } from '../src/trajectory.ts'
import { isWorkflowEvent, WorkflowRunLines } from '../src/workflow-run.ts'
import { assistantEvent, callEvent, resultEvent, text, turnEnd, userEvent, wireEvent } from './fixtures.ts'

const plain = createStyle(false)

describe('mutationPath', () => {
  it('names the file of a complete write, edit or editor change', () => {
    expect(mutationPath('write', JSON.stringify({ file_path: 'a.ts', content: '' }))).toBe('a.ts')
    expect(mutationPath('edit', JSON.stringify({ file_path: 'b.ts', old_string: 'x', new_string: 'y' }))).toBe('b.ts')
    const editor = (args: object): string | undefined => mutationPath('str_replace_editor', JSON.stringify(args))
    expect(editor({ command: 'create', path: 'c.ts', file_text: '' })).toBe('c.ts')
    expect(editor({ command: 'str_replace', path: 'd.ts', old_str: 'x' })).toBe('d.ts')
    expect(editor({ command: 'insert', path: 'e.ts', insert_line: 3, new_str: 'z' })).toBe('e.ts')
  })

  it('names nothing for a call that does not change a file', () => {
    expect(mutationPath('read', '{"file_path":"a"}')).toBeUndefined()
    expect(mutationPath('write', '{"file_path":"a"}')).toBeUndefined()
    expect(mutationPath('write', '{"file_path":"  ","content":""}')).toBeUndefined()
    expect(mutationPath('edit', '{"file_path":"a","old_string":"","new_string":"y"}')).toBeUndefined()
    expect(mutationPath('edit', '{"file_path":"a","old_string":"x","new_string":"x"}')).toBeUndefined()
    expect(mutationPath('edit', '{"file_path":"a","old_string":"x"}')).toBeUndefined()
    const editor = (args: object): string | undefined => mutationPath('str_replace_editor', JSON.stringify(args))
    expect(editor({ command: 'view', path: 'a' })).toBeUndefined()
    expect(editor({ command: 'create', file_text: '' })).toBeUndefined()
    expect(editor({ command: 'create', path: 'a' })).toBeUndefined()
    expect(editor({ command: 'str_replace', path: 'a', old_str: '' })).toBeUndefined()
    expect(editor({ command: 'insert', path: 'a', insert_line: 1.5, new_str: 'z' })).toBeUndefined()
    expect(mutationPath('write', 'not json')).toBeUndefined()
    expect(mutationPath('write', '[1]')).toBeUndefined()
  })
})

const write = (callId: string, path: string, turn = 1) => callEvent(callId, 'write', { file_path: path, content: 'x' }, turn)

describe('DeliverablesTracker', () => {
  it('counts a file once its write succeeded, and once however often it is touched', () => {
    const tracker = new DeliverablesTracker()
    for (const event of [
      write('c1', 'a.ts'), resultEvent('c1', 'ok'),
      write('c2', 'a.ts'), resultEvent('c2', 'ok'),
      write('c3', 'b.ts'), resultEvent('c3', 'denied', { isError: true }),
      write('c4', 'c.ts'),
      resultEvent('c9', 'result of a call this turn never saw'),
      callEvent('c5', 'read', { file_path: 'a.ts' }), resultEvent('c5', 'ok'),
    ]) tracker.observe(event)
    expect(tracker.turn(1)).toEqual({ turn: 1, produced: ['a.ts'], presented: [] })
    expect(tracker.turn(2)).toBeUndefined()
  })

  it('keeps presented files by turn and returns the ones a new event declares', () => {
    const tracker = new DeliverablesTracker()
    const declared = tracker.observe(wireEvent('deliverables/presented', {
      turn: 2, callId: 'c1', files: [{ path: 'report.md', description: 'Summary' }, { path: 'data.csv' }, { path: ' ' }, 'x', null],
    }))
    expect(declared).toEqual([{ path: 'report.md', description: 'Summary' }, { path: 'data.csv', description: undefined }])
    expect(tracker.observe(wireEvent('deliverables/presented', { turn: 'two', files: [] }))).toEqual([])
    expect(tracker.observe(wireEvent('deliverables/presented', { turn: 2, files: 'nope' }))).toEqual([])
    expect(tracker.observe(wireEvent('something/else', {}))).toEqual([])
    expect(tracker.observe(turnEnd({ kind: 'completed' }))).toEqual([])
    expect(tracker.turn(2)?.presented).toHaveLength(2)
    expect(tracker.observe(wireEvent('deliverables/presented', { turn: 5, files: [] }))).toEqual([])
    expect(tracker.turn(5)).toBeUndefined()
  })

  it('lists the turns that produced anything, oldest first', () => {
    const events = [
      write('c1', 'late.ts', 3), resultEvent('c1', 'ok'),
      wireEvent('deliverables/presented', { turn: 1, files: [{ path: 'early.md' }] }),
    ]
    expect(turnDeliverables(events).map(turn => turn.turn)).toEqual([1, 3])
  })
})

describe('deliverable lines', () => {
  it('writes the summary, the presented files and a turn in full', () => {
    expect(changedSummaryLine(plain, 2)).toBe('Files changed: 2 · /deliverables lists them')
    expect(presentedLines(plain, [{ path: 'a.md', description: 'Notes' }, { path: 'b.md', description: undefined }])).toEqual([
      'Presented a.md — Notes', 'Presented b.md',
    ])
    expect(deliverableLines(plain, { turn: 3, produced: ['a.ts'], presented: [{ path: 'r.md', description: undefined }] })).toEqual([
      'Turn 3', 'Changed, 1', '  a.ts', 'Presented, 1', '  Presented r.md',
    ])
    expect(deliverableLines(plain, { turn: 4, produced: [], presented: [] })).toEqual(['Turn 4'])
  })
})

describe('trajectory', () => {
  it('reads the outline and the totals from wire data', () => {
    expect(outlineRows([{ turn: 1, prompt: 'Fix it', response: 'Done' }, { turn: 2 }, { prompt: 'no turn' }, null])).toEqual([
      { turn: 1, prompt: 'Fix it', response: 'Done' }, { turn: 2, prompt: '', response: '' },
    ])
    expect(outlineRows(undefined)).toEqual([])
    expect(statsRow({ turns: 2, steps: 5, llmMs: 1500, toolMs: 300 })).toEqual({ turns: 2, steps: 5, llmMs: 1500, toolMs: 300 })
    expect(statsRow({ turns: 2 })).toBeUndefined()
    expect(trajectoryHeader(plain, { turns: 2, steps: 5, llmMs: 1500, toolMs: 300 })).toEqual(['2 turns · 5 steps · model 1s · tools 300ms'])
  })

  const turn = (n: number, ...events: ReturnType<typeof wireEvent>[]) => [wireEvent('turn/start', { turn: n }, 1000), ...events]

  it('splits events by turn and drops what comes before the first start', () => {
    const slices = turnSlices([userEvent([text('lost')]), ...turn(1, userEvent([text('hi')])), ...turn(2, turnEnd({ kind: 'completed' }, 2))])
    expect([...slices.keys()]).toEqual([1, 2])
    expect(slices.get(1)).toHaveLength(2)
    expect(turnSlices([wireEvent('turn/start', { turn: 1 }), wireEvent('turn/start', { turn: 1 })]).get(1)).toHaveLength(2)
  })

  it('lists turns newest first with the time their loaded events span', () => {
    const rows = [{ turn: 1, prompt: 'First', response: '' }, { turn: 2, prompt: '', response: '' }]
    const slices = new Map([[1, [wireEvent('turn/start', { turn: 1 }, 1000), wireEvent('x', {}, 3500)]]])
    expect(trajectoryItems(rows, slices)).toEqual([
      { value: '2', label: '2. no prompt', detail: 'not loaded' },
      { value: '1', label: '1. First', detail: '2s' },
    ])
    expect(trajectoryItems([rows[0]!], new Map([[1, []]]))[0]!.detail).toBe('0ms')
  })

  it('prints the events of a turn in order with the time since it began', () => {
    const lines = ledgerLines(plain, [
      wireEvent('turn/start', { turn: 1 }, 1000),
      wireEvent('user/message', { content: [{ type: 'text', text: 'run the tests' }, 'odd'] }, 1000),
      wireEvent('tool/call', { callId: 'c1', name: 'bash' }, 1200),
      wireEvent('tool/result', { message: { toolCallId: 'c1' } }, 2200),
      wireEvent('tool/call', { callId: 'c2', name: 'edit' }, 2300),
      wireEvent('tool/result', { message: { toolCallId: 'c2', isError: true } }, 2400),
      wireEvent('tool/result', { message: { toolCallId: 'unknown' } }, 2500),
      wireEvent('assistant/message', { message: { content: [{ type: 'text', text: 'All green' }] } }, 3000),
      wireEvent('assistant/message', { message: 'odd' }, 3100),
      wireEvent('user/message', { content: 'odd' }, 3200),
      wireEvent('step/start', {}, 3300),
      wireEvent('turn/end', { reason: { kind: 'completed' } }, 4000),
      wireEvent('turn/end', {}, 4100),
    ])
    expect(lines).toEqual([
      '   +0.0s  you: run the tests',
      '   +0.2s  call bash',
      '   +1.2s  result bash',
      '   +1.3s  call edit',
      '   +1.4s  failed edit',
      '   +1.5s  result ',
      '   +2.0s  reply: All green',
      '   +2.1s  reply: ',
      '   +2.2s  you: ',
      '   +3.0s  end completed',
      '   +3.1s  end ',
    ])
    expect(ledgerLines(plain, [])).toEqual([])
    expect(ledgerLines(plain, [wireEvent('tool/call', {}, 1000)])).toEqual(['   +0.0s  call '])
    expect(ledgerLines(plain, [wireEvent('tool/result', {}, 1000)])).toEqual(['   +0.0s  result '])
  })

  it('offers the end of the conversation and every finished turn to fork at, newest first', () => {
    const end2 = turnEnd({ kind: 'completed' }, 2)
    const items = forkItems([
      ...turn(1, userEvent([text('first question')]), turnEnd({ kind: 'completed' }, 1)),
      ...turn(2, userEvent([text('second question')]), end2),
      ...turn(3, userEvent([text('still running')])),
      ...turn(4, turnEnd({ kind: 'aborted', reason: { kind: 'legacy' } }, 4)),
    ])
    expect(items.map(item => item.label)).toEqual([
      'The end of the conversation', 'After turn 4: ', 'After turn 2: second question', 'After turn 1: first question',
    ])
    expect(items[0]!.value).toBe(FORK_END)
    expect(items[2]!.value).toBe(String(end2.seq))
    expect(forkItems([])).toHaveLength(1)
  })
})

describe('feedback', () => {
  it('finds the newest reply that has text', () => {
    const first = assistantEvent(1, 1, [text('Earlier answer')])
    const silent = assistantEvent(2, 1, [text('  '), { type: 'reasoning', text: 'thinking' } as never])
    expect(lastReply([first, silent, userEvent([text('hi')])])).toEqual({ messageId: first.data.message.id, preview: 'Earlier answer' })
    expect(lastReply([silent])).toBeUndefined()
    expect(lastReply([])).toBeUndefined()
  })

  it('offers up and down, and removal once a rating exists', () => {
    expect(ratingItems(undefined).map(item => item.value)).toEqual(['positive', 'negative'])
    expect(ratingItems('negative')).toEqual([
      { value: 'positive', label: 'Good reply', current: false },
      { value: 'negative', label: 'Poor reply', current: true },
      { value: 'remove', label: 'Remove my rating' },
    ])
  })
})

describe('workflow runs', () => {
  const run = (lines: WorkflowRunLines, type: string, data: unknown): string[] => lines.lines(plain, type, data)

  it('recognizes the four event types', () => {
    expect(['run-start', 'agent-start', 'agent-end', 'run-end'].every(kind => isWorkflowEvent(`tool-workflow/${kind}`))).toBe(true)
    expect(isWorkflowEvent('tool-workflow/other')).toBe(false)
  })

  it('names a run, its phases and members, and how each ended', () => {
    const lines = new WorkflowRunLines()
    expect(run(lines, 'tool-workflow/run-start', { runId: 'r1', name: 'review' })).toEqual(['Workflow review'])
    expect(run(lines, 'tool-workflow/agent-start', { runId: 'r1', seq: 1, label: 'lint', phase: 'checks' })).toEqual(['  Phase checks', '  lint started'])
    expect(run(lines, 'tool-workflow/agent-start', { runId: 'r1', seq: 2, label: 'types', phase: 'checks' })).toEqual(['  types started'])
    expect(run(lines, 'tool-workflow/agent-start', { runId: 'r1', seq: 3, label: 'docs' })).toEqual(['  docs started'])
    expect(run(lines, 'tool-workflow/agent-end', { runId: 'r1', seq: 1, outcome: 'completed' })).toEqual(['  lint completed'])
    expect(run(lines, 'tool-workflow/agent-end', { runId: 'r1', seq: 2, outcome: 'failed' })).toEqual(['  types failed'])
    expect(run(lines, 'tool-workflow/agent-end', { runId: 'r1', seq: 3, outcome: 'cancelled' })).toEqual(['  docs cancelled'])
    expect(run(lines, 'tool-workflow/agent-end', { runId: 'r1', seq: 9 })).toEqual(['  agent stopped'])
    expect(run(lines, 'tool-workflow/run-end', { runId: 'r1', stopReason: 'completed' })).toEqual(['Workflow review completed'])
  })

  it('reports an error stop as failed, and copes with events it did not see begin', () => {
    const lines = new WorkflowRunLines()
    expect(run(lines, 'tool-workflow/run-end', { runId: 'r2', stopReason: 'error' })).toEqual(['Workflow run failed'])
    expect(run(lines, 'tool-workflow/run-end', { runId: 'r3' })).toEqual(['Workflow run stopped'])
    expect(run(lines, 'tool-workflow/run-start', {})).toEqual([])
    expect(run(lines, 'tool-workflow/run-start', { runId: 'r5' })).toEqual(['Workflow '])
    expect(run(lines, 'tool-workflow/agent-start', { runId: 'r4' })).toEqual(['   started'])
  })
})
