/** Client-owned observation of the Desktop attention preferences. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { DesktopAttentionBridge, DesktopAttentionSettings } from '../types.ts'

/** Loads the shell-persisted preferences once and applies each edit through the preload. */
export class DesktopAttentionSource {
  /** Current preferences; `undefined` until the shell answers. */
  readonly store = createSnapshotStore<DesktopAttentionSettings | undefined>(undefined)
  private live = true

  /** @param bridge - Isolated Electron API that carries the preferences. */
  constructor(private readonly bridge: DesktopAttentionBridge) {
    void bridge.get().then((settings) => { if (this.live) this.store.set(settings) }, () => {
      // The rows stay hidden when the shell does not answer.
    })
  }

  /**
   * Apply one edit.
   * @param patch - Changed fields.
   * @returns Completion once the shell stored the edit; rejects when it cannot.
   */
  async update(patch: Partial<DesktopAttentionSettings>): Promise<void> {
    const next = await this.bridge.set(patch)
    if (this.live) this.store.set(next)
  }

  /** Ignore late answers. */
  dispose(): void { this.live = false }
}
