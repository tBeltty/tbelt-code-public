/**
 * The terminal window title that hosts such as Orca read to show what the agent is doing.
 * @module @deepseek-ai/dsh-terminal-views/host-title
 */

/** What the agent is doing, as far as a person watching the tab can tell. */
export type HostActivity = 'idle' | 'working' | 'waiting'

/**
 * Marker Orca reads to recognize a pane as a dsh agent. It is part of Orca's
 * title format (`<prefix> 🐋 <title>`), so only a pane that runs inside Orca carries it.
 */
export const ORCA_TITLE_MARKER = '\u{1F40B}'

/** Prefix while the agent has nothing to do; Orca reads it as rest. */
const IDLE_PREFIX = '✦'

/** Prefix while the agent waits for the person to answer. */
const WAITING_PREFIX = '!'

/** Spinner frames while a turn runs; Orca reads any braille frame as working. */
export const WORKING_FRAMES: readonly string[] = ['⠂', '⠐']

/** Longest title in characters as a person counts them; tab strips cut longer ones anyway. */
const MAX_TITLE_LENGTH = 80

/** C0 and C1 control characters and DEL, which would end or corrupt the title sequence. */
const CONTROL_PATTERN = /[\u0000-\u001F\u007F-\u009F]/gu

/** Splits text into the characters a person sees, so a cut never lands inside an emoji or a combined letter. */
const SEGMENTER = new Intl.Segmenter()

/** Facts the title is made of. */
export interface HostTitleFacts {
  readonly activity: HostActivity
  /** Index of the spinner frame; ignored unless the agent is working. */
  readonly frame: number
  /** Session title, or the directory name for an unnamed session. */
  readonly label: string
  /** Whether to include {@link ORCA_TITLE_MARKER}. */
  readonly marker: boolean
}

/**
 * Compose the title text.
 * @param facts - the agent's activity and the session label.
 * @returns `<prefix> [marker ]<label>`, with control characters removed and the label cut to a tab-sized length.
 */
export function hostTitle(facts: HostTitleFacts): string {
  const prefix = facts.activity === 'working'
    ? WORKING_FRAMES[facts.frame % WORKING_FRAMES.length] as string
    : facts.activity === 'waiting' ? WAITING_PREFIX : IDLE_PREFIX
  const label = Array.from(SEGMENTER.segment(facts.label.replace(CONTROL_PATTERN, ' ').replace(/\s+/gu, ' ').trim()), part => part.segment)
    .slice(0, MAX_TITLE_LENGTH)
    .join('')
  return [prefix, ...facts.marker ? [ORCA_TITLE_MARKER] : [], ...label === '' ? [] : [label]].join(' ')
}

/**
 * The escape sequence that sets the window and tab title.
 * @param title - the text to show; an empty string hands the title back to the terminal.
 * @returns an OSC 0 sequence ended by BEL, the form every terminal emulator accepts.
 */
export function titleSequence(title: string): string {
  return `\u001B]0;${title.replace(CONTROL_PATTERN, ' ')}\u0007`
}
