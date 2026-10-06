import { describe, expect, it } from 'vitest'
import { feedReleaseName, feedReleaseNotes, releaseNotesDialogText, releasePageUrl } from '../src/update-release-notes.ts'

describe('update release notes', () => {
  it('reads notes from text, entry lists, and empty feeds', () => {
    expect(feedReleaseNotes('  ### Added\n\n- One  ')).toBe('### Added\n\n- One')
    expect(feedReleaseNotes([{ note: 'First' }, { note: null }, { note: 'Second' }])).toBe('First\n\n\n\nSecond')
    expect(feedReleaseNotes(['x'].map(() => ({ note: ' ' })))).toBeUndefined()
    expect(feedReleaseNotes(null)).toBeUndefined()
    expect(feedReleaseNotes(undefined)).toBeUndefined()
  })

  it('reads the release name only when it holds text', () => {
    expect(feedReleaseName(' 0.2.0-rc.2.20261006.4 ')).toBe('0.2.0-rc.2.20261006.4')
    expect(feedReleaseName('  ')).toBeUndefined()
    expect(feedReleaseName(null)).toBeUndefined()
    expect(feedReleaseName(undefined)).toBeUndefined()
  })

  it('turns changelog Markdown into plain dialog text', () => {
    expect(releaseNotesDialogText('### Added\n\n- One\n* Two\n\n\n\n### Fixed\n- Three'))
      .toBe('Added\n\n• One\n• Two\n\nFixed\n• Three')
  })

  it('cuts long notes with an ellipsis', () => {
    const text = releaseNotesDialogText(`- ${'a'.repeat(2000)}`)
    expect(text).toHaveLength(1200)
    expect(text.endsWith('…')).toBe(true)
  })

  it('links the release page, or the releases list without a name', () => {
    expect(releasePageUrl('0.2.0-rc.2.20261006.4')).toBe('https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261006.4')
    expect(releasePageUrl(undefined)).toBe('https://github.com/tBeltty/tbelt-code-public/releases')
  })
})
