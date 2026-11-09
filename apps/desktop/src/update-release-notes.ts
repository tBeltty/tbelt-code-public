/** Release notes and release link shown in the update dialog, read from the update feed. */

const RELEASES_URL = 'https://github.com/tBeltty/tbelt-code-public/releases'

/** Longest notes text a native dialog shows; longer notes end with an ellipsis. */
const MAX_NOTES_CHARS = 1200

/**
 * @param notes - `releaseNotes` field of the feed: text, per-version entries, or absent.
 * @returns The notes as one trimmed string, or undefined when the feed has none.
 */
export function feedReleaseNotes(notes: string | readonly { readonly note: string | null }[] | null | undefined): string | undefined {
  const text = typeof notes === 'string' ? notes
    : (notes ?? []).map(entry => entry.note ?? '').join('\n\n')
  return text.trim() === '' ? undefined : text.trim()
}

/**
 * @param name - `releaseName` field of the feed.
 * @returns The trimmed name, or undefined when the feed has none.
 */
export function feedReleaseName(name: string | null | undefined): string | undefined {
  return name === null || name === undefined || name.trim() === '' ? undefined : name.trim()
}

/**
 * Turn changelog Markdown into plain dialog text: headings lose their marker and list items get a bullet.
 * @param markdown - Changelog section body.
 * @returns Plain text of at most 1200 characters.
 */
export function releaseNotesDialogText(markdown: string): string {
  const text = markdown.split('\n')
    .map(line => line.replace(/^#{1,6}\s+/, '').replace(/^[-*]\s+/, '• '))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return text.length <= MAX_NOTES_CHARS ? text : `${text.slice(0, MAX_NOTES_CHARS - 1).trimEnd()}…`
}

/**
 * @param releaseName - Changelog version the feed names for the release.
 * @returns The GitHub Release page for that version, or the releases list when the feed names none.
 */
export function releasePageUrl(releaseName: string | undefined): string {
  return releaseName === undefined ? RELEASES_URL : `${RELEASES_URL}/tag/v${encodeURIComponent(releaseName)}`
}
