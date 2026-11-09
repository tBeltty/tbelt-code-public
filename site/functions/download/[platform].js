import { PLATFORMS, resolveRelease } from '../../shared/releases.js'

/**
 * GET /download/<windows|mac|linux>: redirect to the newest installer in the
 * update bucket, or back to the download section when none is published yet.
 * @param {EventContext<{ DOWNLOAD_ORIGIN: string }, 'platform', unknown>} context - Pages Function context.
 * @returns {Promise<Response>} A redirect.
 */
export async function onRequestGet({ params, env, request }) {
  const platform = String(params.platform).toLowerCase()
  if (!(platform in PLATFORMS)) return new Response('Unknown platform', { status: 404 })
  const release = await resolveRelease(env.DOWNLOAD_ORIGIN, platform)
  if (release === null) {
    return Response.redirect(new URL(`/?pending=${platform}#download`, request.url).toString(), 302)
  }
  return new Response(null, {
    status: 302,
    headers: { 'location': release.url, 'cache-control': 'public, max-age=300' },
  })
}
