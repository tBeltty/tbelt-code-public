/**
 * Pasted text that the composer turned into a file attachment. The original
 * text stays readable beside the browser `File` so the attachment card can
 * preview it and put it back into the draft without reading the file again.
 */

/** Pasted file extensions chosen from the text content. */
export type PastedTextExtension = 'json' | 'md' | 'txt'

/** Lines shown in an attachment card preview. */
const PREVIEW_LINES = 3

/** Longest preview line, in characters. */
const PREVIEW_LINE_CHARS = 120

const sources = new WeakMap<File, string>()

let pasteCounter = 0

/** Line starts that mark source code rather than prose. */
const CODE_LINE = new RegExp(
  '^\\s*(?:import |export |const |let |var |function |class |def |from \\S+ import |#include|package '
  + '|public |private |fn |func |<\\?php|\\}|\\{|//|@\\w+)',
)
/** Line starts that mark Markdown rather than plain code. */
const MARKDOWN_LINE = /^(?:#{1,6} |\s*[-*+] |\s*\d+\. |>|```|\|.*\|)/

/**
 * Pick the file extension that matches the pasted content.
 * @param text - pasted plain text.
 * @returns `json` for a valid JSON object or array, `txt` when most non-empty lines look like source code, otherwise `md`.
 */
export function pastedTextExtension(text: string): PastedTextExtension {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed)
      return 'json'
    } catch (_notJson) {
      // Not JSON: fall through to the line heuristics below.
    }
  }
  const lines = text.split('\n').filter(line => line.trim() !== '')
  const code = lines.filter(line => CODE_LINE.test(line)).length
  const markdown = lines.filter(line => MARKDOWN_LINE.test(line)).length
  return code > markdown && code * 3 >= lines.length ? 'txt' : 'md'
}

/**
 * Wrap pasted text in a browser file and remember its source text.
 * @param text - pasted plain text.
 * @returns a uniquely named file holding the text in UTF-8.
 */
export function pastedTextFile(text: string): File {
  pasteCounter += 1
  const file = new File([text], `pasted-text-${String(pasteCounter)}.${pastedTextExtension(text)}`, {
    type: 'text/plain',
  })
  sources.set(file, text)
  return file
}

/**
 * Read back the text a pasted-text file was created from.
 * @param file - an attachment's browser file.
 * @returns the pasted text, or `undefined` when the file did not come from a paste.
 */
export function pastedTextOf(file: File): string | undefined {
  return sources.get(file)
}

/**
 * Build the first lines of pasted text for an attachment card.
 * @param text - pasted plain text.
 * @returns up to three non-empty lines, each cut to 120 characters, joined by newlines.
 */
export function pastedTextPreview(text: string): string {
  return text.split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.trim() !== '')
    .slice(0, PREVIEW_LINES)
    .map(line => line.length > PREVIEW_LINE_CHARS ? `${line.slice(0, PREVIEW_LINE_CHARS)}…` : line)
    .join('\n')
}
