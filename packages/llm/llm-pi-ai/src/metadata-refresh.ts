/**
 * Keeps the {@link ModelMetadataStore} current: loads the last cached copy
 * from the storage domain when one is mounted, refetches when that copy is
 * older than the configured interval, and refetches on that interval while the
 * plugin runs. A failed fetch keeps whatever copy is in force and logs a
 * warning; model requests never wait on it.
 *
 * @module dsh-llm-pi-ai/metadata-refresh
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { fetchModelMetadata, loadModelMetadata, storeModelMetadata } from './metadata.ts'
import type { ModelMetadataStore } from './metadata.ts'

const modelEntry = z.object({
  name: z.string().exactOptional(),
  contextWindow: z.number().int().positive().exactOptional(),
  maxTokens: z.number().int().positive().exactOptional(),
  pricing: z.object({
    input: z.number().nonnegative(),
    output: z.number().nonnegative(),
    cacheRead: z.number().nonnegative().exactOptional(),
    cacheWrite: z.number().nonnegative().exactOptional(),
  }).exactOptional(),
})

/** One cached directory copy, valid only for the URL it was fetched from. */
const cachedDirectory = z.object({
  url: z.string(),
  fetchedAt: z.iso.datetime(),
  models: z.record(z.string(), z.record(z.string(), modelEntry)),
})

/** A cached copy that fails validation is moved aside and refetched; nothing else reads it. */
const metadataDomain = defineDomain({
  name: 'llm_pi_ai_metadata',
  version: 1,
  invalidRecords: 'backup-and-skip',
  tables: { directory: domainTable<'current', z.infer<typeof cachedDirectory>>(cachedDirectory) },
})

/** Inputs of one refresh loop. */
export interface MetadataRefreshOptions {
  /** Directory URL, already validated. */
  readonly url: string
  /** Hours between refreshes. */
  readonly intervalHours: number
  /** Where the entries in force live. */
  readonly store: ModelMetadataStore
}

/**
 * Start the refresh loop under `ctx`; everything it opens or schedules ends
 * with the context.
 * @param ctx - plugin context that owns the timer and the cache domain.
 * @param options - source, interval, and the store each refresh replaces.
 */
export function startMetadataRefresh(ctx: Context, options: MetadataRefreshOptions): void {
  const { url, store } = options
  const intervalMs = options.intervalHours * 3_600_000
  const abort = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let domain: Domain<typeof metadataDomain> | undefined

  const refresh = async (): Promise<void> => {
    try {
      const index = await fetchModelMetadata(url, abort.signal)
      store.replace(index)
      await domain?.table('directory').put('current', {
        url,
        fetchedAt: new Date().toISOString(),
        models: storeModelMetadata(index),
      })
    } catch (error: unknown) {
      if (abort.signal.aborted) return
      ctx.logger.warn(`llm-pi-ai: refreshing model metadata from ${url} failed; keeping the previous copy: ${String(error)}`)
    }
  }

  /** Arm the next refresh unless the context has ended. */
  const schedule = (): void => {
    if (abort.signal.aborted) return
    timer = setTimeout(() => {
      void refresh().finally(schedule)
    }, intervalMs)
    timer.unref()
  }

  const start = async (): Promise<void> => {
    let fetchedAt: number | undefined
    const facility = ctx.get('storageDomain')
    if (facility !== undefined) {
      try {
        domain = await facility.open(metadataDomain)
        const cached = domain.table('directory').get('current')
        if (cached?.url === url) {
          fetchedAt = Date.parse(cached.fetchedAt)
          store.replace(loadModelMetadata(cached.models))
        }
      } catch (error: unknown) {
        ctx.logger.warn(`llm-pi-ai: the model metadata cache is unavailable; it will not persist: ${String(error)}`)
      }
    }
    if (fetchedAt === undefined || Date.now() - fetchedAt >= intervalMs) await refresh()
    schedule()
  }

  ctx.effect(() => {
    void start()
    return () => {
      abort.abort()
      if (timer !== undefined) clearTimeout(timer)
      void domain?.close()
    }
  }, 'llm-pi-ai.metadataRefresh')
}
