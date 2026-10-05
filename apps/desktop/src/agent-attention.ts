/** Native notifications and sleep prevention driven by Host agent signals. */

import type { DesktopAttentionSettings } from './ipc.ts'
import type { DesktopMessages } from './locale.ts'

/** Minimum gap between two notifications of the same kind, so a burst of finished turns raises one. */
export const ATTENTION_COOLDOWN_MS = 3_000

/** Signal received from the Host process. */
export type DesktopAgentSignal =
  | { readonly type: 'agent-activity'; readonly running: number }
  | { readonly type: 'agent-attention'; readonly kind: 'turn-end' | 'approval' }

/** Platform actions and state the controller depends on. */
export interface DesktopAgentAttentionOptions {
  readonly settings: () => DesktopAttentionSettings
  readonly messages: () => DesktopMessages
  /** Whether the main window is visible and focused. */
  readonly windowFocused: () => boolean
  /** Show one native notification; `onClick` brings the application to the front. */
  readonly notify: (title: string, body: string, onClick: () => void) => void
  readonly focusWindow: () => void
  /** Prevent system sleep; returns an id for {@link DesktopAgentAttentionOptions.stopSleepBlocker}. */
  readonly startSleepBlocker: () => number
  readonly stopSleepBlocker: (id: number) => void
  readonly now: () => number
}

/** Turns Host agent signals into notifications and a sleep blocker according to the user's preferences. */
export class DesktopAgentAttention {
  private running = 0
  private blocker: number | undefined
  private readonly lastNotified = new Map<string, number>()

  /** @param options - Platform actions and preference readers. */
  constructor(private readonly options: DesktopAgentAttentionOptions) {}

  /**
   * Apply one Host signal.
   * @param signal - Activity count change or attention moment.
   */
  handle(signal: DesktopAgentSignal): void {
    if (signal.type === 'agent-activity') {
      this.running = signal.running
      this.syncBlocker()
      return
    }
    const settings = this.options.settings()
    if (!settings.notifications) return
    if (!settings.notifyWhenFocused && this.options.windowFocused()) return
    const now = this.options.now()
    const previous = this.lastNotified.get(signal.kind)
    if (previous !== undefined && now - previous < ATTENTION_COOLDOWN_MS) return
    this.lastNotified.set(signal.kind, now)
    const { aboutProduct, attentionTurnEnd, attentionApproval } = this.options.messages()
    this.options.notify(aboutProduct, signal.kind === 'approval' ? attentionApproval : attentionTurnEnd, this.options.focusWindow)
  }

  /** Re-evaluate the sleep blocker after the preferences changed. */
  settingsChanged(): void { this.syncBlocker() }

  /** Release the sleep blocker. */
  dispose(): void {
    this.running = 0
    this.syncBlocker()
  }

  private syncBlocker(): void {
    const wanted = this.running > 0 && this.options.settings().keepAwake
    if (wanted && this.blocker === undefined) this.blocker = this.options.startSleepBlocker()
    else if (!wanted && this.blocker !== undefined) {
      this.options.stopSleepBlocker(this.blocker)
      this.blocker = undefined
    }
  }
}
