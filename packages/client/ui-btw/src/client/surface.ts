/**
 * One Session's side-conversation surface: the dialog controller over the
 * `btw` Remote. A Session has one controller, so the slash command, the menu
 * row, and the overlay entry all act on the same thread view.
 * @module @deepseek-ai/dsh-client-ui-btw/client/surface
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { BtwDialogController } from './controller.ts'

/** The per-session controller behind every entry of one Session. */
export class BtwSurface {
  /** The Session's dialog state and operations. */
  readonly dialog: BtwDialogController

  /**
   * @param ctx - the browser plugin context carrying the `btw` Remote.
   * @param sessionId - Session owning the thread.
   */
  constructor(ctx: ClientContext, sessionId: SessionId) {
    this.dialog = new BtwDialogController(ctx.remote.btw, sessionId)
  }

  /** Drop the controller when the owning fiber unloads. */
  dispose(): void {
    this.dialog.dispose()
  }
}
