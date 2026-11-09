import { describe, expect, it } from 'vitest'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionStatus, SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { awaitsUser, sessionBucket, tallyBuckets } from '../src/client/attention.ts'
import { countAwaitingUser, deriveFlat, deriveGroups } from '../src/client/tree.ts'

const sid = (id: string) => id as SessionId
const summary = (id: string, updatedAt: number): SessionSummary => ({
  id: sid(id), title: id, displayTitle: id, running: false, blank: false, updatedAt, retainedBy: {},
})
const list = (...items: SessionSummary[]): SessionListState => ({
  ids: items.map(item => item.id),
  byId: Object.fromEntries(items.map(item => [item.id, item])),
  phase: 'ready', projectionsBySession: {},
})
const workspace = (id: string, sessionIds: string[]): WorkspaceView => ({
  workspaceId: id as WorkspaceId, path: `/projects/${id}`, title: id,
  sessionIds: sessionIds.map(sid), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})
const quiet: SessionStatus = { running: undefined, pendingInteraction: undefined, completionUnread: false }
const rows = (attentionOnly: boolean) => ({
  pinnedSessionIds: [], archivedSessionIds: [], archivedFilter: 'default' as const, attentionOnly,
})

describe('sessionBucket', () => {
  const idle = { running: false, runningSubagentCount: 0, completed: false }

  it('puts a pending interaction ahead of activity and completion', () => {
    expect(sessionBucket({ ...idle, running: true, completed: true, pendingInteraction: 'approval' })).toBe('attention')
  })

  it('treats own or descendant activity as working before an unviewed completion', () => {
    expect(sessionBucket({ ...idle, running: true, completed: true })).toBe('working')
    expect(sessionBucket({ ...idle, runningSubagentCount: 2, completed: true })).toBe('working')
  })

  it('reads an unviewed completion as done and anything else as idle', () => {
    expect(sessionBucket({ ...idle, completed: true })).toBe('done')
    expect(sessionBucket(idle)).toBe('idle')
  })

  it('awaits the user only in the attention and done buckets', () => {
    expect(['attention', 'working', 'done', 'idle'].map(bucket => awaitsUser(bucket as 'idle')))
      .toEqual([true, false, true, false])
  })

  it('tallies each bucket', () => {
    const idleFacts = { running: false, runningSubagentCount: 0, completed: false }
    expect(tallyBuckets([
      idleFacts, { ...idleFacts, completed: true }, { ...idleFacts, running: true },
      { ...idleFacts, pendingInteraction: 'question' }, { ...idleFacts, pendingInteraction: 'plan-review' },
    ])).toEqual({ attention: 2, working: 1, done: 1, idle: 1 })
  })
})

describe('attention filter', () => {
  const waiting = summary('waiting', 4)
  const finished = summary('finished', 3)
  const busy = summary('busy', 2)
  const calm = summary('calm', 1)
  const sessions = list(waiting, finished, busy, calm)
  const statuses: SessionStatusSnapshot = new Map([
    [waiting.id, { ...quiet, pendingInteraction: { kind: 'approval' } } as SessionStatus],
    [finished.id, { ...quiet, completionUnread: true }],
    [busy.id, { ...quiet, running: true } as SessionStatus],
  ])

  it('keeps only waiting and finished sessions in the flat list', () => {
    const ids = sessions.ids
    expect(deriveFlat(sessions, ids, rows(false), statuses).map(node => node.id)).toEqual(ids)
    expect(deriveFlat(sessions, ids, rows(true), statuses).map(node => node.id)).toEqual([waiting.id, finished.id])
  })

  it('drops groups with nothing awaiting the user and keeps their count truthful', () => {
    const groups = deriveGroups(
      sessions,
      [workspace('first', ['waiting', 'finished', 'busy']), workspace('second', ['calm'])],
      rows(true), statuses, { expandedGroups: ['first', 'second'] },
    )
    expect(groups.map(group => group.key)).toEqual(['first'])
    expect(groups[0]!.sessionCount).toBe(2)
    expect(groups[0]!.sessions.map(node => node.id)).toEqual([waiting.id, finished.id])
  })

  it('counts awaiting sessions, ignoring archived ones and blanks', () => {
    expect(countAwaitingUser(sessions, [], statuses)).toBe(2)
    expect(countAwaitingUser(sessions, [finished.id], statuses)).toBe(1)
    const blank = { ...summary('blank', 5), blank: true }
    expect(countAwaitingUser(list(blank), [], new Map([[blank.id, { ...quiet, completionUnread: true }]]))).toBe(0)
  })
})
