/** Parent-owned persistence for the sandboxed HTML preview's storage shim; the opaque origin has none of its own. */

const STORAGE_KEY_PREFIX = 'dsh-html-preview-storage:'

/** Which native `Storage` interface a snapshot or message backs. */
export type PreviewStorageArea = 'localStorage' | 'sessionStorage'

/** One `Storage`-shaped key/value snapshot. */
export type PreviewStorageSnapshot = Readonly<Record<string, string>>

/** Message tag distinguishing a preview-storage write from any other value posted into this window. */
export const PREVIEW_STORAGE_MESSAGE_TYPE = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/preview-storage'

/** A write the sandboxed iframe's storage shim posts to its parent after a `setItem`/`removeItem`/`clear` call. */
export interface PreviewStorageMessage {
  readonly type: typeof PREVIEW_STORAGE_MESSAGE_TYPE
  readonly area: PreviewStorageArea
  readonly snapshot: PreviewStorageSnapshot
}

/**
 * Narrow an arbitrary posted value to a preview-storage write. The iframe runs generated,
 * untrusted content, so its messages are validated structurally before use, never trusted by shape alone.
 * @param data - `MessageEvent.data` from any source.
 * @returns whether `data` is a well-formed {@link PreviewStorageMessage}.
 */
export function isPreviewStorageMessage(data: unknown): data is PreviewStorageMessage {
  if (typeof data !== 'object' || data === null) return false
  const message = data as Record<string, unknown>
  if (message.type !== PREVIEW_STORAGE_MESSAGE_TYPE) return false
  if (message.area !== 'localStorage' && message.area !== 'sessionStorage') return false
  if (typeof message.snapshot !== 'object' || message.snapshot === null) return false
  return Object.values(message.snapshot).every(value => typeof value === 'string')
}

/** Real `localStorage` key holding one previewed file's persisted snapshot for one storage area. */
function previewStorageKey(resourceAddress: string, area: PreviewStorageArea): string {
  return `${STORAGE_KEY_PREFIX}${area}:${resourceAddress}`
}

/**
 * Read a previewed file's persisted snapshot, seeding the iframe's storage shim at mount so a value
 * written before reload is present at parse time rather than arriving late over `postMessage`.
 * @param resourceAddress - previewed file's Session address; the partition identity.
 * @param area - which `Storage` interface to read.
 * @returns the last persisted snapshot, or an empty snapshot when absent, corrupt, or storage is unavailable.
 */
export function readPreviewStorageSnapshot(resourceAddress: string, area: PreviewStorageArea): PreviewStorageSnapshot {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(previewStorageKey(resourceAddress, area))
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
  } catch {
    // Corrupt or inaccessible persisted snapshot: the preview starts empty, same as a first visit.
    return {}
  }
}

/**
 * Persist a previewed file's storage snapshot after the iframe reports a write.
 * @param resourceAddress - previewed file's Session address; the partition identity.
 * @param area - which `Storage` interface changed.
 * @param snapshot - complete key/value snapshot to persist.
 */
export function writePreviewStorageSnapshot(resourceAddress: string, area: PreviewStorageArea, snapshot: PreviewStorageSnapshot): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(previewStorageKey(resourceAddress, area), JSON.stringify(snapshot))
  } catch {
    // Quota or private-mode failures only drop this persistence write; the shim's in-memory state is unaffected.
  }
}
