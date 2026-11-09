/**
 * Side-conversation surface plugin, browser half: the dialog in the
 * conversation.input.overlay slot and the `/btw` decoration that opens it from
 * the composer menu, a bare typed command, or a typed question. One
 * BtwSurface per Session backs the dialog and the command.
 * @module @deepseek-ai/dsh-client-ui-btw/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the generated Remote API and ctx.remote merge through the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the ui-conversation SlotMap merge (the overlay entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the command UI's Context merge (ctx.commandUi).
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { BtwDialog } from './BtwDialog.tsx'
import type { BtwDialogInjected } from './slots.ts'
import { BtwSurface } from './surface.ts'
import { en, es, el, fr } from './locales.ts'

export type { BtwDialogState } from './controller.ts'
export type { BtwDialogInjected, BtwDialogProps } from './slots.ts'
export type { BtwKey } from './locales.ts'

/** Opens the Session's side-conversation dialog. */
export interface BtwUi {
  /**
   * Open the dialog for a Session, optionally asking a question right away.
   * @param sessionId - Session whose side conversation to open.
   * @param question - question to ask once the dialog is open.
   */
  open(sessionId: SessionId, question?: string): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    btwUi: BtwUi
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'btw'

/** Required services: the slot registry, the `btw` Remote, and the copy. */
export const inject = ['slots', 'remote', 'remote.btw', 'locale']

/**
 * Client plugin body: the dialog entry, the `btwUi` service, the `/btw`
 * decoration, and the per-session surfaces.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { en, es, el, fr }), 'ui-btw: dictionaries')

  const surfaces = new Map<SessionId, BtwSurface>()
  const surfaceFor = (sessionId: SessionId): BtwSurface => {
    let surface = surfaces.get(sessionId)
    if (surface === undefined) {
      surface = new BtwSurface(ctx, sessionId)
      surfaces.set(sessionId, surface)
    }
    return surface
  }
  ctx.effect(() => () => {
    for (const surface of surfaces.values()) surface.dispose()
    surfaces.clear()
  }, 'ui-btw: per-session surfaces')

  const btwUi: BtwUi = {
    open: (sessionId, question) => { void surfaceFor(sessionId).dialog.open(question) },
  }
  ctx.provide('btwUi', btwUi)

  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay',
    id: 'btw-dialog',
    order: 3,
    locale: NS,
    inject: (sessionId): BtwDialogInjected => {
      const { dialog } = surfaceFor(sessionId)
      return {
        hooks: { dialog: dialog.state },
        edit: (draft) => { dialog.edit(draft) },
        ask: () => dialog.ask(),
        send: () => dialog.send(),
        clear: () => dialog.clear(),
        dismiss: () => { dialog.dismiss() },
        dismissFailure: () => { dialog.dismissFailure() },
        dismissToast: (seq) => { dialog.dismissToast(seq) },
      }
    },
  }, BtwDialog))

  // The Host keeps `/btw --send` and `/btw --reset` as text commands for the
  // terminal. A bare `/btw` or `/btw <question>` opens the dialog here, so the
  // thread stays out of the chat transcript.
  ctx.inject(['commandUi'], (scope: ClientContext) => {
    scope.effect(() => scope.commandUi.decorate({
      name: 'btw',
      available: () => true,
      ui: {
        kind: 'action',
        run: (session) => { btwUi.open(session.sessionId) },
        // A flag opens the dialog on its thread; only a question is asked.
        runWithInput: (session, input) => { btwUi.open(session.sessionId, input.startsWith('--') ? undefined : input) },
      },
    }), 'ui-btw: /btw decoration')
  })
}
