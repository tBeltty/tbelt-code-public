// @vitest-environment jsdom
/**
 * The Artifacts page: the Session-wide index over engine-published Turn data,
 * the page body grouped by Turn, and the Session-header button.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  ConversationLocationDataSource, ConversationLocationDataStore, ConversationTimelineSnapshot, ConversationTurnDataMap,
  TurnLocation,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { ArtifactsButton } from '../src/client/ArtifactsButton.tsx'
import { ArtifactsTab, type ArtifactsTabProps } from '../src/client/ArtifactsTab.tsx'
import { ChangesDiffStore } from '../src/client/changes-diff.ts'
import { ChangesSummaryStore } from '../src/client/changes-summary.ts'
import { PresentedOpenController } from '../src/client/present-open.ts'
import { artifactTurn, sessionArtifacts, type ArtifactTurn } from '../src/client/session-artifacts.ts'
import type { DeliverablesTurnData } from '../src/client/turn-deliverables.ts'
import { en, zh } from '../src/client/locales.ts'
import { changesSummaryUrl } from '../src/changes.ts'
import { renderFileActions } from './file-actions.tsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** A Turn data store whose Deliverables value can change and notify after creation. */
class LiveTurnData implements ConversationLocationDataStore<ConversationTurnDataMap> {
  private readonly value = createSnapshotStore<DeliverablesTurnData | undefined>(undefined)

  get<Key extends Extract<keyof ConversationTurnDataMap, string>>(key: Key): Readonly<ConversationTurnDataMap[Key]> | undefined {
    return key === 'deliverables' ? this.value.getSnapshot() as Readonly<ConversationTurnDataMap[Key]> | undefined : undefined
  }

  source<Key extends Extract<keyof ConversationTurnDataMap, string>>(
    key: Key,
  ): ConversationLocationDataSource<Readonly<ConversationTurnDataMap[Key]> | undefined> {
    return { getSnapshot: () => this.get(key), subscribe: listener => this.value.subscribe(listener) }
  }

  set(value: DeliverablesTurnData | undefined): void {
    this.value.set(value)
  }
}

function timelineOf(...turns: ReadonlyArray<readonly [turn: number, data: LiveTurnData]>): ConversationTimelineSnapshot {
  const locations = new Map<number, TurnLocation>()
  for (const [turn, data] of turns) locations.set(turn, { turn, start: undefined, end: undefined, status: 'closed', steps: [], data })
  return { turnOrder: turns.map(([turn]) => turn), turns: locations }
}

const delivered = (...paths: string[]): DeliverablesTurnData => ({
  produced: [],
  presented: paths.map((path, index) => ({ path, seq: 10, index })),
})

describe('Session artifact index', () => {
  it('keeps the latest declaration of each path and skips Turns without artifacts', () => {
    expect(artifactTurn(1, undefined)).toBeNull()
    expect(artifactTurn(1, { produced: [{ seq: 2, path: 'a.ts' }] })).toBeNull()
    expect(artifactTurn(2, {
      produced: [],
      presented: [{ path: 'r.md', seq: 3, index: 0 }, { path: 'r.md', seq: 5, index: 0, description: 'v2' }],
    })).toEqual({ turn: 2, changes: null, presented: [{ path: 'r.md', seq: 5, index: 0, description: 'v2' }] })
    expect(artifactTurn(3, { produced: [], changes: { seq: 7 } })).toEqual({ turn: 3, changes: { seq: 7 }, presented: [] })
  })

  it('lists newest Turns first and follows data published after subscription', () => {
    const first = new LiveTurnData()
    const second = new LiveTurnData()
    first.set(delivered('a.md'))
    const timeline = createSnapshotStore<ConversationTimelineSnapshot | undefined>(undefined)
    const index = sessionArtifacts(timeline)
    expect(index.getSnapshot()).toEqual([])
    const listener = vi.fn()
    const stop = index.subscribe(listener)
    timeline.set(timelineOf([1, first], [2, second]))
    expect(listener).toHaveBeenCalledTimes(1)
    const before = index.getSnapshot()
    expect(before.map(turn => turn.turn)).toEqual([1])
    expect(index.getSnapshot()).toBe(before)
    second.set(delivered('b.md'))
    expect(listener).toHaveBeenCalledTimes(2)
    expect(index.getSnapshot().map(turn => turn.turn)).toEqual([2, 1])
    stop()
    first.set(delivered('c.md'))
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

function source(turns: readonly ArtifactTurn[]): ObservableSnapshot<readonly ArtifactTurn[]> {
  return { getSnapshot: () => turns, subscribe: () => () => {} }
}

function tabProps(turns: readonly ArtifactTurn[], locale: typeof en = en) {
  const controller = new PresentedOpenController()
  controller.host.set({ name: 'desktop', available: true, fileManager: 'finder' })
  const summaries = new ChangesSummaryStore()
  summaries.state.set({ [changesSummaryUrl(SessionId('session'), 7)]: {
    turn: 2, files: [{ path: 'src/a.ts', display: 'src/a.ts', added: 3, deleted: 1 }], total: 1, added: 3, deleted: 1,
  } })
  const diffs = new ChangesDiffStore()
  const sessions: SessionListState = {
    ids: [], byId: { session: { cwd: '/work' } } as never, phase: 'ready', projectionsBySession: {},
  }
  const openResource = vi.fn()
  const openPresented = vi.fn<PresentedOpenController['open']>().mockResolvedValue(null)
  const openChangesReview = vi.fn()
  const props = {
    sessionId: SessionId('session'),
    useSessions: <T,>(select: (state: SessionListState) => T): T => select(sessions),
    useTabInfo: () => ({ tab: { actions: { openResource } } }),
    artifacts: () => source(turns),
    renderSlot: renderFileActions,
    useShowCodeDiff: <T,>(select: (value: boolean) => T): T => select(true),
    useChangesDiff: <T,>(select: (state: ReturnType<typeof diffs.state.getSnapshot>) => T): T => select(diffs.state.getSnapshot()),
    loadChangesDiff: vi.fn(),
    useChangesSummary: <T,>(select: (state: ReturnType<typeof summaries.state.getSnapshot>) => T): T =>
      select(summaries.state.getSnapshot()),
    loadChangesSummary: vi.fn(),
    usePresentedHost: <T,>(select: (state: ReturnType<typeof controller.host.getSnapshot>) => T): T =>
      select(controller.host.getSnapshot()),
    usePresentedOpen: <T,>(select: (state: ReturnType<typeof controller.state.getSnapshot>) => T): T =>
      select(controller.state.getSnapshot()),
    reloadPresentedHost: vi.fn(),
    openPresented,
    openChanged: vi.fn(),
    openChangesReview,
    t: makeTranslate(locale),
  }
  // The framework shares the tab body does not read stay out of this bench.
  const typed: ArtifactsTabProps = props as never
  return { props: typed, openResource, openPresented, openChangesReview }
}

function renderTab(
  turns: readonly ArtifactTurn[], locale: typeof en = en,
): ReturnType<typeof tabProps> & { view: ReturnType<typeof render> } {
  const setup = tabProps(turns, locale)
  return { ...setup, view: render(<ArtifactsTab {...setup.props} />) }
}

describe('Artifacts page', () => {
  it.each([en, zh])('says what will appear while no loaded Turn has artifacts', (locale) => {
    const { view } = renderTab([], locale)
    expect(view.container.querySelector('[data-artifacts-empty]')).not.toBeNull()
    expect(view.getByText(locale['artifacts.emptyTitle'])).toBeTruthy()
  })

  it('groups the cards by Turn, newest first, and opens files beside the page', () => {
    const { view, openResource, openPresented } = renderTab([
      { turn: 3, changes: null, presented: [{ path: 'out/summary.md', seq: 9, index: 0 }] },
      { turn: 1, changes: null, presented: [{ path: 'out/report.md', seq: 4, index: 0, description: 'Report' }] },
    ])
    const turns = [...view.container.querySelectorAll('[data-artifacts-turn]')]
    expect(turns.map(turn => turn.getAttribute('data-artifacts-turn'))).toEqual(['3', '1'])
    expect(view.getByText('Turn 3')).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: 'Preview out/report.md in sidebar' }))
    expect(openResource).toHaveBeenCalledExactlyOnceWith('dsh-resource://file/session/session/out/report.md')
    fireEvent.click(view.getAllByRole('button', { name: 'Native file action' })[1] as HTMLElement)
    expect(openPresented).toHaveBeenCalledWith('session', 4, 0, 'open', undefined)
  })

  it('never lists code changes, even when the developer-tools setting would show them', () => {
    const { view, openChangesReview } = renderTab([
      { turn: 2, changes: { seq: 7 }, presented: [] },
      { turn: 1, changes: { seq: 3 }, presented: [{ path: 'a.md', seq: 4, index: 0 }] },
    ])
    const turns = [...view.container.querySelectorAll('[data-artifacts-turn]')]
    expect(turns.map(turn => turn.getAttribute('data-artifacts-turn'))).toEqual(['1'])
    expect(view.queryByText('Edited a.ts')).toBeNull()
    expect(openChangesReview).not.toHaveBeenCalled()
  })
})

describe('Artifacts header button', () => {
  function renderButton(turns: readonly ArtifactTurn[]): { view: ReturnType<typeof render>; openArtifacts: () => void } {
    const openArtifacts = vi.fn()
    const props: Parameters<typeof ArtifactsButton>[0] = {
      sessionId: SessionId('session'),
      artifacts: () => source(turns),
      openArtifacts,
      t: makeTranslate(en),
    } as never
    const view = render(<ArtifactsButton {...props} />)
    return { view, openArtifacts }
  }

  it('counts delivered files and opens the page', () => {
    const { view, openArtifacts } = renderButton([
      { turn: 2, changes: { seq: 7 }, presented: [{ path: 'a.md', seq: 4, index: 0 }, { path: 'b.md', seq: 4, index: 1 }] },
      { turn: 1, changes: null, presented: [{ path: 'c.md', seq: 2, index: 0 }] },
    ])
    expect(view.container.querySelector('[data-artifacts-count]')?.textContent).toBe('3')
    fireEvent.click(view.getByRole('button', { name: 'Show this session’s artifacts, 3 delivered files' }))
    expect(openArtifacts).toHaveBeenCalledTimes(1)
  })

  it('shows no count before anything is delivered', () => {
    const { view } = renderButton([])
    expect(view.container.querySelector('[data-artifacts-count]')).toBeNull()
    expect(view.getByRole('button', { name: 'Show this session’s artifacts' })).toBeTruthy()
  })
})
