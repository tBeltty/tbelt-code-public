import { fileExtension, FileTypeIcon, fileSizeText, IconCloseFillRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './FileCard.module.css'

/** Localized strings consumed by one pending-file card. */
export interface FileCardLabels {
  /** Card body announcement, e.g. "Pending file {name}". */
  readonly label: string
  /** Remove-button label. */
  readonly remove: string
  /** Status line while the upload is in flight. */
  readonly uploading: string
  /** Status line and retry affordance after a failed upload. */
  readonly failed: string
  /** Retry-button label. */
  readonly retry: string
}

/** Pasted-text details shown under a file card's name. */
export interface FileCardPasted {
  /** First lines of the pasted text. */
  readonly preview: string
  /** Label of the insert-as-text button. */
  readonly insertLabel: string
  /** Accessible name of the insert-as-text button. */
  readonly insertAria: string
  /** Put the text back into the draft and remove the attachment. */
  readonly onInsert: () => void
}

/** Upload display state resolved by the owner. */
export type FileCardState = 'uploading' | 'ready' | 'error'

/** One pending file card: type glyph, name, size or upload status, remove, retry. */
export function FileCard({
  name, bytes, state, progress, labels, pasted, onRemove, onRetry,
}: {
  name: string
  bytes: number
  state: FileCardState
  progress?: number
  labels: FileCardLabels
  pasted?: FileCardPasted
  onRemove: () => void
  onRetry: () => void
}) {
  const extension = fileExtension(name).toUpperCase().slice(0, 8)
  const meta = state === 'uploading'
    ? progress === undefined ? labels.uploading : `${labels.uploading} ${String(Math.round(Math.min(1, Math.max(0, progress)) * 100))}%`
    : state === 'error'
      ? labels.failed
      : [extension, fileSizeText(bytes)].filter(part => part !== '').join(' ')
  const retryable = state === 'error'
  return (
    <div
      className={`${css.card}${pasted === undefined ? '' : ` ${css.pasted}`}${retryable ? ` ${css.failed}` : ''}`}
      title={name}
    >
      <span className={css.icon} aria-hidden>
        {state === 'uploading'
          ? <span className={css.spinner} />
          : <FileTypeIcon path={name} />}
      </span>
      {retryable
        ? (
          <button type="button" className={`${css.body} ${css.retry}`} aria-label={labels.retry} onClick={onRetry}>
            <span className={css.name}>{name}</span>
            <span className={`${css.meta} ${css.metaFailed}`}>{meta}</span>
          </button>
        )
        : (
          <span className={css.body} aria-label={labels.label}>
            <span className={css.name}>{name}</span>
            <span className={css.meta}>{meta}</span>
          </span>
        )}
      <button
        type="button"
        className={retryable ? `${css.remove} ${css.removeFailed}` : css.remove}
        aria-label={labels.remove}
        onClick={onRemove}
      >
        <IconCloseFillRegular size={12} />
      </button>
      {pasted !== undefined && (
        <>
          <pre className={css.preview}>{pasted.preview}</pre>
          <button type="button" className={css.insert} aria-label={pasted.insertAria} onClick={pasted.onInsert}>
            {pasted.insertLabel}
          </button>
        </>
      )}
      {state === 'uploading' && (
        <span className={css.progressTrack} aria-hidden>
          <span
            className={css.progressBar}
            style={progress === undefined ? undefined : { width: `${String(Math.min(1, Math.max(0, progress)) * 100)}%` }}
          />
        </span>
      )}
    </div>
  )
}
