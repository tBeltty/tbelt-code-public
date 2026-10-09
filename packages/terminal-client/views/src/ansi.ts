/**
 * Terminal styling: ANSI escape sequences behind one switch, so a terminal
 * without color receives the same text unstyled.
 * @module @deepseek-ai/dsh-terminal-views/ansi
 */

const ESC = '\u001B'

/** Pattern matching the CSI and OSC sequences this package emits or a tool prints. */
const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]|\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)/gu

/** Text decorations a view applies; each returns its input unchanged when color is off. */
export interface Style {
  bold(text: string): string
  dim(text: string): string
  red(text: string): string
  green(text: string): string
  yellow(text: string): string
  cyan(text: string): string
}

/**
 * Create the styling functions.
 * @param color - whether the output terminal renders ANSI colors.
 * @returns styles that wrap their input in SGR codes, or return it unchanged.
 */
export function createStyle(color: boolean): Style {
  const wrap = (open: number, close: number) => (text: string): string =>
    color && text !== '' ? `${ESC}[${String(open)}m${text}${ESC}[${String(close)}m` : text
  return {
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    red: wrap(31, 39),
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    cyan: wrap(36, 39),
  }
}

/**
 * Decide whether to emit colors, following the `NO_COLOR` and `FORCE_COLOR` conventions.
 * @param env - process environment.
 * @param isTTY - whether standard output is a terminal.
 * @returns true when colored output is appropriate.
 */
export function supportsColor(env: Readonly<Record<string, string | undefined>>, isTTY: boolean): boolean {
  if ((env.NO_COLOR ?? '') !== '') return false
  const forced = env.FORCE_COLOR
  if (forced !== undefined && forced !== '') return forced !== '0' && forced !== 'false'
  return isTTY && env.TERM !== 'dumb'
}

/**
 * Remove escape sequences from text.
 * @param text - text that may carry ANSI sequences.
 * @returns the visible characters only.
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '')
}
