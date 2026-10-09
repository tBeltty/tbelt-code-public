/**
 * Keeps the terminal window title in step with the agent's activity so a host
 * such as Orca can show whether the session works, waits or rests.
 * @module @deepseek-ai/dsh-terminal-client/host-title
 */
import { hostTitle, titleSequence } from '@deepseek-ai/dsh-terminal-views'
import type { HostActivity } from '@deepseek-ai/dsh-terminal-views'

/** How the title is written. */
export interface HostTitleSettings {
  /** Whether the title carries the marker that Orca reads to recognize the agent. */
  readonly marker: boolean
  /** Time between spinner frames while a turn runs, in milliseconds. */
  readonly frameIntervalMs: number
}

/** Writes the title when it changes and animates the spinner while the agent works. */
export class HostTitle {
  readonly #write: (chunk: string) => unknown
  readonly #settings: HostTitleSettings
  #activity: HostActivity = 'idle'
  #label = ''
  #frame = 0
  #shown: string | undefined
  #timer: ReturnType<typeof setInterval> | undefined

  /**
   * @param write - writes to standard output.
   * @param settings - marker and frame interval.
   */
  constructor(write: (chunk: string) => unknown, settings: HostTitleSettings) {
    this.#write = write
    this.#settings = settings
  }

  /**
   * Show the current activity.
   * @param activity - what the agent is doing.
   * @param label - the session title, or the directory name for an unnamed session.
   */
  update(activity: HostActivity, label: string): void {
    this.#activity = activity
    this.#label = label
    if (activity === 'working') this.#animate()
    else this.#stop()
    this.#show()
  }

  /** Stop the spinner and hand the title back to the terminal. */
  release(): void {
    this.#stop()
    this.#shown = undefined
    this.#write(titleSequence(''))
  }

  #animate(): void {
    if (this.#timer !== undefined) return
    this.#timer = setInterval(() => {
      this.#frame += 1
      this.#show()
    }, this.#settings.frameIntervalMs)
    this.#timer.unref()
  }

  #stop(): void {
    if (this.#timer !== undefined) clearInterval(this.#timer)
    this.#timer = undefined
    this.#frame = 0
  }

  #show(): void {
    const title = hostTitle({ activity: this.#activity, frame: this.#frame, label: this.#label, marker: this.#settings.marker })
    if (title === this.#shown) return
    this.#shown = title
    this.#write(titleSequence(title))
  }
}
