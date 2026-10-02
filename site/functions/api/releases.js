import { PLATFORMS, resolveRelease } from '../../shared/releases.js'

/**
 * GET /api/releases: the newest installer per platform, or null where none is
 * published, for the download cards.
 * @param {EventContext<{ DOWNLOAD_ORIGIN: string }, string, unknown>} context - Pages Function context.
 * @returns {Promise<Response>} JSON keyed by platform.
 */
export async function onRequestGet({ env }) {
  const entries = await Promise.all(Object.keys(PLATFORMS).map(async platform => {
    try {
      return [platform, await resolveRelease(env.DOWNLOAD_ORIGIN, platform)]
    }
    catch (error) {
      console.error(`releases: ${platform}: ${error instanceof Error ? error.message : String(error)}`)
      return [platform, null]
    }
  }))
  return Response.json(Object.fromEntries(entries), {
    headers: { 'cache-control': 'public, max-age=300' },
  })
}
