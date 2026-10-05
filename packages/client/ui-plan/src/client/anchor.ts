/**
 * Map between rendered plan Markdown and comment anchors. A block is a
 * top-level element of the Markdown root; offsets count characters of the
 * block's text nodes, the same text `Range.toString()` and `textContent` read.
 */
import type { PlanCommentAnchor } from './comments.ts'

/** CSS Custom Highlight name styled by the plan comment stylesheet. */
export const PLAN_COMMENT_HIGHLIGHT = 'dsh-plan-comment'

/**
 * List the commentable blocks of a rendered document.
 * @param root - The Markdown root element.
 * @returns its element children in document order.
 */
export function documentBlocks(root: Element): readonly Element[] {
  return [...root.children]
}

/**
 * Find the block containing a node.
 * @param root - The Markdown root element.
 * @param node - Any node inside or outside the document.
 * @returns the block index, or -1 when the node is outside every block.
 */
export function blockIndexOf(root: Element, node: Node): number {
  let current: Node | null = node
  while (current !== null && current.parentNode !== root) current = current.parentNode
  return current === null ? -1 : documentBlocks(root).indexOf(current as Element)
}

function textOffset(block: Element, container: Node, offset: number): number {
  const before = block.ownerDocument.createRange()
  before.setStart(block, 0)
  before.setEnd(container, offset)
  return before.toString().length
}

/**
 * Anchor a selection to the block where it starts; text past that block is dropped.
 * @param root - The Markdown root element.
 * @param range - A non-collapsed selection range.
 * @returns the anchor, or undefined when the selection starts outside the document or holds only whitespace.
 */
export function selectionAnchor(root: Element, range: Range): PlanCommentAnchor | undefined {
  const index = blockIndexOf(root, range.startContainer)
  const block = documentBlocks(root)[index]
  if (block === undefined) return undefined
  const clipped = range.cloneRange()
  if (!block.contains(range.endContainer)) clipped.setEnd(block, block.childNodes.length)
  const raw = clipped.toString()
  const quote = raw.trim()
  if (quote === '') return undefined
  const leading = raw.length - raw.trimStart().length
  return { block: index, quote, offset: textOffset(block, range.startContainer, range.startOffset) + leading }
}

/**
 * Anchor a whole block.
 * @param root - The Markdown root element.
 * @param index - Block index.
 * @returns the anchor, or undefined for a missing or text-free block.
 */
export function blockAnchor(root: Element, index: number): PlanCommentAnchor | undefined {
  const text = documentBlocks(root)[index]?.textContent ?? ''
  const quote = text.trim()
  if (quote === '') return undefined
  return { block: index, quote, offset: text.length - text.trimStart().length }
}

function nearestOccurrence(text: string, quote: string, offset: number): number {
  let best = -1
  for (let at = text.indexOf(quote); at !== -1; at = text.indexOf(quote, at + 1)) {
    if (best === -1 || Math.abs(at - offset) < Math.abs(best - offset)) best = at
  }
  return best
}

function rangeAt(block: Element, start: number, end: number): Range {
  const range = block.ownerDocument.createRange()
  const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  let seen = 0
  let started = false
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0
    if (!started && start <= seen + length) {
      range.setStart(node, start - seen)
      started = true
    }
    if (started && end <= seen + length) {
      range.setEnd(node, end - seen)
      break
    }
    seen += length
  }
  return range
}

/**
 * Locate an anchor in the current rendering. The recorded block is searched
 * first, then every block, so a re-rendered or shifted document keeps the anchor.
 * @param root - The Markdown root element.
 * @param anchor - Recorded anchor.
 * @returns the range of the quote occurrence nearest the recorded offset, or undefined when the quote no longer occurs.
 */
export function anchorRange(root: Element, anchor: PlanCommentAnchor): { range: Range; block: number } | undefined {
  const blocks = documentBlocks(root)
  const order = [anchor.block, ...blocks.keys()].filter((index, position, all) => all.indexOf(index) === position)
  for (const index of order) {
    const block = blocks[index]
    if (block === undefined) continue
    const at = nearestOccurrence(block.textContent, anchor.quote, anchor.offset)
    if (at !== -1) return { range: rangeAt(block, at, at + anchor.quote.length), block: index }
  }
  return undefined
}

const painted = new Map<object, readonly Range[]>()

/**
 * Publish one document's comment ranges to the shared CSS Custom Highlight.
 * Browsers without the Highlight API show margin markers only.
 * @param owner - Mounted document identity; pass an empty list on unmount.
 * @param ranges - Ranges to highlight for this document.
 */
export function paintCommentHighlights(owner: object, ranges: readonly Range[]): void {
  if (ranges.length === 0) painted.delete(owner)
  else painted.set(owner, ranges)
  if (typeof CSS === 'undefined' || typeof Highlight === 'undefined') return
  const all = [...painted.values()].flat()
  if (all.length === 0) CSS.highlights.delete(PLAN_COMMENT_HIGHLIGHT)
  else CSS.highlights.set(PLAN_COMMENT_HIGHLIGHT, new Highlight(...all))
}
