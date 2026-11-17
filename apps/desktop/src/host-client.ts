/** Native HTTP client for the Desktop Host: analytics intake and the saved language preference. */

import { randomUUID } from 'node:crypto'
import type { ProductEvent } from '@deepseek-ai/dsh-client-product-analytics/types'

/** Operations the Desktop shell performs against the running Host. */
export interface DesktopHostClient {
  /** @param event - desktop-owned fields. @returns after local Host intake; the Host drops the event while collection is disabled. */
  report(event: ProductEvent): Promise<void>
  /** @returns The saved UI language, or null when the user chose none. */
  readLocalePreference(): Promise<string | null>
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Authenticate the native HTTP client through the Web application's launch URL.
 * @param authenticatedUrl - URL supplied by the running Desktop Host.
 * @param send - Electron session fetch, retaining the Web authentication cookie.
 * @returns the Host operations the shell needs, over standard RPC.
 */
export async function connectDesktopHost(
  authenticatedUrl: string,
  send: (input: string, init?: RequestInit) => Promise<Response>,
): Promise<DesktopHostClient> {
  const origin = new URL(authenticatedUrl).origin
  const authenticated = await send(authenticatedUrl, { credentials: 'include' })
  await authenticated.body?.cancel()
  if (!authenticated.ok) throw new Error('desktop host: Web authentication failed')
  const invoke = async (
    request: { namespace: string; method: string; args: Record<string, unknown> },
    signal?: AbortSignal,
  ): Promise<unknown> => {
    const rpcId = randomUUID()
    const method = `${request.namespace}/${request.method}`
    const response = await send(new URL(`/api/${method}`, origin).href, {
      method: 'POST', credentials: 'include', redirect: 'error', ...(signal === undefined ? {} : { signal }),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method, payload: { args: request.args } }),
    })
    if (!response.ok) throw new Error('desktop host: Web request failed')
    const envelope: unknown = await response.json()
    if (!record(envelope) || envelope.type !== 'server-response' || envelope.rpcId !== rpcId
      || !record(envelope.result) || envelope.result.ok !== true) {
      throw new Error('desktop host: Web RPC failed')
    }
    return envelope.result.value
  }
  return {
    async report(event) { await invoke({ namespace: 'productAnalytics', method: 'report', args: { event } }, AbortSignal.timeout(1000)) },
    async readLocalePreference() {
      const settings = await invoke({ namespace: 'settings', method: 'describe', args: {} })
      if (!record(settings) || !Array.isArray(settings.namespaces)) throw new Error('desktop host: missing settings namespaces')
      const locale: unknown = settings.namespaces.find((item: unknown) => record(item) && item.ns === 'locale')
      if (!record(locale) || !record(locale.value)
        || (locale.value.preference !== undefined && typeof locale.value.preference !== 'string')) {
        throw new Error('desktop host: invalid locale preference')
      }
      return locale.value.preference ?? null
    },
  }
}
