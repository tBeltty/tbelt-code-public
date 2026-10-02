// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import { en } from '../src/client/locales.ts'
import { anchorRange, blockAnchor, selectionAnchor } from '../src/client/anchor.ts'
import {
  addPlanComment, commentSession, createPlanCommentStore, formatPlanFeedback, planCommentExcerpt, removePlanComments,
  updatePlanComment, type PlanCommentState, type PlanCommentStore,
} from '../src/client/comments.ts'
import { PlanCommentChip, PlanReviewDecision } from '../src/client/PlanCommentControls.tsx'
import { PlanPreview } from '../src/client/PlanPreview.tsx'
import { planAddress } from '../src/client/plan.ts'
import { reviewPreviewAddress } from '../src/client/review-preview.ts'

const t = makeTranslate(en, commonEn)
const SID = 'session-1' as SessionId
const markdown = '# Ship the picker\n\nRead the store, then render the rows.\n\n- Build the list\n- Ship it'
const address = planAddress({ session: { kind: 'session', sessionId: SID }, callId: 'call-1' as ToolCallId })

/** Minimal CSS Custom Highlight registry; jsdom implements neither `Highlight` nor `CSS.highlights`. */
class FakeHighlight {
  readonly ranges: Range[]
  constructor(...ranges: Range[]) { this.ranges = ranges }
}
const highlights = new Map<string, FakeHighlight>()
const highlighted = (): string[] => highlights.get('dsh-plan-comment')?.ranges.map(range => range.toString()) ?? []

beforeEach(() => {
  highlights.clear()
  vi.stubGlobal('Highlight', FakeHighlight)
  vi.stubGlobal('CSS', { highlights })
  // jsdom omits Range geometry; the layer only reads it for placement.
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(10, 20, 30, 10) })
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A `use<Name>` selector hook over the real comment store. */
function hookOf(store: PlanCommentStore) {
  return function usePlanComments<S>(select: (state: PlanCommentState) => S): S {
    return select(useSyncExternalStore(listener => store.subscribe(listener), () => store.getSnapshot()))
  }
}

/** The plan document and the composer chip sharing one comment store, as the plugin wires them. */
function renderDocument(store = createPlanCommentStore()) {
  const usePlanComments = hookOf(store)
  let next = 0
  const preview = {
    t, usePlanComments,
    useTabInfo: () => ({ tab: { title: 'Plan', navigation: { address } } }),
    useResource: () => ({ status: 'live', value: { callId: 'call-1', title: 'Ship the picker', markdown } }),
    addComment: (target: string, anchor: Parameters<typeof addPlanComment>[2], text: string) => {
      next += 1
      addPlanComment(store, target, { ...anchor, id: `comment-${String(next)}`, text })
    },
    updateComment: (target: string, id: string, text: string) => { updatePlanComment(store, target, id, text) },
    removeComment: (target: string, id: string) => { removePlanComments(store, target, [id]) },
  } as Parameters<typeof PlanPreview>[0]
  const chip = {
    t, sessionId: SID, usePlanComments,
    removeComments: (target: string, ids: readonly string[]) => { removePlanComments(store, target, ids) },
  } as Parameters<typeof PlanCommentChip>[0]
  render(<><PlanPreview {...preview} /><PlanCommentChip {...chip} /></>)
  return store
}

function select(node: Node, start: number, end: number): void {
  const range = document.createRange()
  range.setStart(node, start)
  range.setEnd(node, end)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
}

function writeComment(text: string, submit = en['comment.add']): void {
  fireEvent.change(screen.getByRole('textbox', { name: en['comment.placeholder'] }), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: submit }))
}

describe('plan document comments', () => {
  it('comments a text selection, highlights it, and counts it above the composer', () => {
    const store = renderDocument()
    expect(document.querySelector('[data-plan-comment-chip]')).toBeNull()
    const paragraph = screen.getByText('Read the store, then render the rows.')
    select(paragraph.firstChild!, 9, 14)
    fireEvent.mouseUp(paragraph)
    fireEvent.click(screen.getByRole('button', { name: en['comment.selectLabel'] }))
    expect(screen.getByRole('group', { name: en['comment.editor'] }).querySelector('blockquote')?.textContent).toBe('store')
    expect(screen.getByRole('button', { name: en['comment.add'] }).hasAttribute('disabled')).toBe(true)
    writeComment('  Which store?  ')
    expect(store.getSnapshot().documents[address]).toEqual([expect.objectContaining({ block: 1, quote: 'store', offset: 9, text: 'Which store?' })])
    expect(highlighted()).toEqual(['store'])
    expect(screen.getByRole('button', { name: '1 comment on this block' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '1 comment' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('comments a whole block from the margin and lists comments in document order', () => {
    const store = renderDocument()
    fireEvent.mouseMove(screen.getByText('Ship it'))
    fireEvent.click(screen.getByRole('button', { name: en['comment.block'] }))
    writeComment('Add a rollback step.')
    const list = screen.getByText('Build the list').closest('ul')!
    expect(store.getSnapshot().documents[address]?.[0]).toMatchObject({ block: 2, quote: list.textContent.trim(), text: 'Add a rollback step.' })
    fireEvent.mouseMove(screen.getByRole('heading', { name: 'Ship the picker' }))
    fireEvent.click(screen.getByRole('button', { name: en['comment.block'] }))
    writeComment('Rename it.')
    fireEvent.click(screen.getByRole('button', { name: '2 comments' }))
    const items = [...screen.getByRole('list', { name: en['comments.list'] }).querySelectorAll('[data-plan-comment] p')]
    expect(items.map(item => item.textContent)).toEqual(['Rename it.', 'Add a rollback step.'])
    expect(highlighted()).toEqual(['Ship the picker', list.textContent.trim()])
  })

  it('cancels a draft with Escape and saves with Ctrl+Enter', () => {
    const store = renderDocument()
    fireEvent.mouseMove(screen.getByText('Build the list'))
    fireEvent.click(screen.getByRole('button', { name: en['comment.block'] }))
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
    expect(screen.queryByRole('textbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en['comment.block'] }))
    const box = screen.getByRole('textbox')
    fireEvent.change(box, { target: { value: 'Split this.' } })
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true })
    expect(store.getSnapshot().documents[address]).toHaveLength(1)
  })

  it('edits and deletes comments from the margin marker and the composer chip', async () => {
    const store = renderDocument()
    const paragraph = screen.getByText('Read the store, then render the rows.')
    select(paragraph.firstChild!, 0, 4)
    fireEvent.mouseUp(paragraph)
    fireEvent.click(screen.getByRole('button', { name: en['comment.selectLabel'] }))
    writeComment('First')
    select(paragraph.firstChild!, 21, 27)
    fireEvent.keyUp(paragraph)
    fireEvent.click(screen.getByRole('button', { name: en['comment.selectLabel'] }))
    writeComment('Second')
    fireEvent.click(screen.getByRole('button', { name: '2 comments on this block' }))
    const editors = screen.getAllByRole('button', { name: en['comment.edit'] })
    fireEvent.click(editors[1]!)
    writeComment('Second, edited', en['comment.save'])
    expect(store.getSnapshot().documents[address]?.map(comment => comment.text)).toEqual(['First', 'Second, edited'])
    fireEvent.click(screen.getAllByRole('button', { name: en['comment.remove'] })[0]!)
    expect(store.getSnapshot().documents[address]?.map(comment => comment.text)).toEqual(['Second, edited'])
    expect(highlighted()).toEqual(['render'])
    fireEvent.click(screen.getByRole('button', { name: '1 comment' }))
    const chipList = screen.getByRole('list', { name: en['comments.list'] })
    fireEvent.click(chipList.querySelector('button')!)
    await waitFor(() => { expect(document.querySelector('[data-plan-comment-chip]')).toBeNull() })
    expect(store.getSnapshot().documents).toEqual({})
    expect(highlights.has('dsh-plan-comment')).toBe(false)
  })

  it('ignores selections that start outside the document or hold only whitespace', () => {
    renderDocument()
    const chip = document.body.appendChild(document.createElement('p'))
    chip.textContent = 'outside'
    select(chip.firstChild!, 0, 3)
    fireEvent.mouseUp(screen.getByText('Read the store, then render the rows.'))
    expect(screen.queryByRole('button', { name: en['comment.selectLabel'] })).toBeNull()
    chip.remove()
  })
})

describe('plan comment anchors', () => {
  function rendered(html: string): Element {
    const root = document.createElement('div')
    root.innerHTML = html
    return root
  }

  it('clips a selection to its starting block and relocates a quote after the document changes', () => {
    const root = rendered('<p>alpha beta alpha</p>\n<p>gamma <b>delta</b></p>')
    const range = document.createRange()
    range.setStart(root.children[0]!.firstChild!, 11)
    range.setEnd(root.children[1]!.firstChild!, 3)
    expect(selectionAnchor(root, range)).toEqual({ block: 0, quote: 'alpha', offset: 11 })
    expect(anchorRange(root, { block: 0, quote: 'alpha', offset: 11 })?.range.startOffset).toBe(11)
    expect(anchorRange(root, { block: 0, quote: 'gamma delta', offset: 0 })).toMatchObject({ block: 1 })
    expect(anchorRange(root, { block: 0, quote: 'gamma delta', offset: 0 })?.range.toString()).toBe('gamma delta')
    expect(anchorRange(root, { block: 4, quote: 'missing', offset: 0 })).toBeUndefined()
    expect(blockAnchor(root, 1)).toEqual({ block: 1, quote: 'gamma delta', offset: 0 })
    expect(blockAnchor(root, 7)).toBeUndefined()
  })
})

describe('plan comment feedback text', () => {
  it('quotes each excerpt before its comment and shortens long excerpts at a word boundary', () => {
    const long = `${'word '.repeat(60)}end`
    expect(planCommentExcerpt('  two\n\nlines  ')).toBe('two lines')
    expect(planCommentExcerpt(long)).toBe(`${'word '.repeat(39)}word…`)
    expect(planCommentExcerpt('x'.repeat(250))).toBe(`${'x'.repeat(200)}…`)
    expect(formatPlanFeedback([
      { id: 'a', block: 0, quote: 'Read the\nstore', offset: 0, text: 'Which store?' },
      { id: 'b', block: 2, quote: 'Ship it', offset: 0, text: 'Add a rollback.\nThen ship.' },
    ])).toBe('> Read the store\nWhich store?\n\n> Ship it\nAdd a rollback.\nThen ship.')
  })

  it('assigns comments to the Session that submitted the plan', () => {
    expect(commentSession(address)).toBe(SID)
    expect(commentSession(reviewPreviewAddress(SID, 'window:q'))).toBe(SID)
    expect(commentSession(planAddress({ session: { kind: 'subagent', parentSessionId: SID, childSessionId: 'c' as SessionId, mode: 'continuable' }, callId: 'x' as ToolCallId }))).toBeUndefined()
    expect(commentSession('dsh-resource://plan-review/%ZZ/q')).toBeUndefined()
    expect(commentSession('file:///plan.md')).toBeUndefined()
  })
})

describe('plan review decision', () => {
  const review = { id: 'plan-review', question: 'Approve?', plan: markdown, callId: 'call-1' as ToolCallId, approve: { label: 'Approve', description: 'Leave plan mode.' } }

  function renderDecision(store: PlanCommentStore, sent = true) {
    const approve = vi.fn(() => Promise.resolve(sent))
    const keepPlanning = vi.fn((_feedback: string) => Promise.resolve(sent))
    const props = {
      t, review, requestKey: 'question:1', busy: false, approve, keepPlanning,
      usePlanComments: hookOf(store), documentOf: () => address,
      removeComments: (target: string, ids: readonly string[]) => { removePlanComments(store, target, ids) },
    } as Parameters<typeof PlanReviewDecision>[0]
    render(<PlanReviewDecision {...props} />)
    return { approve, keepPlanning }
  }
  function commented(): PlanCommentStore {
    const store = createPlanCommentStore()
    addPlanComment(store, address, { id: 'late', block: 2, quote: 'Ship it', offset: 17, text: 'Add a rollback step.' })
    addPlanComment(store, address, { id: 'early', block: 1, quote: 'store', offset: 9, text: 'Which store?' })
    addPlanComment(store, address, { id: 'middle', block: 1, quote: 'rows', offset: 32, text: 'Paginate them.' })
    return store
  }

  it('approves directly while the review has no comments', () => {
    const { approve, keepPlanning } = renderDecision(createPlanCommentStore())
    const button = screen.getByRole('button', { name: en['review.approve'] })
    expect(button.getAttribute('title')).toBe('Leave plan mode.')
    fireEvent.click(button)
    expect(approve).toHaveBeenCalledOnce()
    expect(keepPlanning).not.toHaveBeenCalled()
  })

  it('sends comments in document order as keep-planning feedback and clears them once sent', async () => {
    const store = commented()
    const { approve, keepPlanning } = renderDecision(store)
    expect(screen.queryByRole('button', { name: en['review.approve'] })).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send 3 comments' })) })
    expect(keepPlanning).toHaveBeenCalledExactlyOnceWith('> store\nWhich store?\n\n> rows\nPaginate them.\n\n> Ship it\nAdd a rollback step.')
    expect(approve).not.toHaveBeenCalled()
    expect(store.getSnapshot().documents).toEqual({})
  })

  it('approves without comments only through the explicit action, which discards them', async () => {
    const store = commented()
    const { approve, keepPlanning } = renderDecision(store)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: en['review.approveWithout'] })) })
    expect(approve).toHaveBeenCalledOnce()
    expect(keepPlanning).not.toHaveBeenCalled()
    expect(store.getSnapshot().documents).toEqual({})
  })

  it('keeps comments when the decision is not sent', async () => {
    const store = commented()
    renderDecision(store, false)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send 3 comments' })) })
    expect(store.getSnapshot().documents[address]).toHaveLength(3)
    removePlanComments(store, address, ['late', 'middle'])
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Send 1 comment' })).toBeTruthy() })
  })
})
