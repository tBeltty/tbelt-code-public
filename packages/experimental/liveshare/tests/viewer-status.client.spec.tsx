// @vitest-environment jsdom
/**
 * What the viewer states when it cannot show the shared Session, and what it offers the reader to do.
 *
 * A reader who opens a share has one page: an offline owner, a stopped or expired share, a lapsed
 * sign-in, a link that is wrong, and a Relay that cannot be reached must each read as themselves, and
 * each must leave the reader something to do.
 */

import { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { act, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/viewer-session-plugin.ts'
import {
  readViewerStatus,
  viewerStatus,
  viewerStatusFacts,
  type ViewerStatus,
  type ViewerStatusFacts,
} from '../src/client/viewer-status.ts'
import { mountViewerStatusBanner } from '../src/client/viewer-status-banner.ts'
import bannerCss from '../src/client/viewer-status-banner.module.css'
import { en, es, NS } from '../src/client/locales.ts'
import {
  provideViewerConnection, provideViewerLocale, provideViewerRemoteAccess,
} from './viewer-plugin-services.client.ts'

const STATUS_ID = 'liveshare-viewer-status'
const MESSAGE_ID = 'liveshare-viewer-status-message'

/** One row of the contract: the signal the page read, the state it states, its words and its way out. */
interface StatusRow {
  readonly facts: ViewerStatusFacts
  readonly status: Exclude<ViewerStatus, 'ready'>
  readonly message: string
  /** Action the state offers, absent for a state whose way out is stated in words alone. */
  readonly action?: { readonly kind: string; readonly label: string }
}

const ROWS: readonly StatusRow[] = [
  {
    facts: { notFound: true },
    status: 'invalid',
    message: 'This link is not valid, or that share was deleted.',
    action: { kind: 'directory', label: 'Back to shares' },
  },
  {
    facts: { ownerOnline: false },
    status: 'offline',
    message: 'The owner is offline right now; this page reconnects automatically.',
    action: { kind: 'retry', label: 'Retry' },
  },
  {
    facts: { reason: 'share-stopped' },
    status: 'stopped',
    message: 'The owner stopped this share.',
    action: { kind: 'directory', label: 'Back to shares' },
  },
  {
    facts: { reason: 'share-expired' },
    status: 'expired',
    message: 'This share expired.',
    action: { kind: 'directory', label: 'Back to shares' },
  },
  {
    facts: { unauthenticated: true },
    status: 'reauthenticate',
    message: 'Your sign-in expired.',
    action: { kind: 'sign-in', label: 'Sign in again' },
  },
  {
    facts: { unreachable: true },
    status: 'unavailable',
    message: 'The share service is unavailable right now; retrying.',
    action: { kind: 'reload', label: 'Reload' },
  },
]

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.getElementById(STATUS_ID)?.remove()
  delete (globalThis as { __DSH_LIVESHARE_VIEWER__?: unknown }).__DSH_LIVESHARE_VIEWER__
  viewerStatusFacts.set({})
  viewerStatus.set('connecting')
})

describe('viewer status', () => {
  it('reads each signal as its own state, with the share\u2019s end and the reader\u2019s sign-in first', () => {
    expect(readViewerStatus({ ownerOnline: true })).toBe('ready')
    for (const row of ROWS) expect(readViewerStatus(row.facts), row.status).toBe(row.status)
    // A share the owner ended states that, whatever the connection looks like.
    expect(readViewerStatus({ reason: 'share-stopped', ownerOnline: false })).toBe('stopped')
    // The reader's own sign-in outranks a connection fact, and a missing share outranks both.
    expect(readViewerStatus({ unauthenticated: true, ownerOnline: false })).toBe('reauthenticate')
    expect(readViewerStatus({ notFound: true, unauthenticated: true })).toBe('invalid')
  })

  it('states every state in the reader\u2019s language with a way out, and nothing while the share reads', () => {
    const asked: string[] = []
    const locale = provideViewerLocale(new Context())
    const banner = mountViewerStatusBanner(document, (action) => { asked.push(action) }, locale.bind(NS))
    const element = document.getElementById(STATUS_ID)
    expect(element).not.toBeNull()

    for (const row of ROWS) {
      banner.update(row.status)
      // No state is an empty shell: each one states itself in the reader's own words.
      expect(document.getElementById(MESSAGE_ID)?.textContent, row.status).toBe(row.message)
      const button = element?.querySelector<HTMLButtonElement>('button')
      if (row.action === undefined) {
        expect(button, row.status).toBeNull()
        continue
      }
      expect(button?.dataset.liveshareAction, row.status).toBe(row.action.kind)
      expect(button?.textContent, row.status).toBe(row.action.label)
      button?.click()
    }
    expect(asked).toEqual(ROWS.flatMap(row => row.action === undefined ? [] : [row.action.kind]))

    banner.update('ready')
    expect(element?.textContent).toBe('')
    expect(element?.style.display).toBe('none')
    banner.dispose()
    expect(document.getElementById(STATUS_ID)).toBeNull()
  })

  it('dresses the banner from the token sheet rather than inline colors', () => {
    const locale = provideViewerLocale(new Context())
    const banner = mountViewerStatusBanner(document, () => {}, locale.bind(NS))
    const element = document.getElementById(STATUS_ID)
    expect(element).not.toBeNull()
    // The module class carries the token colors with their system-color fallbacks; inline styles keep
    // only the placement and type the served page needs before any stylesheet loads.
    expect(element!.classList.contains(bannerCss.banner ?? '')).toBe(true)
    expect(element!.style.border).toBe('')
    expect(element!.style.background).toBe('')
    expect(element!.style.color).toBe('')
    banner.dispose()
  })

  it('mounts a banner that still places itself when its stylesheet never loaded', async () => {
    // A served page can miss the module stylesheet; the element then carries no class at all and
    // keeps only the inline placement that does not depend on the sheet.
    vi.resetModules()
    vi.doMock('../src/client/viewer-status-banner.module.css', () => ({ default: {} }))
    const unstyled = await import('../src/client/viewer-status-banner.ts')
    const locale = provideViewerLocale(new Context())
    const banner = unstyled.mountViewerStatusBanner(document, () => {}, locale.bind(NS))
    try {
      const element = document.getElementById(STATUS_ID)
      expect(element).not.toBeNull()
      expect(element?.className).toBe('')
      expect(element?.style.position).toBe('fixed')
    } finally {
      banner.dispose()
      vi.doUnmock('../src/client/viewer-status-banner.module.css')
      vi.resetModules()
    }
  })

  it('renders the share\u2019s own answers instead of an empty page', async () => {
    let context: unknown = { capabilities: { sessionMode: 'view', online: false } }
    let notFound = false
    vi.stubGlobal('fetch', vi.fn((input: unknown) => {
      const url = String(input)
      if (url.includes('/__liveshare/context')) {
        return Promise.resolve(notFound ? new Response('', { status: 404 }) : Response.json(context))
      }
      return Promise.resolve(new Response('', { status: 404 }))
    }))
    ;(globalThis as { __DSH_LIVESHARE_VIEWER__?: unknown }).__DSH_LIVESHARE_VIEWER__ = {
      shareId: 'share-1',
      sessionId: 'fx-shared',
      basePath: '',
    }
    const ctx = new Context()
    const locale = provideViewerLocale(ctx)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    ctx.provide('sessions', {
      list: {
        getSnapshot: () => createSnapshotStore<{ byId: Record<string, unknown> }>({ byId: {} }).getSnapshot(),
        subscribe: () => () => {},
      },
      open: () => {},
      scope: () => undefined,
    } as never)
    ctx.provide('uiWorkspace', { openSession: () => {} } as never)
    provideViewerRemoteAccess(ctx)
    provideViewerConnection(ctx)
    await fiber.await()
    try {
      await vi.waitFor(() => {
        expect(document.getElementById(MESSAGE_ID)?.textContent).toBe('The owner is offline right now; this page reconnects automatically.')
      })

      // The statement is plain DOM rather than a slot-rendered surface, so a language switch repaints
      // it through the locale face instead of leaving the previous language on screen.
      locale.setLocale('es')
      await vi.waitFor(() => {
        expect(document.getElementById(MESSAGE_ID)?.textContent).toBe(es['viewer.status.offline'])
      })
      locale.setLocale('en')
      await vi.waitFor(() => {
        expect(document.getElementById(MESSAGE_ID)?.textContent).toBe(en['viewer.status.offline'])
      })

      // The share itself ends: the page states the owner's own action, not the connection.
      context = { capabilities: { sessionMode: 'view', sessionModeReason: 'share-stopped', online: true } }
      await act(async () => { window.dispatchEvent(new Event('focus')) })
      await vi.waitFor(() => {
        expect(document.getElementById(MESSAGE_ID)?.textContent).toBe('The owner stopped this share.')
      })

      // A reader the Relay does not know: the link is the thing to check, and the page says so.
      notFound = true
      await act(async () => { window.dispatchEvent(new Event('focus')) })
      await vi.waitFor(() => {
        expect(document.getElementById(MESSAGE_ID)?.textContent).toBe('This link is not valid, or that share was deleted.')
      })
    } finally {
      await fiber.dispose()
    }
  })

  it('never asks the retired admission endpoints, and states only what it read', async () => {
    const asked: string[] = []
    vi.stubGlobal('fetch', vi.fn((input: unknown) => {
      asked.push(String(input))
      // A reader the Relay does not admit cannot read the share's own answer at all.
      return Promise.resolve(new Response('', { status: 403 }))
    }))
    ;(globalThis as { __DSH_LIVESHARE_VIEWER__?: unknown }).__DSH_LIVESHARE_VIEWER__ = {
      shareId: 'share-1',
      sessionId: '',
      basePath: '',
    }
    const ctx = new Context()
    provideViewerLocale(ctx)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    ctx.provide('sessions', {
      list: {
        getSnapshot: () => createSnapshotStore<{ byId: Record<string, unknown> }>({ byId: {} }).getSnapshot(),
        subscribe: () => () => {},
      },
      open: () => {},
      scope: () => undefined,
    } as never)
    ctx.provide('uiWorkspace', { openSession: () => {} } as never)
    provideViewerRemoteAccess(ctx)
    provideViewerConnection(ctx)
    await fiber.await()
    try {
      await vi.waitFor(() => {
        // An unreadable share is not confirmed read-only, and no pending-approval state exists to claim.
        expect(document.getElementById(MESSAGE_ID)?.textContent).toBe('Connecting to the share…')
        expect(asked.length).toBeGreaterThan(0)
      })
      expect(document.querySelector('button[data-liveshare-action="request-access"]')).toBeNull()
      for (const url of asked) {
        for (const gone of ['request-access', 'request-status', 'decide-access', 'grant-access', 'revoke-access']) {
          expect(url, gone).not.toContain(gone)
        }
      }
    } finally {
      await fiber.dispose()
    }
  })
})
