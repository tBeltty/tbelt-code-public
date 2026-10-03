/** Comment anchoring, editing, and highlighting over a rendered plan document. */
import {
  useEffect, useLayoutEffect, useMemo, useRef, useState,
  type KeyboardEvent, type MouseEvent, type SyntheticEvent,
} from 'react'
import {
  Button, IconCloseOutlineRegular, IconEditOutlineRegular, IconListPenOutlineRegular, IconPlusOutlineRegular,
  IconTrashOutlineRegular, MarkdownText, type MarkdownLabels,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import {
  anchorRange, blockAnchor, blockIndexOf, documentBlocks, paintCommentHighlights, selectionAnchor,
} from './anchor.ts'
import type { PlanComment, PlanCommentAnchor } from './comments.ts'
import css from './PlanComments.module.css'
import previewCss from './PlanPreview.module.css'

/** Props of the commentable plan document. */
export interface PlanCommentLayerProps extends PropsLocale<'plan'> {
  /** Plan Markdown. */
  readonly markdown: string
  /** Localized Markdown chrome, reference-stable per locale. */
  readonly labels: MarkdownLabels
  /** This document's comments; resolved ones are listed read-only and not highlighted. */
  readonly comments: readonly PlanComment[]
  /** Save a new comment. */
  readonly onAdd: (anchor: PlanCommentAnchor, text: string) => void
  /** Replace a comment's text. */
  readonly onUpdate: (id: string, text: string) => void
  /** Delete a comment. */
  readonly onRemove: (id: string) => void
}


interface Placed {
  readonly block: number
  readonly top: number
  readonly comments: readonly PlanComment[]
}

/** Overlay controls carry `data-plan-comment-ui` and are excluded from selection tracking. */
function insideOverlay(target: EventTarget): boolean {
  return target instanceof Element && target.closest('[data-plan-comment-ui]') !== null
}

/** Textarea with Cancel and a submit action; Escape cancels and Ctrl/Cmd+Enter submits. */
function CommentEditor({ initial, submitLabel, onCancel, onSubmit, t }: {
  initial: string
  submitLabel: string
  onCancel: () => void
  onSubmit: (text: string) => void
} & PropsLocale<'plan'>) {
  const [text, setText] = useState(initial)
  const trimmed = text.trim()
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && trimmed !== '') {
      event.preventDefault()
      onSubmit(trimmed)
    }
  }
  return (
    <div className={css.editor}>
      <textarea className={css.textarea} value={text} rows={3} autoFocus aria-label={t('comment.placeholder')}
        placeholder={t('comment.placeholder')} onChange={(event) => { setText(event.target.value) }} onKeyDown={onKeyDown} />
      <div className={css.editorActions}>
        <Button size="sm" variant="ghost" onClick={onCancel}>{t('comment.cancel')}</Button>
        <Button size="sm" variant="primary" disabled={trimmed === ''} onClick={() => { onSubmit(trimmed) }}>{submitLabel}</Button>
      </div>
    </div>
  )
}

/** One saved comment inside a block's comment list; unsent comments are editable in place. */
function CommentItem({ comment, onUpdate, onRemove, t }: {
  comment: PlanComment
  onUpdate: (id: string, text: string) => void
  onRemove: (id: string) => void
} & PropsLocale<'plan'>) {
  const [editing, setEditing] = useState(false)
  return (
    <li className={css.item} data-plan-comment={comment.id} data-resolved={comment.resolved === true ? '' : undefined}>
      <blockquote className={css.quote}>{comment.quote}</blockquote>
      {editing
        ? (
          <CommentEditor initial={comment.text} submitLabel={t('comment.save')} t={t}
            onCancel={() => { setEditing(false) }} onSubmit={(text) => { onUpdate(comment.id, text); setEditing(false) }} />
        )
        : (
          <div className={css.itemBody}>
            <p className={css.text}>{comment.text}</p>
            {comment.resolved === true
              ? <span className={css.resolved}>{t('comment.resolved')}</span>
              : (
                <button type="button" className={css.iconButton} aria-label={t('comment.edit')} title={t('comment.edit')}
                  onClick={() => { setEditing(true) }}><IconEditOutlineRegular size={14} /></button>
              )}
            <button type="button" className={css.iconButton} aria-label={t('comment.remove')} title={t('comment.remove')}
              onClick={() => { onRemove(comment.id) }}><IconTrashOutlineRegular size={14} /></button>
          </div>
        )}
    </li>
  )
}

/**
 * Render a plan document whose text accepts anchored comments. A text
 * selection shows a Comment button beside it; the hovered or caret block
 * shows a margin `+` that comments the whole block. Saved comments are
 * highlighted through the CSS Custom Highlight API and listed from a margin
 * marker per block, where they can be edited or deleted.
 * @param props - Document text, comments, editing callbacks, and copy.
 * @returns the commentable document.
 */
export function PlanCommentLayer({ markdown, labels, comments, onAdd, onUpdate, onRemove, t }: PlanCommentLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null)
  const documentRef = useRef<HTMLDivElement>(null)
  const owner = useRef({}).current
  const [selection, setSelection] = useState<{ anchor: PlanCommentAnchor; top: number; left: number } | undefined>()
  const [hover, setHover] = useState<{ block: number; top: number } | undefined>()
  const [draft, setDraft] = useState<{ anchor: PlanCommentAnchor; top: number } | undefined>()
  const [openBlock, setOpenBlock] = useState<number | undefined>()
  const [placed, setPlaced] = useState<readonly Placed[]>([])

  const markdownRoot = (): Element | null => documentRef.current?.firstElementChild ?? null
  const topBelow = (rect: DOMRect): number => rect.bottom - (layerRef.current?.getBoundingClientRect().top ?? 0)
  const topOf = (element: Element): number =>
    element.getBoundingClientRect().top - (layerRef.current?.getBoundingClientRect().top ?? 0)

  useLayoutEffect(() => {
    const root = markdownRoot()
    if (root === null) return
    const place = (): void => {
      const blocks = documentBlocks(root)
      const ranges: Range[] = []
      const byBlock = new Map<number, PlanComment[]>()
      for (const comment of comments) {
        const located = anchorRange(root, comment)
        if (located !== undefined && comment.resolved !== true) ranges.push(located.range)
        const block = Math.min(located?.block ?? comment.block, blocks.length - 1)
        byBlock.set(block, [...byBlock.get(block) ?? [], comment])
      }
      paintCommentHighlights(owner, ranges)
      setPlaced([...byBlock].flatMap(([block, list]) => {
        const element = blocks[block]
        return element === undefined ? [] : [{ block, top: topOf(element), comments: list }]
      }))
    }
    place()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place)
    observer?.observe(root)
    return () => { observer?.disconnect() }
  }, [comments, markdown, owner])
  useEffect(() => () => { paintCommentHighlights(owner, []) }, [owner])

  const readSelection = (event: SyntheticEvent): void => {
    if (insideOverlay(event.target)) return
    const root = markdownRoot()
    const layer = layerRef.current
    const current = typeof window === 'undefined' ? null : window.getSelection()
    if (root === null || layer === null || current === null || current.rangeCount === 0) {
      setSelection(undefined)
      return
    }
    const range = current.getRangeAt(0)
    const block = documentBlocks(root)[blockIndexOf(root, range.startContainer)]
    if (block !== undefined) setHover({ block: blockIndexOf(root, range.startContainer), top: topOf(block) })
    const anchor = current.isCollapsed ? undefined : selectionAnchor(root, range)
    if (anchor === undefined) {
      setSelection(undefined)
      return
    }
    const rect = range.getBoundingClientRect()
    const bounds = layer.getBoundingClientRect()
    setSelection({ anchor, top: topBelow(rect) + 6, left: Math.max(0, Math.min(rect.left - bounds.left, bounds.width - 120)) })
  }
  const trackHover = (event: MouseEvent): void => {
    const root = markdownRoot()
    if (root === null || !(event.target instanceof Node)) return
    const index = blockIndexOf(root, event.target)
    const block = documentBlocks(root)[index]
    if (block !== undefined && hover?.block !== index) setHover({ block: index, top: topOf(block) })
  }
  const startDraft = (anchor: PlanCommentAnchor | undefined, top: number): void => {
    if (anchor === undefined) return
    setSelection(undefined)
    setOpenBlock(undefined)
    setDraft({ anchor, top })
    window.getSelection()?.removeAllRanges()
  }
  const commentBlock = (index: number): void => {
    const root = markdownRoot()
    const block = root === null ? undefined : documentBlocks(root)[index]
    if (root === null || block === undefined) return
    startDraft(blockAnchor(root, index), topBelow(block.getBoundingClientRect()) + 4)
  }
  const open = useMemo(() => placed.find(entry => entry.block === openBlock), [placed, openBlock])
  const closeOverlays = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    setSelection(undefined)
    setOpenBlock(undefined)
  }

  return (
    <div ref={layerRef} className={css.layer} onMouseUp={readSelection} onKeyUp={readSelection} onKeyDown={closeOverlays}
      onMouseLeave={() => { setHover(undefined) }}>
      <div ref={documentRef} className={previewCss.document} onMouseMove={trackHover}>
        <MarkdownText text={markdown} labels={labels} />
      </div>
      {hover !== undefined && (
        <button type="button" className={css.blockAdd} style={{ top: hover.top }} data-plan-comment-ui=""
          aria-label={t('comment.block')} title={t('comment.block')} onClick={() => { commentBlock(hover.block) }}>
          <IconPlusOutlineRegular size={14} />
        </button>
      )}
      {placed.map(entry => (
        <button key={entry.block} type="button" className={css.marker} style={{ top: entry.top }} data-plan-comment-ui=""
          data-plan-comment-marker={entry.block} aria-expanded={openBlock === entry.block}
          data-resolved={entry.comments.every(comment => comment.resolved === true) ? '' : undefined}
          aria-label={t(entry.comments.length === 1 ? 'comment.marker.one' : 'comment.marker.other', { count: entry.comments.length })}
          onClick={() => { setOpenBlock(openBlock === entry.block ? undefined : entry.block) }}>
          <IconListPenOutlineRegular size={14} />
          {entry.comments.length > 1 && <span className={css.markerCount}>{entry.comments.length}</span>}
        </button>
      ))}
      {selection !== undefined && (
        <button type="button" className={css.selectionButton} style={{ top: selection.top, left: selection.left }}
          data-plan-comment-ui="" aria-label={t('comment.selectLabel')}
          onMouseDown={(event) => { event.preventDefault() }}
          onClick={() => { startDraft(selection.anchor, selection.top) }}>
          <IconListPenOutlineRegular size={14} />{t('comment.select')}
        </button>
      )}
      {draft !== undefined && (
        <div className={css.popover} style={{ top: draft.top }} role="group" aria-label={t('comment.editor')} data-plan-comment-ui="">
          <blockquote className={css.quote}>{draft.anchor.quote}</blockquote>
          <CommentEditor initial="" submitLabel={t('comment.add')} t={t} onCancel={() => { setDraft(undefined) }}
            onSubmit={(text) => { onAdd(draft.anchor, text); setDraft(undefined) }} />
        </div>
      )}
      {open !== undefined && draft === undefined && (
        <div className={css.popover} style={{ top: open.top + 28 }} role="group" aria-label={t('comment.editor')} data-plan-comment-ui="">
          <div className={css.popoverHeader}>
            <button type="button" className={css.iconButton} aria-label={t('comment.close')} title={t('comment.close')}
              onClick={() => { setOpenBlock(undefined) }}><IconCloseOutlineRegular size={14} /></button>
          </div>
          <ul className={css.list}>
            {open.comments.map(comment => <CommentItem key={comment.id} comment={comment} onUpdate={onUpdate} onRemove={onRemove} t={t} />)}
          </ul>
        </div>
      )}
    </div>
  )
}
