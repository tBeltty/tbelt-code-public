/**
 * The terminal surface: transcript text scrolls up as ordinary output while
 * the composer is redrawn below it. No alternate screen is used, so scrollback,
 * selection and the host terminal's own search keep working.
 * @module @deepseek-ai/dsh-terminal-views/screen
 */
import type { ComposerFrame } from './composer.ts'

const CSI = '\u001B['

/** Where the screen writes: a TTY output stream or a test buffer. */
export interface ScreenSink {
  write(chunk: string): unknown
}

/** Owns the rows the composer currently occupies. */
export class Screen {
  readonly #sink: ScreenSink
  #frame: ComposerFrame | undefined
  /** Row of the terminal cursor inside the drawn frame. */
  #row = 0

  /** @param sink - the output stream. */
  constructor(sink: ScreenSink) {
    this.#sink = sink
  }

  /**
   * Write transcript text above the composer.
   * @param text - complete lines; the composer is redrawn after them, so a partial last line would sit beside it.
   */
  print(text: string): void {
    if (text === '') return
    this.#erase()
    this.#sink.write(text)
    this.#draw()
  }

  /**
   * Replace the composer.
   * @param frame - the new frame, or undefined to hide the composer while a turn runs.
   */
  show(frame: ComposerFrame | undefined): void {
    this.#erase()
    this.#frame = frame
    this.#draw()
  }

  /**
   * Clear the visible screen and scrollback position, then redraw the composer.
   */
  clear(): void {
    this.#sink.write(`${CSI}2J${CSI}3J${CSI}H`)
    this.#row = 0
    this.#draw()
  }

  /** Remove the composer and leave the cursor at the start of a blank row, ready for the shell. */
  release(): void {
    this.#erase()
    this.#frame = undefined
  }

  #erase(): void {
    if (this.#frame === undefined) return
    this.#sink.write(`\r${this.#row > 0 ? `${CSI}${String(this.#row)}A` : ''}${CSI}J`)
    this.#row = 0
  }

  #draw(): void {
    const frame = this.#frame
    if (frame === undefined) return
    this.#sink.write(frame.lines.join('\r\n'))
    const up = frame.lines.length - 1 - frame.cursor.row
    this.#sink.write(`${up > 0 ? `${CSI}${String(up)}A` : ''}\r${frame.cursor.column > 0 ? `${CSI}${String(frame.cursor.column)}C` : ''}`)
    this.#row = frame.cursor.row
  }
}
