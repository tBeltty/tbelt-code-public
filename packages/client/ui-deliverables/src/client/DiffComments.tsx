/** Comment editor and saved comments drawn under a diff line. */
import { useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Button, IconEditOutlineRegular, IconTrashOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DiffComment } from './diff-comments.ts'
import type { NS } from './locales.ts'
import css from './DiffComments.module.css'

/** The open editor: a new comment on `line`, or the comment `id` on `line`. */
export interface DiffCommentEditor {
  readonly line: number
  readonly id?: string
}

/** Comments of the shown file and the actions the diff lines call. */
export interface DiffCommenting {
  /** Comments of the shown file. */
  readonly comments: readonly DiffComment[]
  /** The editor that is open, if any; one at a time. */
  readonly editor: DiffCommentEditor | undefined
  /** Open a new-comment editor on a line. */
  readonly onOpen: (line: number) => void
  /** Open the editor on a saved comment. */
  readonly onEdit: (comment: DiffComment) => void
  /** Close the editor without saving. */
  readonly onClose: () => void
  /** Save the open editor's text. */
  readonly onSubmit: (editor: DiffCommentEditor, body: string) => void
  /** Delete a saved comment. */
  readonly onRemove: (id: string) => void
}

/** Textarea with Cancel and Save; Escape cancels and Ctrl/Cmd+Enter saves. */
function Editor({ initial, onCancel, onSubmit, t }: {
  initial: string
  onCancel: () => void
  onSubmit: (body: string) => void
} & PropsLocale<typeof NS>): ReactNode {
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
    <div className={css.editor} data-diff-comment-editor>
      <textarea className={css.textarea} value={text} autoFocus aria-label={t('comment.placeholder')}
        placeholder={t('comment.placeholder')} onChange={(event) => { setText(event.target.value) }} onKeyDown={onKeyDown} />
      <div className={css.actions}>
        <Button size="sm" variant="ghost" onClick={onCancel}>{t('comment.cancel')}</Button>
        <Button size="sm" variant="primary" disabled={trimmed === ''} onClick={() => { onSubmit(trimmed) }}>{t('comment.save')}</Button>
      </div>
    </div>
  )
}

/**
 * The saved comments and the editor of one new-side line.
 * With `ghost`, the same block is drawn hidden and inert so the other side-by-side column keeps its rows aligned.
 * @param props - the commenting state, the line, whether this is the hidden copy, and localized copy.
 * @returns the block, or nothing when the line has no comment and no open editor.
 */
export function LineComments({ commenting, line, ghost, t }: {
  commenting: DiffCommenting
  line: number
  ghost?: boolean
} & PropsLocale<typeof NS>): ReactNode {
  const { editor } = commenting
  const saved = commenting.comments.filter(comment => comment.lineNumber === line)
  const adding = editor?.line === line && editor.id === undefined
  if (saved.length === 0 && !adding) return null
  const hidden = ghost === true
  return (
    <div className={css.block} data-diff-comments={hidden ? undefined : line} aria-hidden={hidden || undefined}
      {...(hidden ? { inert: true, 'data-diff-comments-ghost': '' } : {})}>
      {saved.map(comment => comment.id === editor?.id
        ? (hidden
          ? <div key={comment.id} className={css.editor} />
          : <Editor key={comment.id} initial={comment.body} t={t}
            onCancel={commenting.onClose} onSubmit={(body) => { commenting.onSubmit(editor, body) }} />)
        : (
          <div key={comment.id} className={css.item} data-diff-comment={comment.id} data-sent={comment.sentAt === undefined ? undefined : ''}>
            <p className={css.body}>{comment.body}</p>
            {comment.sentAt !== undefined && <span className={css.sent}>{t('comment.sent')}</span>}
            <button type="button" className={css.iconButton} aria-label={t('comment.edit')} title={t('comment.edit')}
              onClick={() => { commenting.onEdit(comment) }}><IconEditOutlineRegular size={14} /></button>
            <button type="button" className={css.iconButton} aria-label={t('comment.remove')} title={t('comment.remove')}
              onClick={() => { commenting.onRemove(comment.id) }}><IconTrashOutlineRegular size={14} /></button>
          </div>
        ))}
      {adding && (hidden
        ? <div className={css.editor} />
        : <Editor initial="" t={t} onCancel={commenting.onClose} onSubmit={(body) => { commenting.onSubmit(editor, body) }} />)}
    </div>
  )
}

/**
 * The button on a new-side line number that opens a comment on that line.
 * @param props - the commenting state, the line, and localized copy.
 * @returns the button.
 */
export function AddCommentButton({ commenting, line, t }: {
  commenting: DiffCommenting
  line: number
} & PropsLocale<typeof NS>): ReactNode {
  return <button type="button" className={css.add} aria-label={t('comment.add')} title={t('comment.add')} data-diff-comment-add={line}
    onClick={() => { commenting.onOpen(line) }} />
}
